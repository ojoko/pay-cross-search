// PayCross Pro - Robust Core Application Engine (Production Grade)

// Utility: HTML Escape for DOM XSS Prevention
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getSafeExternalUrl(value) {
    try {
        const url = new URL(String(value || ''), window.location.origin);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    } catch {
        return '';
    }
}

// Payment Brands Data with App Deep Links
const PAY_BRANDS = {
    paypay: { id: 'paypay', name: 'PayPay', color: '#ff0033', baseRate: 0.005, deepLink: 'paypay://', webFallback: 'https://paypay.ne.jp/' },
    rakuten: { id: 'rakuten', name: '楽天ペイ', color: '#bf0000', baseRate: 0.015, deepLink: 'rakutenpay://', webFallback: 'https://pay.rakuten.co.jp/' },
    dbarai: { id: 'dbarai', name: 'd払い', color: '#cc0000', baseRate: 0.005, deepLink: 'dbarai://', webFallback: 'https://service.smt.docomo.ne.jp/keitai_payment/' },
    aupay: { id: 'aupay', name: 'au PAY', color: '#ff6600', baseRate: 0.005, deepLink: 'aupay://', webFallback: 'https://aupay.auone.jp/' },
    merpay: { id: 'merpay', name: 'メルペイ', color: '#ff334b', baseRate: 0.005, deepLink: 'mercari://', webFallback: 'https://www.mercari.com/jp/pay/' },
    aeonpay: { id: 'aeonpay', name: 'イオンPay', color: '#b8006b', baseRate: 0.005, deepLink: 'iaeon://', webFallback: 'https://www.aeon.co.jp/service/aeonpay/' }
};

const ALL_PAY_IDS = Object.keys(PAY_BRANDS);

// Active Stores State
let activeStoresDB = [];
let liveCampaignsData = [];

// App State
let currentAmount = 3000;
let selectedPays = new Set(['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay']);
let currentCategory = 'all';
let keywordSearchQuery = '';
let searchRadiusMeters = 3000;
let storeSearchState = { status: 'idle', retrieval: '', message: '' };
let leafletMap = null;
let leafletMarkerMap = new Map(); // Re-use markers via Map<storeId, L.Marker>
let leafletCenterMarker = null;
let currentCenter = { lat: 35.681236, lng: 139.767125, name: '位置情報を取得中' };
let deferredPwaPrompt = null;
let renderDebounceTimer = null;
let activeGeocodeController = null;
let activeStoreSearchController = null;
const CAMPAIGN_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const campaignLookupState = new Map();
const onDemandCampaignsByStore = new Map();
const campaignLookupPromises = new Map();

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initMapEngine();
    initEventListeners();
    initPwaInstallPrompt();
    initIosPwaBanner();
    renderPayStatusPanel();
    loadProductionLiveData();
    initializeDefaultLocation();
});

// Initialize Leaflet Map Engine Safely
function initMapEngine() {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) return;

    if (typeof L !== 'undefined') {
        try {
            leafletMap = L.map('map').setView([currentCenter.lat, currentCenter.lng], 16);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(leafletMap);

            leafletMap.on('click', async (e) => {
                const { lat, lng } = e.latlng;
                await setNewLocation(lat, lng, `指定位置 (${lat.toFixed(3)}, ${lng.toFixed(3)})`);
            });
        } catch (err) {
            console.warn('[Map Engine] Failed to initialize Leaflet:', err);
        }
    }
    updateCenterPin(currentCenter.lat, currentCenter.lng, '現在地を取得中');
}

// Load & Normalize Production Live Campaign Data JSON
async function loadProductionLiveData() {
    try {
        const res = await fetch('./production_live_data.json');
        if (!res.ok) return;
        const liveData = await res.json();

        if (liveData && Array.isArray(liveData.active_campaigns)) {
            const today = new Date().toISOString().split('T')[0];

            // Normalize and validate campaigns
            liveCampaignsData = liveData.active_campaigns.filter(c => {
                if (c.verification_status && c.verification_status !== 'verified') return false;
                if (c.end_date && c.end_date < today) return false;
                if (c.start_date && c.start_date > today) return false;
                return true;
            });

            const syncStatusEl = document.getElementById('sync-status-text');
            if (syncStatusEl) {
                const dateStr = liveData.last_updated ? new Date(liveData.last_updated).toLocaleString('ja-JP') : '最新';
                syncStatusEl.textContent = `検証済みキャンペーン ${liveCampaignsData.length}件同期完了 (${dateStr})`;
            }

            const campaignListEl = document.getElementById('active-campaigns-list');
            if (campaignListEl) {
                campaignListEl.innerHTML = '';
                liveCampaignsData.forEach(c => {
                    const li = document.createElement('li');
                    li.innerHTML = `<strong class="highlight-city">${escapeHTML(c.target_region)}</strong> ${escapeHTML(c.title)}`;
                    campaignListEl.appendChild(li);
                });
            }

            // Merge live campaigns into verified stores
            mergeLiveCampaignsIntoStores();
        }
    } catch (e) {
        console.log('[PayCross Engine] Local mode:', e);
    }
}

