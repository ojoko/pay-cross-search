const https = require('node:https');
const { constants: cryptoConstants } = require('node:crypto');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 4_500;
const MAX_DETAIL_FETCHES = 3;
const PAY_IDS = new Set(['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay']);
const lookupCache = new Map();
const DETAIL_HOST_SUFFIXES = {
    rakuten: ['rakuten.co.jp', 'rakuten-static.com'],
    dbarai: ['docomo.ne.jp'],
    aupay: ['auone.jp', 'aupay.wallet.auone.jp']
};

const SOURCE_META = {
    paypay: {
        name: 'PayPay公式（アプリで確認）',
        url: 'https://paypay.ne.jp/guide/map/',
        coverage: 'app_only'
    },
    rakuten: {
        name: '楽天ペイ公式キャンペーン',
        url: 'https://pay.rakuten.co.jp/campaign/',
        coverage: 'official_web_limited'
    },
    dbarai: {
        name: 'd払い公式キャンペーン',
        url: 'https://service.smt.docomo.ne.jp/keitai_payment/campaign/',
        coverage: 'official_web_store_match'
    },
    aupay: {
        name: 'au PAY公式キャンペーン',
        url: 'https://aupay.wallet.auone.jp/campaign/',
        coverage: 'official_web_store_match'
    },
    merpay: {
        name: 'メルペイ公式（アプリで確認）',
        url: 'https://jp-news.mercari.com/categories/merpay/',
        coverage: 'manual_confirmation'
    },
    aeonpay: {
        name: 'AEON Pay公式（対象店舗条件を確認）',
        url: 'https://www.aeon.co.jp/campaign/',
        coverage: 'manual_confirmation'
    }
};

function normalizeText(value) {
    return String(value || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;|&#160;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[\s　]+/g, ' ')
        .trim();
}

function canonicalize(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[‐‑‒–—―ーｰ・･\s　（）()[\]【】「」『』]/g, '')
        .replace(/株式会社|有限会社|合同会社/g, '');
}

function getStoreTerms(store) {
    const nameParts = store.name.split(/[\s　・／/()（）【】]+/).filter(Boolean);
    const rawParts = [
        store.name,
        ...nameParts
    ];
    const terms = new Set();
    rawParts.forEach(part => {
        const normalized = canonicalize(part);
        if (normalized.length >= 2) terms.add(normalized);
        const withoutBranch = normalized.replace(/(?:本店|支店|営業所|ショップ|ストア|店)$/u, '');
        if (withoutBranch.length >= 2) terms.add(withoutBranch);
    });
    const result = [...terms].sort((a, b) => b.length - a.length).slice(0, 8);
    result.exactTerm = canonicalize(store.name);
    result.branchTerms = nameParts.slice(1).flatMap(part => {
        const normalized = canonicalize(part);
        const root = normalized.replace(/(?:東口|西口|南口|北口)?(?:本店|支店|店|店舗)$/u, '');
        return [normalized, root].filter(term => term.length >= 2);
    });
    return result;
}

function getRegionTerms(address) {
    return [...new Set(
        (String(address || '').match(/[^\s　,、]{2,12}(?:市|区|町|村)/g) || [])
            .map(canonicalize)
            .filter(term => term.length >= 2)
    )].slice(0, 5);
}

function assessStoreMatch(text, storeTerms, regionTerms) {
    const normalized = canonicalize(text);
    const storeTerm = storeTerms.find(term => normalized.includes(term));
    const regionTerm = regionTerms.find(term => normalized.includes(term));
    if (!storeTerm && !regionTerm) return null;

    const plainText = normalizeText(text);
    const exactStoreMatch = Boolean(storeTerm && storeTerm === (storeTerms.exactTerm || storeTerms[0]));
    const branchAreaMatch = (storeTerms.branchTerms || []).some(term => normalized.includes(term));
    const branchRestricted = Boolean(
        storeTerm && !exactStoreMatch && !regionTerm &&
        /対象店舗限定|店舗限定|一部店舗|(?:店|店舗)のみ|[^\s]{2,10}(?:店|店舗)[^。]{0,12}(?:限定|対象)/u.test(plainText)
    );
    if (branchRestricted) {
        if (branchAreaMatch) {
            return {
                status: 'conditional',
                reason: '公式情報のブランド名と店舗エリアが一致・対象支店は要確認'
            };
        }
        return {
            status: 'candidate',
            reason: 'ブランド名は一致したが対象支店が未確認'
        };
    }

    const excluded = /店頭.{0,25}対象外|店舗.{0,20}対象外|対象外.{0,20}(?:店舗|加盟店)|コード支払.{0,20}対象外/u.test(plainText);
    if (excluded) {
        if (storeTerm && !exactStoreMatch && !regionTerm && !/全店|全店舗/u.test(plainText)) {
            return {
                status: 'conditional',
                reason: 'ブランド名は一致したが対象外となる支店は未確定'
            };
        }
        return {
            status: 'excluded',
            reason: storeTerm ? '店舗名が公式の対象外条件に一致' : '地域条件に一致したが店頭支払いは対象外'
        };
    }
    if (exactStoreMatch) return { status: 'confirmed', reason: `公式情報の店舗名一致（${storeTerm}）` };
    if (storeTerm) return { status: 'conditional', reason: `公式情報のブランド名一致（${storeTerm}）・対象支店は要確認` };
    return { status: 'conditional', reason: `公式情報の地域条件一致（${regionTerm}）` };
}

