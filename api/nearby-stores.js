const CACHE_TTL_MS = 10 * 60 * 1000;
const OVERPASS_TIMEOUT_MS = 4_000;
const PHOTON_TIMEOUT_MS = 4_000;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const PHOTON_URL = 'https://photon.komoot.io';
const MAX_RESULTS = 150;
const PHOTON_MAX_RESULTS = 100;
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

    return `[out:json][timeout:3];(${selectors.join('')});out tags center ${MAX_RESULTS};`;
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
    const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
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

function getDistanceMeters(lat1, lng1, lat2, lng2) {
    const toRadians = value => value * Math.PI / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;
    const safeA = Math.min(1, Math.max(0, a));
    return 6371000 * 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
}

function getSearchBounds(lat, lng, radius) {
    const latDelta = radius / 111_320;
    const safeCos = Math.max(0.01, Math.abs(Math.cos(lat * Math.PI / 180)));
    const lngDelta = radius / (111_320 * safeCos);
    return [
        Math.max(-180, lng - lngDelta),
        Math.max(-90, lat - latDelta),
        Math.min(180, lng + lngDelta),
        Math.min(90, lat + latDelta)
    ];
}

function normalizePhotonFeature(feature, centerLat, centerLng, radius) {
    const properties = feature?.properties || {};
    const coordinates = feature?.geometry?.coordinates;
    const lng = Number(coordinates?.[0]);
    const lat = Number(coordinates?.[1]);
    const osmKey = String(properties.osm_key || '');
    const osmValue = String(properties.osm_value || '');
    const isStore = osmKey === 'shop' ||
        (osmKey === 'amenity' &&
            /restaurant|cafe|fast_food|bar|pub|food_court|pharmacy|clinic|hospital|fuel/.test(osmValue));
    if (!isStore || !properties.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (getDistanceMeters(centerLat, centerLng, lat, lng) > radius + 20) return null;

    const osmType = { N: 'node', W: 'way', R: 'relation' }[properties.osm_type];
    const osmId = Number(properties.osm_id);
    const tags = { [osmKey]: osmValue };
    const address = [
        properties.state,
        properties.city,
        properties.district,
        properties.street,
        properties.housenumber
    ].filter(Boolean).join('');

    return {
        id: Number.isFinite(osmId) && osmType
            ? `osm-${osmType}-${osmId}`
            : `photon-${lat.toFixed(6)}-${lng.toFixed(6)}-${String(properties.name).slice(0, 40)}`,
        osmType: osmType || '',
        osmId: Number.isFinite(osmId) ? osmId : null,
        name: String(properties.name).slice(0, 160),
        category: getCategory(tags),
        lat,
        lng,
        address: address || '住所情報なし（OpenStreetMap）',
        areaKeys: [
            properties.name,
            properties.city,
            properties.district,
            properties.street,
            osmKey,
            osmValue
        ].filter(Boolean).map(String),
        acceptedPays: [...ALL_PAY_IDS],
        confirmedPays: [],
        paymentsVerified: false,
        osmUrl: Number.isFinite(osmId) && osmType
            ? `https://www.openstreetmap.org/${osmType}/${osmId}`
            : 'https://www.openstreetmap.org/',
        campaigns: {},
        distanceHint: { centerLat, centerLng }
    };
}

async function fetchPhoton(lat, lng, radius, keyword) {
    const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        limit: String(PHOTON_MAX_RESULTS)
    });
    let path;
    if (keyword) {
        params.set('q', keyword);
        params.set('bbox', getSearchBounds(lat, lng, radius).join(','));
        params.set('countrycode', 'JP');
        path = '/api/';
    } else {
        params.set('radius', String(radius / 1000));
        params.append('osm_tag', 'shop');
        params.append('osm_tag', 'amenity');
        path = '/reverse';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PHOTON_TIMEOUT_MS);
    try {
        const photonResponse = await fetch(`${PHOTON_URL}${path}?${params}`, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PayCrossPro/1.0 (+https://pay-cross-search.vercel.app/)'
            },
            signal: controller.signal
        });
        if (!photonResponse.ok) throw new Error(`HTTP ${photonResponse.status}`);
        return await photonResponse.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

function normalizeStores(items, normalize) {
    const seen = new Set();
    return items
        .map(normalize)
        .filter(store => {
            if (!store) return false;
            const key = `${store.name.toLowerCase()}|${store.lat.toFixed(5)}|${store.lng.toFixed(5)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, MAX_RESULTS);
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

    let overpassError;
    try {
        const query = buildQuery(lat, lng, radius, keyword);
        const payload = await fetchOverpass(query);
        const stores = normalizeStores(
            Array.isArray(payload.elements) ? payload.elements : [],
            element => normalizeElement(element, lat, lng)
        );
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
        overpassError = error;
        console.warn('[nearby-stores] Overpass failed; trying Photon:', error?.message || error);
    }

    try {
        const payload = await fetchPhoton(lat, lng, radius, keyword);
        const stores = normalizeStores(
            Array.isArray(payload.features) ? payload.features : [],
            feature => normalizePhotonFeature(feature, lat, lng, radius)
        );
        const result = {
            checked_at: new Date().toISOString(),
            retrieval: 'openstreetmap_photon',
            radius,
            keyword,
            stores
        };
        setBoundedCache(cacheKey, result);
        return response.status(200).json(result);
    } catch (photonError) {
        console.error('[nearby-stores] All OSM services failed:', {
            overpass: overpassError?.message || String(overpassError),
            photon: photonError?.message || String(photonError)
        });
        if (cached) {
            return response.status(200).json({
                ...cached.payload,
                retrieval: 'server_cache_stale',
                stale: true
            });
        }
        const timedOut = overpassError?.name === 'AbortError' || photonError?.name === 'AbortError';
        return response.status(502).json({
            error: timedOut ? 'osm_services_timeout' : 'osm_services_unavailable'
        });
    }
};