function applyLiveCampaignsToStore(store) {
    const campaignsByPay = {};
    liveCampaignsData.forEach(campaign => {
        const matchesRegion = campaign.target_region && (
            store.address.includes(campaign.target_region) ||
            (store.areaKeys || []).some(key => String(key).includes(campaign.target_region))
        );
        if (!matchesRegion || !PAY_BRANDS[campaign.target_pay]) return;

        const normalized = {
            id: campaign.id,
            rate: Number.isFinite(Number(campaign.bonus_rate)) ? Number(campaign.bonus_rate) : 0,
            name: campaign.title || '特別還元中',
            maxPerTxn: Number.isFinite(Number(campaign.max_per_txn)) ? Number(campaign.max_per_txn) : Infinity,
            rateMode: campaign.rate_mode || 'bonus',
            sourceUrl: campaign.source_url || '',
            sourceFetchedAt: campaign.source_fetched_at || '',
            verificationStatus: campaign.verification_status || 'unverified',
            retrieval: 'server_cache',
            stackable: campaign.stackable === true
        };
        if (!campaignsByPay[campaign.target_pay]) campaignsByPay[campaign.target_pay] = [];
        campaignsByPay[campaign.target_pay].push(normalized);
    });
    return { ...store, campaigns: campaignsByPay };
}

function mergeLiveCampaignsIntoStores() {
    activeStoresDB = activeStoresDB.map(applyLiveCampaignsToStore);
    sortActiveStores();
    renderStoreListDebounced();
}

// Robust Haversine Distance Calculation (Meters) with Math Defense
function getDistanceMeters(lat1, lng1, lat2, lng2) {
    if (!Number.isFinite(lat1) || !Number.isFinite(lng1) || !Number.isFinite(lat2) || !Number.isFinite(lng2)) {
        return Infinity;
    }
    if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90 || lng1 < -180 || lng1 > 180 || lng2 < -180 || lng2 > 180) {
        return Infinity;
    }

    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const safeA = Math.min(1, Math.max(0, a));
    const c = 2 * Math.atan2(Math.sqrt(safeA), Math.sqrt(1 - safeA));
    const dist = R * c;

    return Number.isFinite(dist) ? dist : Infinity;
}

async function fetchNearbyStores(keyword = keywordSearchQuery) {
    if (activeStoreSearchController) activeStoreSearchController.abort();
    const controller = new AbortController();
    activeStoreSearchController = controller;
    const timeoutId = setTimeout(() => controller.abort(), 25_000);
    keywordSearchQuery = String(keyword || '').trim();
    storeSearchState = { status: 'loading', retrieval: '', message: '' };
    activeStoresDB = [];
    renderStoreList();

    try {
        const response = await fetch('/api/nearby-stores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lat: currentCenter.lat,
                lng: currentCenter.lng,
                radius: searchRadiusMeters,
                keyword: keywordSearchQuery
            }),
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const stores = Array.isArray(payload.stores) ? payload.stores : [];
        activeStoresDB = stores
            .map(store => ({
                ...store,
                acceptedPays: Array.isArray(store.acceptedPays)
                    ? store.acceptedPays.filter(payId => PAY_BRANDS[payId])
                    : [...ALL_PAY_IDS],
                areaKeys: Array.isArray(store.areaKeys) ? store.areaKeys : [],
                campaigns: {},
                distMeters: getDistanceMeters(currentCenter.lat, currentCenter.lng, Number(store.lat), Number(store.lng))
            }))
            .filter(store => Number.isFinite(store.distMeters) && store.distMeters <= searchRadiusMeters + 20)
            .map(applyLiveCampaignsToStore);
        sortActiveStores();
        storeSearchState = {
            status: 'loaded',
            retrieval: payload.retrieval || 'openstreetmap_live',
            message: `${activeStoresDB.length}件取得`
        };
        const announceEl = document.getElementById('accessibility-status');
        if (announceEl) {
            const keywordText = keywordSearchQuery ? `「${keywordSearchQuery}」に一致する` : '';
            announceEl.textContent = `${currentCenter.name}から${searchRadiusMeters / 1000}km以内で${keywordText}店舗を${activeStoresDB.length}件取得しました。`;
        }
        return true;
    } catch (error) {
        if (error.name === 'AbortError' && activeStoreSearchController !== controller) return false;
        activeStoresDB = [];
        storeSearchState = {
            status: 'error',
            retrieval: '',
            message: error.name === 'AbortError'
                ? '店舗検索がタイムアウトしました。範囲を狭めて再度お試しください。'
                : '店舗情報を取得できませんでした。時間をおいて再度お試しください。'
        };
        return false;
    } finally {
        clearTimeout(timeoutId);
        if (activeStoreSearchController === controller) activeStoreSearchController = null;
        renderPayStatusPanel();
        renderStoreList();
    }
}

function sortActiveStores() {
    activeStoresDB.sort((a, b) =>
        (Number.isFinite(a.distMeters) ? a.distMeters : Infinity) -
        (Number.isFinite(b.distMeters) ? b.distMeters : Infinity)
    );
}

// Update the search center, then fetch real stores inside the selected radius.
async function setNewLocation(lat, lng, locationName, filterKeyword = '') {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    currentCenter = { lat, lng, name: locationName };
    keywordSearchQuery = filterKeyword;
    
    const locationTagEl = document.getElementById('current-location-name');
    if (locationTagEl) {
        locationTagEl.textContent = locationName;
        locationTagEl.dataset.lat = String(lat);
        locationTagEl.dataset.lng = String(lng);
    }

    if (leafletMap) {
        leafletMap.flyTo([lat, lng], searchRadiusMeters >= 5000 ? 13 : 14, { duration: 0.8 });
        updateCenterPin(lat, lng, locationName);
    }

    return fetchNearbyStores(filterKeyword);
}

