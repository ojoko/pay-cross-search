const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;
const PAY_IDS = new Set(['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay']);
const sourceCache = new Map();

const OFFICIAL_CAMPAIGN_SOURCES = {
    paypay: {
        name: 'PayPay公式キャンペーン',
        url: 'https://paypay.ne.jp/event/'
    },
    rakuten: {
        name: '楽天ペイ公式キャンペーン',
        url: 'https://pay.rakuten.co.jp/campaign/'
    },
    dbarai: {
        name: 'd払い公式キャンペーン',
        url: 'https://service.smt.docomo.ne.jp/keitai_payment/campaign/'
    },
    aupay: {
        name: 'au PAY公式キャンペーン',
        url: 'https://aupay.wallet.auone.jp/campaign/'
    },
    merpay: {
        name: 'メルペイ公式ニュース',
        url: 'https://jp-news.mercari.com/categories/merpay/'
    },
    aeonpay: {
        name: 'イオン公式キャンペーン',
        url: 'https://www.aeon.co.jp/campaign/'
    }
};

function readCampaignSnapshot() {
    const filePath = path.join(__dirname, '..', 'production_live_data.json');
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(payload.active_campaigns) ? payload.active_campaigns : [];
}

function normalizeText(value) {
    return String(value || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function extractCampaignHints(html, sourceUrl, terms) {
    const hints = [];
    const seen = new Set();
    const anchorPattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = anchorPattern.exec(html)) !== null && hints.length < 8) {
        const title = normalizeText(match[2]);
        if (title.length < 8 || title.length > 180) continue;

        const lowerTitle = title.toLowerCase();
        const hasCampaignWord = /キャンペーン|還元|ポイント|クーポン|特典/.test(title);
        const hasRelevantTerm = terms.some(term =>
            term && term.length >= 2 && lowerTitle.includes(term.toLowerCase())
        );
        if (!hasCampaignWord || !hasRelevantTerm) continue;

        let url;
        try {
            url = new URL(match[1], sourceUrl).toString();
        } catch {
            continue;
        }
        const key = `${title}|${url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hints.push({ title, url, verification_status: 'unverified' });
    }

    return hints;
}

async function fetchOfficialSource(source, terms) {
    const cached = sourceCache.get(source.url);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return {
            name: source.name,
            url: source.url,
            status: 'reachable',
            checked_at: cached.checkedAt,
            retrieval: 'server_cache',
            campaign_hints: extractCampaignHints(cached.html, source.url, terms)
        };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const checkedAt = new Date().toISOString();

    try {
        const response = await fetch(source.url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'Accept-Language': 'ja',
                'User-Agent': 'PayCrossPro/1.0 (+https://pay-cross-search.vercel.app/)'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = (await response.text()).slice(0, 2_000_000);
        const value = {
            name: source.name,
            url: source.url,
            status: 'reachable',
            checked_at: checkedAt,
            retrieval: 'official_web_live',
            campaign_hints: extractCampaignHints(html, source.url, terms)
        };
        sourceCache.set(source.url, { cachedAt: Date.now(), checkedAt, html });
        return value;
    } catch (error) {
        if (cached) {
            return {
                name: source.name,
                url: source.url,
                status: 'reachable',
                checked_at: cached.checkedAt,
                retrieval: 'server_cache_stale',
                stale: true,
                campaign_hints: extractCampaignHints(cached.html, source.url, terms)
            };
        }
        return {
            name: source.name,
            url: source.url,
            status: 'unavailable',
            checked_at: checkedAt,
            retrieval: 'fetch_failed',
            error: error.name === 'AbortError' ? 'timeout' : 'request_failed',
            campaign_hints: []
        };
    } finally {
        clearTimeout(timeoutId);
    }
}

function isCampaignActive(campaign, today) {
    if (campaign.verification_status && campaign.verification_status !== 'verified') return false;
    if (campaign.start_date && campaign.start_date > today) return false;
    if (campaign.end_date && campaign.end_date < today) return false;
    return true;
}

function matchesStore(campaign, store) {
    if (!campaign.target_region) return true;
    const haystack = `${store.name} ${store.address}`.toLowerCase();
    return haystack.includes(String(campaign.target_region).toLowerCase());
}

module.exports = async function handler(request, response) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');

    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).json({ error: 'method_not_allowed' });
    }

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const store = {
        id: String(body.store?.id || '').slice(0, 80),
        name: String(body.store?.name || '').trim().slice(0, 160),
        address: String(body.store?.address || '').trim().slice(0, 240)
    };
    const acceptedPays = Array.isArray(body.store?.acceptedPays)
        ? [...new Set(body.store.acceptedPays.filter(payId => PAY_IDS.has(payId)))].slice(0, 6)
        : [];

    if (!store.id || !store.name || acceptedPays.length === 0) {
        return response.status(400).json({ error: 'invalid_store' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const snapshotCampaigns = readCampaignSnapshot()
        .filter(campaign =>
            acceptedPays.includes(campaign.target_pay) &&
            isCampaignActive(campaign, today) &&
            matchesStore(campaign, store)
        )
        .map(campaign => ({
            ...campaign,
            data_origin: 'server_snapshot',
            retrieval: 'server_cache',
            stackable: campaign.stackable === true
        }));

    const terms = [
        store.name,
        ...store.name.split(/[\s　・／/]+/),
        ...(store.address.match(/[^\s]{2,8}[市区町村]/g) || [])
    ].filter(Boolean);
    const sourceResults = await Promise.all(
        acceptedPays.map(payId =>
            fetchOfficialSource(OFFICIAL_CAMPAIGN_SOURCES[payId], terms)
                .then(result => ({ pay_id: payId, ...result }))
        )
    );

    return response.status(200).json({
        store_id: store.id,
        checked_at: new Date().toISOString(),
        cache_ttl_seconds: CACHE_TTL_MS / 1000,
        campaigns: snapshotCampaigns,
        sources: sourceResults
    });
};
