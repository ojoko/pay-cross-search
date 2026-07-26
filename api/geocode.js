const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;
const cache = new Map();
const clientWindows = new Map();
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
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
    return current.count > 20;
}

function setBoundedCache(key, payload) {
    if (cache.size >= 200 && !cache.has(key)) cache.delete(cache.keys().next().value);
    cache.set(key, { cachedAt: Date.now(), payload });
}

async function geocodeWithRateLimit(query) {
    const task = requestQueue.then(async () => {
        const elapsed = Date.now() - lastRequestAt;
        if (elapsed < 1000) await wait(1000 - elapsed);
        lastRequestAt = Date.now();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const params = new URLSearchParams({
                q: query,
                format: 'jsonv2',
                limit: '1',
                countrycodes: 'jp',
                addressdetails: '1',
                'accept-language': 'ja'
            });
            const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'PayCrossPro/1.0 (+https://pay-cross-search.vercel.app/)'
                },
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    });
    requestQueue = task.catch(() => {});
    return task;
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
    const query = String(body.query || '').trim().slice(0, 160);
    if (query.length < 2) return response.status(400).json({ error: 'invalid_query' });

    const cacheKey = query.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        return response.status(200).json({ ...cached.payload, retrieval: 'server_cache' });
    }

    try {
        const results = await geocodeWithRateLimit(query);
        const item = Array.isArray(results) ? results[0] : null;
        const lat = Number(item?.lat);
        const lng = Number(item?.lon);
        if (!item || !Number.isFinite(lat) || !Number.isFinite(lng)) {
            return response.status(404).json({ error: 'not_found' });
        }
        const payload = {
            lat,
            lng,
            display_name: item.display_name || query,
            checked_at: new Date().toISOString(),
            retrieval: 'nominatim_live'
        };
        setBoundedCache(cacheKey, payload);
        return response.status(200).json(payload);
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