// Update Map Center Pin with Exact Pinpoint Center Alignment
function updateCenterPin(lat, lng, name) {
    if (!leafletMap) return;
    if (leafletCenterMarker) leafletMap.removeLayer(leafletCenterMarker);

    const centerIcon = L.divIcon({
        html: `
            <div style="
                background: linear-gradient(135deg, #fbbf24, #f59e0b);
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid #fff;
                box-shadow: 0 0 16px rgba(251, 191, 36, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                color: #1e293b;
            ">📍</div>
        `,
        className: 'center-target-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    leafletCenterMarker = L.marker([lat, lng], { icon: centerIcon }).addTo(leafletMap);
    leafletCenterMarker.bindPopup(`<strong style="color: #fbbf24;">検索中心: ${escapeHTML(name)}</strong>`).openPopup();
}

// Render Pay Campaign Fetch Status Panel
function renderPayStatusPanel() {
    const gridEl = document.getElementById('pay-status-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';
    const locationEl = document.querySelector('#heading-pay-status .highlight-city');
    if (locationEl) locationEl.textContent = currentCenter.name;

    Object.values(PAY_BRANDS).forEach(brand => {
        const item = document.createElement('div');
        item.className = 'pay-status-item';
        const activeStoreIds = new Set(activeStoresDB.map(store => String(store.id)));
        const states = [...campaignLookupState.entries()]
            .filter(([storeId]) => activeStoreIds.has(storeId))
            .map(([, state]) => state);
        const isLoading = states.some(state => state.status === 'loading');
        const source = states
            .flatMap(state => state.sources || [])
            .find(candidate => candidate.pay_id === brand.id);
        let statusText = '⚪ 店舗選択後に確認';
        if (source) {
            statusText = source.status === 'reachable'
                ? `🟢 ${getRetrievalLabel(source.retrieval)}`
                : '🔴 公式サイト取得失敗';
        } else if (isLoading) {
            statusText = '🟡 確認中';
        }

        item.innerHTML = `
            <div class="pay-status-left">
                <span class="pay-dot ${escapeHTML(brand.id)}"></span>
                ${escapeHTML(brand.name)}
            </div>
            <div class="pay-status-right">
                ${escapeHTML(statusText)}
            </div>
        `;
        gridEl.appendChild(item);
    });
}

// Render Markers Reusing Leaflet Marker Map
function renderMapMarkers() {
    if (!leafletMap) return;

    const filteredStores = getFilteredStores();
    const activeStoreIds = new Set(filteredStores.map(s => s.id));

    // Remove markers no longer active
    for (const [id, marker] of leafletMarkerMap.entries()) {
        if (!activeStoreIds.has(id)) {
            leafletMap.removeLayer(marker);
            leafletMarkerMap.delete(id);
        }
    }

    filteredStores.forEach(store => {
        const topDeal = getStoreDeals(store)[0];

        const iconHtml = `
            <div style="
                background: ${topDeal && store.paymentsVerified ? topDeal.brand.color : '#3b82f6'};
                width: 28px;
                height: 28px;
                border-radius: 50%;
                border: 2px solid #ffffff;
                box-shadow: 0 4px 12px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 800;
                color: #ffffff;
            ">
                ${topDeal && store.paymentsVerified ? Math.round(topDeal.actualRate * 100) + '%' : '店'}
            </div>
        `;

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'pinpoint-store-icon',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        });

        const popupContent = `
            <div style="padding: 6px; text-align: left; font-family: 'Noto Sans JP', sans-serif;">
                <strong style="font-size: 14px; color: #1e293b;">${escapeHTML(store.name)}</strong><br>
                <span style="font-size: 11px; color: #64748b;">📍 ${escapeHTML(store.address)}</span><br>
                <div style="margin-top: 6px; font-weight: bold; color: #059669; font-size: 13px;">
                    ${store.paymentsVerified ? '最得決済' : '参考決済'}: ${topDeal ? escapeHTML(topDeal.brand.name) + ' (' + topDeal.rewardAmount.toLocaleString() + 'pt還元)' : '対象外'}
                </div>
            </div>
        `;

        if (leafletMarkerMap.has(store.id)) {
            const existingMarker = leafletMarkerMap.get(store.id);
            existingMarker.setLatLng([store.lat, store.lng]);
            existingMarker.setIcon(customIcon);
            existingMarker.getPopup().setContent(popupContent);
        } else {
            const marker = L.marker([store.lat, store.lng], { icon: customIcon }).addTo(leafletMap);
            marker.bindPopup(popupContent);
            marker.on('click', () => scrollToStoreCard(store.id));
            leafletMarkerMap.set(store.id, marker);
        }
    });
}

function normalizeCampaign(campaign, fallbackRetrieval = 'bundled') {
    if (!campaign || typeof campaign !== 'object') return null;
    const rate = Number(campaign.rate ?? campaign.bonus_rate);
    const rawCap = campaign.maxPerTxn ?? campaign.max_per_txn;
    const cap = rawCap === null || rawCap === undefined || rawCap === ''
        ? Infinity
        : Number(rawCap);
    return {
        id: String(campaign.id || ''),
        name: String(campaign.name || campaign.title || 'キャンペーン'),
        rate: Number.isFinite(rate) && rate >= 0 ? rate : 0,
        maxPerTxn: Number.isFinite(cap) && cap >= 0 ? cap : Infinity,
        rateMode: campaign.rateMode || campaign.rate_mode || 'bonus',
        sourceUrl: String(campaign.sourceUrl || campaign.source_url || ''),
        sourceFetchedAt: String(campaign.sourceFetchedAt || campaign.source_fetched_at || ''),
        verificationStatus: campaign.verificationStatus || campaign.verification_status || 'verified',
        retrieval: campaign.retrieval || fallbackRetrieval,
        stackable: campaign.stackable === true
    };
}

function getCampaignsForPay(store, payId) {
    const bundledValue = store.campaigns?.[payId];
    const bundled = (Array.isArray(bundledValue) ? bundledValue : (bundledValue ? [bundledValue] : []))
        .map(campaign => normalizeCampaign(campaign))
        .filter(Boolean);
    const onDemand = (onDemandCampaignsByStore.get(String(store.id)) || [])
        .filter(campaign => campaign.target_pay === payId)
        .map(campaign => normalizeCampaign(campaign, campaign.retrieval || 'server_cache'))
        .filter(Boolean);

    const deduped = new Map();
    [...bundled, ...onDemand].forEach(campaign => {
        const key = campaign.id || `${campaign.name}|${campaign.rate}|${campaign.maxPerTxn}|${campaign.sourceUrl}`;
        deduped.set(key, campaign);
    });
    return [...deduped.values()];
}

function calculateCampaignReward(campaign) {
    const amount = Number.isFinite(currentAmount) && currentAmount > 0 ? currentAmount : 0;
    const rawReward = Math.floor(amount * campaign.rate);
    return Math.max(0, Math.min(rawReward, campaign.maxPerTxn));
}

// Point Reward Calculation with safe caps and conservative campaign stacking.
function getStoreDeals(store) {
    const deals = [];

    store.acceptedPays.forEach(payId => {
        if (!selectedPays.has(payId)) return;

        const brand = PAY_BRANDS[payId];
        if (!brand) return;
        const amount = Number.isFinite(currentAmount) && currentAmount > 0 ? currentAmount : 0;
        const baseRate = Number.isFinite(brand.baseRate) && brand.baseRate >= 0 ? brand.baseRate : 0;
        const baseReward = Math.floor(amount * baseRate);
        const campaigns = getCampaignsForPay(store, payId)
            .filter(campaign => campaign.verificationStatus === 'verified')
            .map(campaign => ({ ...campaign, reward: calculateCampaignReward(campaign), includedInTotal: false }))
            .sort((a, b) => b.reward - a.reward);

        if (campaigns.length === 1) {
            campaigns[0].includedInTotal = true;
        } else if (campaigns.length > 1) {
            const allExplicitlyStackable = campaigns.every(campaign => campaign.stackable === true);
            if (allExplicitlyStackable) campaigns.forEach(campaign => { campaign.includedInTotal = true; });
            else campaigns[0].includedInTotal = true;
        }

        const campaignReward = campaigns
            .filter(campaign => campaign.includedInTotal)
            .reduce((total, campaign) => total + campaign.reward, 0);
        const rewardAmount = baseReward + campaignReward;
        const actualRate = amount > 0 ? rewardAmount / amount : 0;

        deals.push({
            payId,
            brand,
            actualRate,
            rewardAmount,
            baseReward,
            campaignReward,
            campaignName: campaigns.find(campaign => campaign.includedInTotal)?.name || null,
            campaigns
        });
    });

    deals.sort((a, b) => b.rewardAmount - a.rewardAmount || a.brand.name.localeCompare(b.brand.name, 'ja'));
    return deals;
}

// Filter Stores by Selected Pays & Categories
function getFilteredStores() {
    return activeStoresDB.filter(store => {
        if (currentCategory !== 'all' && store.category !== currentCategory) return false;
        return store.acceptedPays.length === 0 || store.acceptedPays.some(p => selectedPays.has(p));
    });
}

function getCampaignCacheKey(storeId) {
    return `paycross:campaigns:v1:${String(storeId)}`;
}

function readDeviceCampaignCache(storeId, allowStale = false) {
    try {
        const raw = localStorage.getItem(getCampaignCacheKey(storeId));
        if (!raw) return null;
        const cached = JSON.parse(raw);
        if (!cached?.payload || cached.payload.store_id !== String(storeId)) return null;
        if (!allowStale && Date.now() >= Number(cached.expiresAt || 0)) return null;
        return cached.payload;
    } catch {
        return null;
    }
}

function writeDeviceCampaignCache(storeId, payload) {
    try {
        const ttlMs = Math.min(
            CAMPAIGN_CACHE_TTL_MS,
            Math.max(60_000, Number(payload.cache_ttl_seconds || 0) * 1000 || CAMPAIGN_CACHE_TTL_MS)
        );
        localStorage.setItem(getCampaignCacheKey(storeId), JSON.stringify({
            expiresAt: Date.now() + ttlMs,
            payload
        }));
    } catch (error) {
        console.warn('[Campaign Cache] Device cache unavailable:', error);
    }
}

function applyCampaignLookup(store, payload, retrievalOverride = '') {
    const campaigns = Array.isArray(payload.campaigns) ? payload.campaigns : [];
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    onDemandCampaignsByStore.set(String(store.id), campaigns.map(campaign => ({
        ...campaign,
        retrieval: retrievalOverride || campaign.retrieval || 'server_cache'
    })));
    campaignLookupState.set(String(store.id), {
        status: 'loaded',
        checkedAt: payload.checked_at || new Date().toISOString(),
        retrieval: retrievalOverride || 'official_web_live',
        sources: sources.map(source => ({
            ...source,
            retrieval: retrievalOverride || source.retrieval
        }))
    });
}

async function loadStoreCampaigns(store) {
    const storeKey = String(store.id);
    if (campaignLookupPromises.has(storeKey)) return campaignLookupPromises.get(storeKey);

    const cached = readDeviceCampaignCache(storeKey);
    if (cached) {
        applyCampaignLookup(store, cached, 'device_cache');
        renderPayStatusPanel();
        renderStoreList();
        return;
    }

    campaignLookupState.set(storeKey, { status: 'loading' });
    renderStoreList();

    const lookupPromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12_000);
        try {
            const response = await fetch('/api/store-campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    store: {
                        id: storeKey,
                        name: store.name,
                        address: store.address,
                        acceptedPays: store.acceptedPays
                    }
                }),
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            if (payload?.store_id !== storeKey) throw new Error('Invalid campaign response');
            applyCampaignLookup(store, payload);
            writeDeviceCampaignCache(storeKey, payload);
        } catch (error) {
            const stale = readDeviceCampaignCache(storeKey, true);
            if (stale) {
                applyCampaignLookup(store, stale, 'device_cache_stale');
                const state = campaignLookupState.get(storeKey);
                campaignLookupState.set(storeKey, { ...state, stale: true });
            } else {
                campaignLookupState.set(storeKey, {
                    status: 'error',
                    message: error.name === 'AbortError'
                        ? '確認がタイムアウトしました。時間をおいて再度お試しください。'
                        : '公式サイトを確認できませんでした。時間をおいて再度お試しください。'
                });
            }
        } finally {
            clearTimeout(timeoutId);
            campaignLookupPromises.delete(storeKey);
            renderPayStatusPanel();
            renderStoreList();
        }
    })();

    campaignLookupPromises.set(storeKey, lookupPromise);
    return lookupPromise;
}