function parseRate(text) {
    const match = normalizeText(text).match(/(?:最大|抽選で|合計)?\s*(\d+(?:\.\d+)?)\s*[%％]\s*(?:還元|ポイント|戻|付与|分)?/u);
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value / 100 : null;
}

function parseCap(text) {
    const normalized = normalizeText(text);
    const patterns = [
        /(?:1回|一回|決済1回)[^。]{0,30}(?:上限|最大)(?:は|:|：)?\s*([\d,]+)\s*(?:ポイント|pt|円)/iu,
        /(?:上限|最大)(?:は|:|：)?\s*([\d,]+)\s*(?:ポイント|pt|円)[^。]{0,20}(?:1回|一回|決済)/iu
    ];
    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (!match) continue;
        const value = Number(match[1].replace(/,/g, ''));
        if (Number.isFinite(value) && value >= 0) return value;
    }
    return null;
}

function makeCampaign(payId, item, match, checkedAt) {
    const text = `${item.title || ''} ${item.description || ''} ${item.detailText || ''}`;
    const rate = parseRate(text);
    const cap = parseCap(text);
    const sourceUrl = String(item.url || SOURCE_META[payId].url);
    return {
        id: `${payId}-${canonicalize(sourceUrl || item.title).slice(-80)}`,
        title: String(item.title || '公式キャンペーン').slice(0, 240),
        target_pay: payId,
        bonus_rate: rate,
        max_per_txn: cap,
        rate_mode: item.rateMode || 'bonus',
        verification_status: match.status === 'confirmed' && rate !== null ? 'verified' : match.status,
        eligibility_status: match.status,
        match_reason: match.reason,
        benefit_text: String(item.description || item.title || '').slice(0, 360),
        start_date: item.startDate || null,
        end_date: item.endDate || null,
        source_url: sourceUrl,
        source_fetched_at: checkedAt,
        retrieval: 'official_web_live',
        stackable: false
    };
}

function extractAnchors(html, baseUrl) {
    const results = [];
    const seen = new Set();
    const pattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
        const altText = [...match[2].matchAll(/\balt=["']([^"']+)["']/gi)].map(value => value[1]).join(' ');
        const title = normalizeText(`${match[2]} ${altText}`);
        if (title.length < 5 || !/キャンペーン|還元|ポイント|クーポン|特典|当たる/u.test(title)) continue;
        let url;
        try {
            url = new URL(match[1], baseUrl).toString();
        } catch {
            continue;
        }
        const key = `${title}|${url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ title, description: title, url });
    }
    return results;
}

function isAllowedDetailUrl(payId, value) {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'https:') return false;
        return (DETAIL_HOST_SUFFIXES[payId] || []).some(suffix =>
            parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`)
        );
    } catch {
        return false;
    }
}

function httpsGetText(url, timeoutMs = REQUEST_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                Accept: 'text/html,application/json,*/*',
                'Accept-Language': 'ja',
                'User-Agent': 'PayCrossPro/1.0 (+https://pay-cross-search.vercel.app/)',
                Referer: 'https://service.smt.docomo.ne.jp/keitai_payment/campaign/'
            },
            secureOptions: cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT
        }, result => {
            if (result.statusCode < 200 || result.statusCode >= 300) {
                result.resume();
                reject(new Error(`HTTP ${result.statusCode}`));
                return;
            }
            result.setEncoding('utf8');
            let data = '';
            result.on('data', chunk => {
                if (data.length < 2_000_000) data += chunk;
            });
            result.on('end', () => resolve(data));
        });
        request.setTimeout(timeoutMs, () => request.destroy(Object.assign(new Error('timeout'), { name: 'AbortError' })));
        request.on('error', reject);
    });
}

