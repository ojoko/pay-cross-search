const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 9_000;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const MAX_RESULTS = 150;
const responseCache = new Map();
const clientWindows = new Map();

const PAY_TAGS = {
    paypay: ['payment:paypay'],
    rakuten: ['payment:rakuten_pay', 'payment:rakutenpay'],
    dbarai: ['payment:d_barai', 'payment:dbbarai', 'payment:dbarai'],
    aupay: ['payment:au_pay', 'payment:aupay'],
    merpay: ['payment:merpay'],
    aeonpay: ['payment:aeon_pay', 'payment:aeonpay']
};
const ALL_PAY_IDS = Object.keys(PAY_TAGS);

const CATEGORY_QUERY = {
    convenience: '["shop"="convenience"]',
    supermarket: '["shop"~"supermarket|chemist|department_store|mall"]',
    restaurant: '["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court"]',
    appliance: '["shop"~"electronics|appliance|computer|mobile_phone"]'
};

function escapeOverpassRegex(value) {
    return String(value || '')
        .replace(/[\\^$.*+?()[\]{}|"]/g, '\\$&')
        .slice(0, 80);
}

function isRateLimited(request) {
    const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const clientKey = forwarded || request.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const current = clientWindows.get(clientKey);
    if (!current || now - current.startedAt >= 10 * 60 * 1000) {
        clientWindows.set(clientKey, { startedAt: now, count: 1 });
        return false;
    }
    current.count += 1;
    return current.count > 30;
}

function setBoundedCache(key, payload) {
    if (responseCache.size >= 200 && !responseCache.has(key)) {
        responseCache.delete(responseCache.keys().next().value);
    }
    responseCache.set(key, { cachedAt: Date.now(), payload });
}

function buildQuery(lat, lng, radius, keyword) {
    const categoryAliases = {
        'コンビニ': 'convenience',
        'スーパー': 'supermarket',
        '飲食店': 'restaurant',
        'レストラン': 'restaurant',
        'カフェ': 'restaurant',
        '家電': 'appliance',
        '家電量販店': 'appliance'
    };
    const categoryKey = CATEGORY_QUERY[keyword] ? keyword : (categoryAliases[keyword] || '');

    let selectors;
    if (keyword === '薬局' || keyword === 'ドラッグストア') {
        selectors = [
            `nwr(around:${radius},${lat},${lng})["amenity"="pharmacy"]["name"];`,
            `nwr(around:${radius},${lat},${lng})["shop"="chemist"]["name"];`
        ];
    } else if (categoryKey) {
        selectors = [`nwr(around:${radius},${lat},${lng})${CATEGORY_QUERY[categoryKey]}["name"];`];
    } else if (keyword) {
        const pattern = escapeOverpassRegex(keyword);
        selectors = [
            `nwr(around:${radius},${lat},${lng})["name"~"${pattern}",i];`,
            `nwr(around:${radius},${lat},${lng})["brand"~"${pattern}",i];`,
            `nwr(around:${radius},${lat},${lng})["operator"~"${pattern}",i];`
        ];
    } else {
        selectors = [
            `nwr(around:${radius},${lat},${lng})["shop"]["name"];`,
            `nwr(around:${radius},${lat},${lng})["amenity"~"restaurant|cafe|fast_food|bar|pub|food_court|pharmacy|clinic|hospital|fuel"]["name"];`
        ];
    }

    return `[out:json][timeout:8];(${selectors.join('')});out tags center ${MAX_RESULTS};`;
}

function getCategory(tags = {}) {
    const shop = tags.shop || '';
    const amenity = tags.amenity || '';
    if (/electronics|appliance|computer|mobile_phone/.test(shop)) return 'appliance';
    if (/restaurant|cafe|fast_food|bar|pub|food_court/.test(amenity)) return 'restaurant';
    if (shop === 'convenience') return 'convenience';
    return 'supermarket';
}

function getAcceptedPays(tags = {}) {
    const statuses = Object.fromEntries(ALL_PAY_IDS.map(payId => {
        const tag = PAY_TAGS[payId].find(candidate => tags[candidate] !== undefined);
        return [payId, tag ? String(tags[tag]).toLowerCase() : 'unknown'];
    }));
    const accepted = ALL_PAY_IDS.filter(payId => statuses[payId] !== 'no');
    const confirmedPays = ALL_PAY_IDS.filter(payId => statuses[payId] === 'yes');
    return {
        acceptedPays: accepted,
        confirmedPays,
        paymentsVerified: ALL_PAY_IDS.every(payId => statuses[payId] === 'yes' || statuses[payId] === 'no')
    };
}

function buildAddress(tags = {}) {
    const structured = [
        tags['addr:province'],
        tags['addr:city'],
        tags['addr:suburb'],
        tags['addr:quarter'],
        tags['addr:street'],
        tags['addr:housenumber']
    ].filter(Boolean).join('');
    return structured || tags['addr:full'] || tags['contact:address'] || '住所情報なし（OpenStreetMap）';
}

function normalizeElement(element, centerLat, centerLng) {
    const tags = element.tags || {};
    const isStore = Boolean(tags.shop) ||
        /restaurant|cafe|fast_food|bar|pub|food_court|pharmacy|clinic|hospital|fuel/.test(tags.amenity || '');
    if (!isStore) return null;
    const lat = Number(element.lat ?? element.center?.lat);
    const lng = Number(element.lon ?? element.center?.lon);
    if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const paymentInfo = getAcceptedPays(tags);
    return {
        id: `osm-${element.type}-${element.id}`,
        osmType: element.type,
        osmId: element.id,
        name: String(tags['name:ja'] || tags.name).slice(0, 160),
        category: getCategory(tags),
        lat,
        lng,
        address: buildAddress(tags),
        areaKeys: [
            tags.name,
            tags.brand,
            tags.operator,
            tags.shop,
            tags.amenity,
            tags['addr:city']
        ].filter(Boolean).map(String),
        acceptedPays: paymentInfo.acceptedPays,
        confirmedPays: paymentInfo.confirmedPays,
        paymentsVerified: paymentInfo.paymentsVerified,
        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        campaigns: {},
        distanceHint: { centerLat, centerLng }
    };
}

async function fetchOverpass(query) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(OVERPASS_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'User-Agent': 'PayCrossPro/1.0 (+https://pay-cross-search.vercel.app/)'
            },
            body: new URLSearchParams({ data: query }).toString(),
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

module.exports = async function handler(request, response) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');

    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        return response.status(405).json({ error: 'method_not_allowed' });
    }
    if (isRateLimited(request)) {
        response.setHeader('Retry-After', '600');
        return response.status(429).json({ error: 'rate_limited' });
    }

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const radius = Math.min(5000, Math.max(500, Math.round(Number(body.radius) || 3000)));
    const keyword = String(body.keyword || '').trim().slice(0, 80);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180) {
        return response.status(400).json({ error: 'invalid_location' });
    }

    const cacheKey = `${lat.toFixed(3)}|${lng.toFixed(3)}|${radius}|${keyword.toLowerCase()}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return response.status(200).json({ ...cached.payload, retrieval: 'server_cache' });
    }

    try {
        const query = buildQuery(lat, lng, radius, keyword);
        const payload = await fetchOverpass(query);
        const seen = new Set();
        const stores = (Array.isArray(payload.elements) ? payload.elements : [])
            .map(element => normalizeElement(element, lat, lng))
            .filter(store => {
                if (!store) return false;
                const key = `${store.name.toLowerCase()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, MAX_RESULTS);

        const result = {
            checked_at: new Date().toISOString(),
            retrieval: 'openstreetmap_live',
            radius,
            keyword,
            stores
        };
        setBoundedCache(cacheKey, result);
        return response.status(200).json(result);
    } catch (error) {
        if (cached) {
            return response.status(200).json({
                ...cached.payload,
                retrieval: 'server_cache_stale',
                stale: true
            });
        }
        return response.status(502).json({
            error: error.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unavailable'
        });
    }
};