function getRetrievalLabel(retrieval) {
    const labels = {
        official_web_live: '公式Webを今回確認',
        server_cache: 'サーバーキャッシュ',
        server_cache_stale: 'サーバーキャッシュ（期限切れ）',
        device_cache: '端末キャッシュ',
        device_cache_stale: '端末キャッシュ（期限切れ）',
        fetch_failed: '取得失敗',
        bundled: 'アプリ内登録データ'
    };
    return labels[retrieval] || '取得元不明';
}

function formatCampaignTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ja-JP');
}

function renderCampaignLookupPanel(store) {
    if (store.acceptedPays.length === 0) {
        return `<div class="campaign-lookup"><button class="btn-campaign-check" type="button" disabled>対象Pay情報なし</button><span>OSM上では選択対象のPay対応が確認できません</span></div>`;
    }
    const state = campaignLookupState.get(String(store.id));
    if (!state) {
        return `
            <div class="campaign-lookup">
                <button class="btn-campaign-check" type="button">この店舗のキャンペーンを確認</button>
                <span class="campaign-lookup-note">押した時だけ公式サイトを確認します</span>
            </div>
        `;
    }
    if (state.status === 'loading') {
        return `<div class="campaign-lookup is-loading"><button class="btn-campaign-check" type="button" disabled>確認中…</button><span>対応Payの公式サイトを確認しています</span></div>`;
    }
    if (state.status === 'error') {
        return `<div class="campaign-lookup is-error"><button class="btn-campaign-check" type="button">再確認する</button><span>${escapeHTML(state.message)}</span></div>`;
    }

    const sourceItems = (state.sources || []).map(source => {
        const payName = PAY_BRANDS[source.pay_id]?.name || source.pay_id;
        const checkedAt = formatCampaignTime(source.checked_at);
        const safeUrl = getSafeExternalUrl(source.url);
        const sourceName = safeUrl
            ? `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(payName)}公式</a>`
            : `${escapeHTML(payName)}公式`;
        return `<li>${sourceName}：${escapeHTML(getRetrievalLabel(source.retrieval))}${checkedAt ? `（${escapeHTML(checkedAt)}）` : ''}</li>`;
    }).join('');
    const hints = (state.sources || []).flatMap(source =>
        (source.campaign_hints || []).map(hint => ({ ...hint, payId: source.pay_id }))
    );
    const hintsHtml = hints.length > 0 ? `
        <details class="campaign-hints">
            <summary>店舗・地域に関連する未検証情報 ${hints.length}件（還元計算には未使用）</summary>
            <ul>${hints.map(hint => {
                const safeUrl = getSafeExternalUrl(hint.url);
                const title = escapeHTML(hint.title);
                return `<li>${escapeHTML(PAY_BRANDS[hint.payId]?.name || hint.payId)}：${safeUrl ? `<a href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title}</li>`;
            }).join('')}</ul>
        </details>
    ` : '';
    return `
        <div class="campaign-lookup is-loaded">
            <div class="campaign-lookup-actions">
                <button class="btn-campaign-check" type="button">再確認する</button>
                <span>${escapeHTML(getRetrievalLabel(state.retrieval))}${state.stale ? '・期限切れ情報' : ''}</span>
            </div>
            <ul class="campaign-source-list">${sourceItems}</ul>
            ${hintsHtml}
        </div>
    `;
}

// Render Store List & Ranking Cards with Debounce
function renderStoreListDebounced() {
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
    renderDebounceTimer = setTimeout(renderStoreList, 80);
}

function renderStoreList() {
    const storeListEl = document.getElementById('store-list');
    const countLabel = document.getElementById('store-count-label');
    const filteredStores = getFilteredStores();

    if (countLabel) {
        const retrievalLabel = {
            openstreetmap_live: 'OSMから取得',
            server_cache: 'サーバーキャッシュ',
            server_cache_stale: '期限切れキャッシュ'
        }[storeSearchState.retrieval] || '';
        countLabel.textContent = storeSearchState.status === 'loading'
            ? '検索中…'
            : `${filteredStores.length}件・${searchRadiusMeters / 1000}km以内${retrievalLabel ? `・${retrievalLabel}` : ''}`;
    }
    if (!storeListEl) return;

    storeListEl.innerHTML = '';

    if (storeSearchState.status === 'idle') {
        storeListEl.innerHTML = `
            <div class="card store-search-message">
                <strong>検索中心を設定してください</strong>
                <span>${escapeHTML(storeSearchState.message || '位置情報を許可するか、駅名・住所を入力して検索中心を変更してください。')}</span>
            </div>
        `;
        renderMapMarkers();
        return;
    }

    if (storeSearchState.status === 'loading') {
        storeListEl.innerHTML = `
            <div class="card store-search-message is-loading" role="status">
                <strong>周辺店舗を検索しています…</strong>
                <span>検索中心から${searchRadiusMeters / 1000}km以内のOpenStreetMap店舗情報を取得中です。</span>
            </div>
        `;
        renderMapMarkers();
        return;
    }

    if (storeSearchState.status === 'error') {
        storeListEl.innerHTML = `
            <div class="card store-search-message is-error" role="alert">
                <strong>店舗検索に失敗しました</strong>
                <span>${escapeHTML(storeSearchState.message)}</span>
                <button type="button" class="btn-retry-store-search">再検索する</button>
            </div>
        `;
        const retryButton = storeListEl.querySelector('.btn-retry-store-search');
        if (retryButton) retryButton.addEventListener('click', () => fetchNearbyStores(keywordSearchQuery));
        renderMapMarkers();
        return;
    }

    if (filteredStores.length === 0) {
        storeListEl.innerHTML = `
            <div class="card store-search-message">
                <strong>条件に合う店舗が見つかりませんでした</strong>
                <span>キーワードを短くする、ジャンルを変更する、または検索範囲を広げてお試しください。</span>
            </div>
        `;
        renderMapMarkers();
        return;
    }

    const fragment = document.createDocumentFragment();

    filteredStores.forEach(store => {
        const deals = getStoreDeals(store);
        const topDeal = deals[0];

        const cardEl = document.createElement('div');
        cardEl.className = 'store-card';
        cardEl.id = `store-card-${store.id}`;

        const categoryNames = {
            convenience: 'コンビニ',
            supermarket: 'スーパー・ドラッグ',
            restaurant: '飲食店',
            appliance: '家電量販店'
        };

        let dealsHtml = '';
        deals.forEach((deal, idx) => {
            const isTop = idx === 0;
            const campaignDetailsHtml = deal.campaigns.map(campaign => {
                const capText = Number.isFinite(campaign.maxPerTxn) ? `・1回上限 ${campaign.maxPerTxn.toLocaleString()}pt` : '';
                const sourceText = getRetrievalLabel(campaign.retrieval);
                const fetchedAt = formatCampaignTime(campaign.sourceFetchedAt);
                const safeSourceUrl = getSafeExternalUrl(campaign.sourceUrl);
                const sourceHtml = safeSourceUrl
                    ? `<a href="${escapeHTML(safeSourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(sourceText)}</a>`
                    : escapeHTML(sourceText);
                return `
                    <li class="campaign-detail ${campaign.includedInTotal ? 'is-counted' : 'is-reference'}">
                        <div><strong>${escapeHTML(campaign.name)}</strong>（${(campaign.rate * 100).toFixed(1)}%${capText}）</div>
                        <div class="campaign-meta">
                            ${campaign.includedInTotal ? `計算に反映 +${campaign.reward.toLocaleString()}pt` : '重複適用未確認のため計算対象外'}
                            ・情報元: ${sourceHtml}${fetchedAt ? `・取得 ${escapeHTML(fetchedAt)}` : ''}
                        </div>
                    </li>
                `;
            }).join('');
            dealsHtml += `
                <div class="pay-rank-item ${isTop ? 'is-top' : ''}">
                    <div class="rank-main">
                        <div class="rank-left">
                            <span class="rank-num">#${idx + 1}</span>
                            <div class="pay-brand-name">
                                <span class="pay-dot ${escapeHTML(deal.payId)}"></span>
                                ${escapeHTML(deal.brand.name)}
                                ${deal.campaigns.length > 0 ? `<span class="campaign-tag">${deal.campaigns.length}件</span>` : ''}
                            </div>
                        </div>
                        <div class="rank-right">
                            <div class="reward-amount">+${deal.rewardAmount.toLocaleString()} pt</div>
                            <div class="reward-rate">実効 ${(deal.actualRate * 100).toFixed(1)}%</div>
                            <button class="btn-pay-launch" data-pay="${escapeHTML(deal.payId)}">
                                アプリ起動 🚀
                            </button>
                        </div>
                    </div>
                    ${campaignDetailsHtml ? `<ul class="campaign-detail-list">${campaignDetailsHtml}</ul>` : ''}
                </div>
            `;
        });

        const distText = Number.isFinite(store.distMeters) ? `<span style="font-size: 0.78rem; color: #fbbf24; margin-left: 8px;">(中心から ${Math.round(store.distMeters)}m)</span>` : '';
        const confirmedPayNames = (store.confirmedPays || [])
            .map(payId => PAY_BRANDS[payId]?.name)
            .filter(Boolean);
        const paymentStatusHtml = store.paymentsVerified
            ? '<span class="payment-data-status is-verified">OSM登録の対応Payを表示</span>'
            : `<span class="payment-data-status is-unknown">${confirmedPayNames.length > 0 ? `${escapeHTML(confirmedPayNames.join('・'))}対応登録あり・その他は未確認` : '対応Payは未確認'}（ランキングは参考値）</span>`;
        const safeOsmUrl = getSafeExternalUrl(store.osmUrl);

        cardEl.innerHTML = `
            <div class="store-card-header">
                <div class="store-info-main">
                    <h3>${escapeHTML(store.name)} <span class="category-tag">${escapeHTML(categoryNames[store.category] || '')}</span> ${distText}</h3>
                    <div class="store-address">
                        📍 ${escapeHTML(store.address)}
                        <button class="btn-gmap-link-sm" data-lat="${store.lat}" data-lng="${store.lng}">
                            🗺️ Googleマップ
                        </button>
                        ${safeOsmUrl ? `<a class="btn-osm-link-sm" href="${escapeHTML(safeOsmUrl)}" target="_blank" rel="noopener noreferrer">OSM情報</a>` : ''}
                    </div>
                    <div class="store-data-status">${paymentStatusHtml}</div>
                </div>
                ${topDeal ? `
                    <div class="best-deal-badge">
                        <span>${store.paymentsVerified ? '👑 最得' : '参考値'}: ${escapeHTML(topDeal.brand.name)}</span>
                    </div>
                ` : ''}
            </div>

            ${renderCampaignLookupPanel(store)}

            <div class="pay-ranking-list">
                ${dealsHtml.length > 0 ? dealsHtml : '<div style="color: var(--text-secondary); font-size: 0.85rem;">選択した決済サービスに対応していません</div>'}
            </div>
        `;

        // Card click handler
        cardEl.addEventListener('click', (e) => {
            if (e.target.closest('.btn-campaign-check')) {
                loadStoreCampaigns(store);
                return;
            }
            if (e.target.closest('.btn-pay-launch')) {
                const payId = e.target.closest('.btn-pay-launch').dataset.pay;
                launchPayApp(payId);
                return;
            }
            if (e.target.closest('.btn-gmap-link-sm')) {
                const lat = e.target.closest('.btn-gmap-link-sm').dataset.lat;
                const lng = e.target.closest('.btn-gmap-link-sm').dataset.lng;
                window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
                return;
            }
            if (e.target.closest('.btn-osm-link-sm')) return;

            if (leafletMap) {
                leafletMap.flyTo([store.lat, store.lng], 17, { duration: 0.8 });
            }
            if (window.innerWidth <= 1024) {
                const mapCard = document.querySelector('.map-card');
                if (mapCard) {
                    mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });

        fragment.appendChild(cardEl);
    });

    storeListEl.appendChild(fragment);
    renderMapMarkers();
}