async function fetchText(url, timeoutMs = REQUEST_TIMEOUT_MS) {
    if (/https:\/\/(?:service\.)?smt\.docomo\.ne\.jp\//i.test(url)) {
        return httpsGetText(url, timeoutMs);
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const result = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/json',
                'Accept-Language': 'ja',
                'User-Agent': 'PayCrossPro/1.0 (+https://pay-cross-search.vercel.app/)'
            }
        });
        if (!result.ok) throw new Error(`HTTP ${result.status}`);
        return (await result.text()).slice(0, 2_000_000);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function enrichMatchedItems(payId, items, storeTerms, regionTerms) {
    const candidates = items
        .map(item => ({ item, initial: assessStoreMatch(`${item.title} ${item.description}`, storeTerms, regionTerms) }))
        .filter(value => value.initial)
        .slice(0, MAX_DETAIL_FETCHES);

    return Promise.all(candidates.map(async ({ item, initial }) => {
        if (!item.url || initial.status === 'excluded' || !isAllowedDetailUrl(payId, item.url)) {
            return { item, match: initial };
        }
        try {
            const html = await fetchText(item.url, 3_500);
            const detailText = normalizeText(html);
            const detailedMatch = assessStoreMatch(detailText, storeTerms, regionTerms) || initial;
            return { item: { ...item, detailText }, match: detailedMatch };
        } catch {
            return { item, match: initial };
        }
    })).then(results => results.filter(result => result.match.status !== 'candidate'));
}

async function lookupAuPay(storeTerms, regionTerms, checkedAt) {
    const raw = await fetchText('https://api.aupay.wallet.auone.jp/campaign-list?user_top_flag=false');
    const payload = JSON.parse(raw);
    const active = Array.isArray(payload?.campaign?.being_held) ? payload.campaign.being_held : [];
    const items = active.map(item => ({
        title: item.name || item.banner_text,
        description: item.banner_text || item.name,
        url: item.banner_url,
        startDate: String(item.campaign_publish_date_from || '').slice(0, 10).replaceAll('/', '-') || null,
        endDate: String(item.campaign_publish_date_to || '').slice(0, 10).replaceAll('/', '-') || null
    }));
    return enrichMatchedItems('aupay', items, storeTerms, regionTerms)
        .then(matches => matches.map(({ item, match }) => makeCampaign('aupay', item, match, checkedAt)));
}

async function lookupDbarai(storeTerms, regionTerms, checkedAt) {
    const params = {
        requestKind: 1,
        inputData: {
            param: [{
                start: 1,
                number: 300,
                frameId: 'g23',
                OS: 2,
                getColumn: 'cid,title,genre1,genre2,genre3,genre4,pageURL1,startDate,endDate,reserved1,reserved2,reserved3,reserved4'
            }]
        }
    };
    const callback = 'paycross';
    const url = `https://smt.docomo.ne.jp/dmpf/tagereco/owdrmd/recommendAccept/index.do?callback=${callback}&params=${encodeURIComponent(JSON.stringify(params))}`;
    const jsonp = await httpsGetText(url);
    const rawJson = jsonp.trim().replace(new RegExp(`^${callback}\\(`), '').replace(/\);?\s*$/, '');
    const payload = JSON.parse(rawJson);
    const contents = Array.isArray(payload?.items?.[0]?.contents) ? payload.items[0].contents : [];
    const items = contents
        .filter(item => String(item.reserved2 || '').includes('town') || String(item.reserved1 || '').includes('店舗'))
        .map(item => ({
            title: item.title,
            description: `${item.title || ''} ${item.reserved1 || ''} ${item.reserved3 || ''} ${item.reserved4 || ''}`,
            url: item.pageURL1,
            startDate: String(item.startDate || '').slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || null,
            endDate: String(item.endDate || '').slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || null
        }));
    return enrichMatchedItems('dbarai', items, storeTerms, regionTerms)
        .then(matches => matches.map(({ item, match }) => makeCampaign('dbarai', item, match, checkedAt)));
}