function scrollToStoreCard(storeId) {
    const cardEl = document.getElementById(`store-card-${storeId}`);
    if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cardEl.style.borderColor = 'var(--accent-blue)';
        setTimeout(() => {
            cardEl.style.borderColor = 'var(--border-color)';
        }, 2000);
    }
}

// Resolve an explicitly entered search center via the same-origin geocoding API.
async function geocodeLocation(query) {
    if (activeGeocodeController) activeGeocodeController.abort();
    const controller = new AbortController();
    activeGeocodeController = controller;
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch('/api/geocode', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (!res.ok) throw new Error(`Geocoding failed with HTTP ${res.status}`);
        const result = await res.json();
        const lat = Number(result.lat);
        const lng = Number(result.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

        return {
            lat,
            lng,
            displayName: result.display_name || query
        };
    } finally {
        clearTimeout(timeoutId);
        if (activeGeocodeController === controller) {
            activeGeocodeController = null;
        }
    }
}

// Search Location Handler
async function searchLocation(query, options = {}) {
    if (!query || !query.trim()) {
        keywordSearchQuery = '';
        renderStoreListDebounced();
        return false;
    }

    const rawQuery = query.trim();
    const announceEl = document.getElementById('accessibility-status');
    if (announceEl) announceEl.textContent = `${rawQuery} の位置を検索しています。`;

    try {
        const location = await geocodeLocation(rawQuery);
        if (!location) {
            if (announceEl) announceEl.textContent = `${rawQuery} の位置が見つかりませんでした。`;
            return false;
        }

        const displayName = options.displayName || rawQuery;
        const filterKeyword = Object.prototype.hasOwnProperty.call(options, 'filterKeyword')
            ? options.filterKeyword
            : '';
        return setNewLocation(location.lat, location.lng, displayName, filterKeyword);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.warn('[Location Search] Geocoding failed:', error);
        }

        if (announceEl) {
            announceEl.textContent = `${rawQuery} の位置を取得できませんでした。通信状態を確認してください。`;
        }
        return false;
    }
}

function canUseGeolocation() {
    return 'geolocation' in navigator && (
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    );
}

function getCurrentCoordinates() {
    return new Promise((resolve, reject) => {
        if (!canUseGeolocation()) {
            reject(new Error('geolocation_unavailable'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            position => resolve({
                lat: position.coords.latitude,
                lng: position.coords.longitude
            }),
            reject,
            { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60 * 1000 }
        );
    });
}

async function initializeDefaultLocation() {
    const locationTagEl = document.getElementById('current-location-name');
    if (locationTagEl) locationTagEl.textContent = '現在地を取得中';
    try {
        const location = await getCurrentCoordinates();
        await setNewLocation(location.lat, location.lng, '現在地', '');
    } catch (error) {
        storeSearchState = {
            status: 'idle',
            retrieval: '',
            message: '現在地を取得できませんでした。「現在地から検索」を押して位置情報を許可するか、検索中心を入力してください。'
        };
        if (locationTagEl) locationTagEl.textContent = '未設定';
        renderStoreList();
    }
}

// Reliable Native Pay App Launching with Visibility Change Protection
function launchPayApp(payId) {
    const brand = PAY_BRANDS[payId];
    if (!brand) return;

    let hasPageHidden = false;

    const onVisibilityChange = () => {
        if (document.hidden || document.webkitHidden) {
            hasPageHidden = true;
        }
    };

    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
    document.addEventListener('pagehide', () => { hasPageHidden = true; }, { once: true });

    window.location.href = brand.deepLink;

    setTimeout(() => {
        if (!hasPageHidden) {
            window.location.href = brand.webFallback;
        }
    }, 1500);
}

// PWA Install Prompt Handler
function initPwaInstallPrompt() {
    const installBtn = document.getElementById('btn-install-pwa');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPwaPrompt = e;
        if (installBtn) {
            installBtn.classList.remove('hidden');
        }
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPwaPrompt) return;
            deferredPwaPrompt.prompt();
            const { outcome } = await deferredPwaPrompt.userChoice;
            console.log(`[PWA] Install prompt outcome: ${outcome}`);
            deferredPwaPrompt = null;
            installBtn.classList.add('hidden');
        });
    }
}