async function lookupRakuten(storeTerms, regionTerms, checkedAt) {
    const campaignUrl = SOURCE_META.rakuten.url;
    const excludedUrl = 'https://pay.rakuten.co.jp/topics/pointprogram/excluded-shops/';
    const [campaignHtml, excludedHtml] = await Promise.all([
        fetchText(campaignUrl),
        fetchText(excludedUrl)
    ]);
    const items = extractAnchors(campaignHtml, campaignUrl);
    const matches = await enrichMatchedItems('rakuten', items, storeTerms, regionTerms);
    const campaigns = matches.map(({ item, match }) => makeCampaign('rakuten', item, match, checkedAt));

    const excludedMatch = assessStoreMatch(excludedHtml, storeTerms, []);
    if (excludedMatch) {
        campaigns.push(makeCampaign('rakuten', {
            title: '楽天ペイ コード・QR払い 最大1.5％還元の対象外店舗',
            description: '公式の還元対象外店舗一覧に店舗名が一致しました',
            url: excludedUrl,
            rateMode: 'base_exclusion'
        }, {
            status: 'excluded',
            reason: '公式の還元対象外店舗一覧に店舗名が一致'
        }, checkedAt));
    }
    return campaigns;
}

async function lookupOfficialPay(payId, store) {
    const checkedAt = new Date().toISOString();
    const meta = SOURCE_META[payId];
    const storeTerms = getStoreTerms(store);
    const regionTerms = getRegionTerms(store.address);
    const cacheKey = `${payId}|${storeTerms.join('|')}|${regionTerms.join('|')}`;
    const cached = lookupCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return {
            ...cached.value,
            checked_at: cached.value.checked_at,
            retrieval: 'server_cache',
            campaigns: cached.value.campaigns.map(campaign => ({ ...campaign, retrieval: 'server_cache' }))
        };
    }

    if (!['rakuten', 'dbarai', 'aupay'].includes(payId)) {
        return {
            pay_id: payId,
            ...meta,
            status: 'manual_confirmation',
            checked_at: checkedAt,
            retrieval: 'app_confirmation_required',
            campaigns: [],
            campaign_hints: []
        };
    }

    try {
        const campaigns = payId === 'aupay'
            ? await lookupAuPay(storeTerms, regionTerms, checkedAt)
            : payId === 'dbarai'
                ? await lookupDbarai(storeTerms, regionTerms, checkedAt)
                : await lookupRakuten(storeTerms, regionTerms, checkedAt);
        const value = {
            pay_id: payId,
            ...meta,
            status: 'reachable',
            checked_at: checkedAt,
            retrieval: 'official_web_live',
            campaigns,
            campaign_hints: campaigns.map(campaign => ({
                title: campaign.title,
                url: campaign.source_url,
                verification_status: campaign.verification_status,
                eligibility_status: campaign.eligibility_status,
                match_reason: campaign.match_reason
            }))
        };
        lookupCache.set(cacheKey, { cachedAt: Date.now(), value });
        return value;
    } catch (error) {
        return {
            pay_id: payId,
            ...meta,
            status: 'unavailable',
            checked_at: checkedAt,
            retrieval: 'fetch_failed',
            error: error.name === 'AbortError' ? 'timeout' : 'request_failed',
            campaigns: [],
            campaign_hints: []
        };
    }
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
        id: String(body.store?.id || '').slice(0, 120),
        name: String(body.store?.name || '').trim().slice(0, 160),
        address: String(body.store?.address || '').trim().slice(0, 240)
    };
    const acceptedPays = Array.isArray(body.store?.acceptedPays)
        ? [...new Set(body.store.acceptedPays.filter(payId => PAY_IDS.has(payId)))].slice(0, 6)
        : [];

    if (!store.id || !store.name || acceptedPays.length === 0) {
        return response.status(400).json({ error: 'invalid_store' });
    }

    const sources = await Promise.all(acceptedPays.map(payId => lookupOfficialPay(payId, store)));
    const campaigns = sources.flatMap(source => source.campaigns || []);
    return response.status(200).json({
        store_id: store.id,
        checked_at: new Date().toISOString(),
        cache_ttl_seconds: CACHE_TTL_MS / 1000,
        campaigns,
        sources: sources.map(({ campaigns: ignored, ...source }) => source)
    });
};

module.exports._test = {
    assessStoreMatch,
    canonicalize,
    getRegionTerms,
    getStoreTerms,
    makeCampaign,
    parseCap,
    parseRate
};