// iOS Safari PWA Instruction Banner
function initIosPwaBanner() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    const iosBanner = document.getElementById('ios-pwa-banner');
    const closeBtn = document.getElementById('btn-close-ios-banner');

    if (isIos && !isStandalone && iosBanner) {
        iosBanner.classList.remove('hidden');
    }

    if (closeBtn && iosBanner) {
        closeBtn.addEventListener('click', () => {
            iosBanner.classList.add('hidden');
        });
    }
}

// Event Listeners with Checked Event Fix & Input Validation
function initEventListeners() {
    const amountInput = document.getElementById('purchase-amount');
    const amountSlider = document.getElementById('amount-slider');
    const categorySelect = document.getElementById('category-filter');
    const btnGps = document.getElementById('btn-gps');
    const locationInput = document.getElementById('location-search-input');
    const btnLocationSearch = document.getElementById('btn-location-search');
    const radiusSelect = document.getElementById('search-radius');
    const centerInput = document.getElementById('center-search-input');
    const btnCenterSearch = document.getElementById('btn-center-search');

    if (btnLocationSearch && locationInput) {
        btnLocationSearch.addEventListener('click', () => {
            fetchNearbyStores(locationInput.value);
        });

        locationInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                fetchNearbyStores(locationInput.value);
            }
        });
    }

    if (btnCenterSearch && centerInput) {
        btnCenterSearch.addEventListener('click', () => searchLocation(centerInput.value));
        centerInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') searchLocation(centerInput.value);
        });
    }

    if (radiusSelect) {
        radiusSelect.addEventListener('change', () => {
            const radius = Number(radiusSelect.value);
            if (Number.isFinite(radius)) searchRadiusMeters = Math.min(5000, Math.max(500, radius));
            if (storeSearchState.status !== 'idle') fetchNearbyStores(keywordSearchQuery);
        });
    }

    // Direct 100% Reliable Pay Chip Toggle Button Click Handler
    const chipButtons = document.querySelectorAll('.chip[data-pay]');
    chipButtons.forEach(chipBtn => {
        chipBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const payId = chipBtn.dataset.pay;
            const isChecked = chipBtn.classList.contains('checked');

            if (isChecked) {
                selectedPays.delete(payId);
                chipBtn.classList.remove('checked');
            } else {
                selectedPays.add(payId);
                chipBtn.classList.add('checked');
            }

            renderPayStatusPanel();
            renderStoreListDebounced();
        });
    });

    // Amount Input Clamping with Number.isFinite
    if (amountInput && amountSlider) {
        amountInput.addEventListener('input', (e) => {
            const rawVal = parseFloat(e.target.value);
            if (Number.isFinite(rawVal)) {
                currentAmount = Math.min(300000, Math.max(100, Math.floor(rawVal)));
                amountSlider.value = Math.min(30000, currentAmount);
            }
            renderStoreListDebounced();
        });

        amountSlider.addEventListener('input', (e) => {
            const rawVal = parseFloat(e.target.value);
            if (Number.isFinite(rawVal)) {
                currentAmount = Math.floor(rawVal);
                amountInput.value = currentAmount;
            }
            renderStoreListDebounced();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            currentCategory = e.target.value;
            renderStoreListDebounced();
        });
    }

    if (btnGps) {
        btnGps.addEventListener('click', async () => {
            btnGps.innerHTML = '<span class="icon">⌛</span> 現在地を測位中...';
            try {
                const location = await getCurrentCoordinates();
                btnGps.innerHTML = '<span class="icon">📍</span> 現在地を検索中…';
                await setNewLocation(location.lat, location.lng, '現在地', keywordSearchQuery);
            } catch (error) {
                const message = error?.code === 1
                    ? '位置情報が許可されていません'
                    : '現在地を取得できませんでした';
                btnGps.textContent = message;
                storeSearchState = { status: 'idle', retrieval: '', message };
                renderStoreList();
            } finally {
                setTimeout(() => {
                    btnGps.innerHTML = '<span class="icon">📍</span> 現在地から検索';
                }, 3000);
            }
        });
    }
}
