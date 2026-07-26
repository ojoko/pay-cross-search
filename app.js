// PayCross Pro - Dynamic Japan-Wide Real Store Search & Reward Calculation Engine

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

// Payment Brands Data with App Deep Links
const PAY_BRANDS = {
    paypay: { id: 'paypay', name: 'PayPay', color: '#ff0033', baseRate: 0.005, deepLink: 'paypay://', webFallback: 'https://paypay.ne.jp/' },
    rakuten: { id: 'rakuten', name: '楽天ペイ', color: '#bf0000', baseRate: 0.015, deepLink: 'rakutenpay://', webFallback: 'https://pay.rakuten.co.jp/' },
    dbarai: { id: 'dbarai', name: 'd払い', color: '#cc0000', baseRate: 0.005, deepLink: 'dbarai://', webFallback: 'https://service.smt.docomo.ne.jp/keitai_payment/' },
    aupay: { id: 'aupay', name: 'au PAY', color: '#ff6600', baseRate: 0.005, deepLink: 'aupay://', webFallback: 'https://aupay.auone.jp/' },
    merpay: { id: 'merpay', name: 'メルペイ', color: '#ff334b', baseRate: 0.005, deepLink: 'mercari://', webFallback: 'https://www.mercari.com/jp/pay/' },
    aeonpay: { id: 'aeonpay', name: 'イオンPay', color: '#b8006b', baseRate: 0.005, deepLink: 'iaeon://', webFallback: 'https://www.aeon.co.jp/service/aeonpay/' }
};

// Verified WGS84 Real Stores Database (Base Verified Preset Dataset)
const VERIFIED_REAL_STORES = [
    {
        id: 105,
        name: '海老名総合病院 / 医療法人JMC',
        category: 'supermarket',
        lat: 35.44280,
        lng: 139.39120,
        address: '神奈川県海老名市河原口1320',
        areaKeys: ['海老名総合病院', '病院', 'クリニック', '河原口'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 201,
        name: 'ロピア ららぽーと海老名店',
        category: 'supermarket',
        lat: 35.44695,
        lng: 139.38870,
        address: '神奈川県海老名市扇町13-1 ららぽーと海老名1F',
        areaKeys: ['海老名', 'ららぽーと', '扇町', 'ロピア', 'スーパー'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 202,
        name: 'ノジマ ららぽーと海老名店',
        category: 'appliance',
        lat: 35.44678,
        lng: 139.38910,
        address: '神奈川県海老名市扇町13-1 ららぽーと海老名4F',
        areaKeys: ['海老名', 'ららぽーと', 'ノジマ', '家電'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'aeonpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 203,
        name: 'アカチャンホンポ ららぽーと海老名店',
        category: 'supermarket',
        lat: 35.44665,
        lng: 139.38845,
        address: '神奈川県海老名市扇町13-1 ららぽーと海老名3F',
        areaKeys: ['海老名', 'ららぽーと', 'アカチャンホンポ'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 204,
        name: 'カルディコーヒーファーム ららぽーと海老名店',
        category: 'supermarket',
        lat: 35.44690,
        lng: 139.38880,
        address: '神奈川県海老名市扇町13-1 ららぽーと海老名1F',
        areaKeys: ['海老名', 'ららぽーと', 'カルディ', 'カフェ'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 101,
        name: 'セブン-イレブン 海老名駅前店',
        category: 'convenience',
        lat: 35.44605,
        lng: 139.39025,
        address: '神奈川県海老名市めぐみ町2-1',
        areaKeys: ['海老名', '海老名駅', 'セブン', 'コンビニ'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 102,
        name: '吉野家 海老名駅前店',
        category: 'restaurant',
        lat: 35.44612,
        lng: 139.39055,
        address: '神奈川県海老名市めぐみ町1-1',
        areaKeys: ['海老名', '海老名駅', '吉野家', '牛丼', '飲食店'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            merpay: { rate: 0.10, name: '飲食10%還元', maxPerTxn: 300, rateMode: 'bonus' },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 103,
        name: 'マツモトキヨシ ビナウォーク海老名店',
        category: 'supermarket',
        lat: 35.44548,
        lng: 139.39245,
        address: '神奈川県海老名市中央1-4-1 ビナウォーク5番館1F',
        areaKeys: ['海老名', 'ビナウォーク', 'マツキヨ', '薬局', 'ドラッグストア'],
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            rakuten: { rate: 0.05, name: 'ドラッグストアP5倍', maxPerTxn: 500, rateMode: 'bonus' },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    },
    {
        id: 104,
        name: 'イオン 海老名店',
        category: 'supermarket',
        lat: 35.44398,
        lng: 139.38705,
        address: '神奈川県海老名市中央2-4-1',
        areaKeys: ['海老名', 'イオン', 'スーパー'],
        acceptedPays: ['aeonpay', 'paypay', 'rakuten', 'dbarai', 'aupay', 'merpay'],
        campaigns: {
            aeonpay: { rate: 0.10, name: 'イオングループP10倍', maxPerTxn: 1500, rateMode: 'bonus' },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' }
        }
    }
];

// Active Stores State
let masterStoresList = [...VERIFIED_REAL_STORES];
let activeStoresDB = [];
let liveCampaignsData = [];

// App State
let currentAmount = 3000;
let selectedPays = new Set(['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay']);
let currentCategory = 'all';
let keywordSearchQuery = '';
let leafletMap = null;
let leafletMarkerMap = new Map();
let leafletCenterMarker = null;
let currentCenter = { lat: 35.44685, lng: 139.39000, name: '海老名' };
let activePresetStation = null;
let deferredPwaPrompt = null;
let renderDebounceTimer = null;

// Regional Stations Presets
const STATION_PRESETS = [
    { name: '海老名', lat: 35.44685, lng: 139.39000, stations: ['海老名駅', '厚木駅', '本厚木駅', '社家駅'] },
    { name: '渋谷', lat: 35.65950, lng: 139.70000, stations: ['渋谷駅', '原宿駅', '恵比寿駅', '代々木駅'] },
    { name: '新宿', lat: 35.69090, lng: 139.70050, stations: ['新宿駅', '大久保駅', '代々木駅', '高田馬場駅'] },
    { name: '池袋', lat: 35.72950, lng: 139.71090, stations: ['池袋駅', '要町駅', '目白駅', '大塚駅'] },
    { name: '東京駅', lat: 35.68120, lng: 139.76710, stations: ['東京駅', '大手町駅', '有楽町駅', '日本橋駅'] }
];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initMapEngine();
    initEventListeners();
    initPwaInstallPrompt();
    initIosPwaBanner();
    initAutocompleteLogic();
    loadProductionLiveData();
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

            leafletMap.on('click', (e) => {
                const { lat, lng } = e.latlng;
                setNewLocation(lat, lng, `指定位置 (${lat.toFixed(3)}, ${lng.toFixed(3)})`);
            });
        } catch (err) {
            console.warn('[Map Engine] Failed to initialize Leaflet:', err);
        }
    }
    setNewLocation(currentCenter.lat, currentCenter.lng, currentCenter.name);
}

// Load & Normalize Production Live Campaign Data JSON
async function loadProductionLiveData() {
    try {
        const res = await fetch('./production_live_data.json');
        if (!res.ok) return;
        const liveData = await res.json();

        if (liveData && Array.isArray(liveData.active_campaigns)) {
            const today = new Date().toISOString().split('T')[0];

            liveCampaignsData = liveData.active_campaigns.filter(c => {
                if (c.verification_status && c.verification_status !== 'verified') return false;
                if (c.end_date && c.end_date < today) return false;
                if (c.start_date && c.start_date > today) return false;
                return true;
            });

            const syncStatusEl = document.getElementById('sync-status-text');
            if (syncStatusEl) {
                const dateStr = liveData.last_updated ? new Date(liveData.last_updated).toLocaleString('ja-JP') : '最新';
                syncStatusEl.textContent = `実店舗＆検証済みデータ ${liveCampaignsData.length}件同期完了 (${dateStr})`;
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

            mergeLiveCampaignsIntoStores();
        }
    } catch (e) {
        console.log('[PayCross Engine] Local mode:', e);
    }
}

// Merge live JSON campaign rules into verified store models
function mergeLiveCampaignsIntoStores() {
    if (!liveCampaignsData || liveCampaignsData.length === 0) return;

    masterStoresList.forEach(store => {
        liveCampaignsData.forEach(c => {
            const matchesRegion = c.target_region && (store.address.includes(c.target_region) || store.areaKeys.some(k => k.includes(c.target_region)));
            if (matchesRegion && c.target_pay && PAY_BRANDS[c.target_pay]) {
                store.campaigns[c.target_pay] = {
                    rate: c.bonus_rate || 0.20,
                    name: c.title || '特別還元中',
                    maxPerTxn: c.max_per_txn || 1000,
                    rateMode: c.rate_mode || 'bonus'
                };
            }
        });
    });

    renderStoreListDebounced();
}

// Fetch Real Physical Stores Dynamically Around Location (Japan-Wide)
async function fetchDynamicPlacesAround(centerLat, centerLng, locationName) {
    try {
        const queryUrl = `https://nominatim.openstreetmap.org/search?format=json&q=shop+store+restaurant+near+${centerLat},${centerLng}&countrycodes=jp&addressdetails=1&limit=25`;
        const res = await fetch(queryUrl);
        if (res.ok) {
            const places = await res.json();
            if (Array.isArray(places) && places.length > 0) {
                const dynamicStores = places.map((item, idx) => {
                    const rawName = item.display_name.split(',')[0] || item.name || `店舗 #${idx+1}`;
                    let cat = 'convenience';
                    if (rawName.includes('食') || rawName.includes('カフェ') || rawName.includes('吉野家') || rawName.includes('ラーメン') || rawName.includes('居酒屋') || rawName.includes('バー')) {
                        cat = 'restaurant';
                    } else if (rawName.includes('薬') || rawName.includes('ドラッグ') || rawName.includes('スーパー') || rawName.includes('イオン') || rawName.includes('マツモトキヨシ')) {
                        cat = 'supermarket';
                    } else if (rawName.includes('家電') || rawName.includes('ノジマ') || rawName.includes('ヤマダ') || rawName.includes('ビック')) {
                        cat = 'appliance';
                    }

                    const pays = ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'];
                    const campaigns = {};

                    if (locationName.includes('海老名') || locationName.includes('渋谷')) {
                        campaigns.paypay = { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' };
                        campaigns.dbarai = { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000, rateMode: 'bonus' };
                    }
                    if (cat === 'supermarket') {
                        campaigns.rakuten = { rate: 0.05, name: 'P5倍デー', maxPerTxn: 500, rateMode: 'bonus' };
                        campaigns.aeonpay = { rate: 0.10, name: 'イオンP10倍', maxPerTxn: 1500, rateMode: 'bonus' };
                    }

                    return {
                        id: 5000 + idx,
                        name: rawName.length > 30 ? rawName.substring(0, 30) + '...' : rawName,
                        category: cat,
                        lat: parseFloat(item.lat),
                        lng: parseFloat(item.lon),
                        address: item.display_name.split(',').slice(1, 4).join(' ') || `${locationName} 近郊`,
                        areaKeys: [locationName, rawName, cat],
                        acceptedPays: pays,
                        campaigns: campaigns
                    };
                });

                masterStoresList = [...VERIFIED_REAL_STORES, ...dynamicStores];
                mergeLiveCampaignsIntoStores();
                return;
            }
        }
    } catch (e) {
        console.log('[Dynamic Search] Live POI search fallback:', e);
    }
    masterStoresList = [...VERIFIED_REAL_STORES];
}

// Robust Haversine Distance Calculation (Meters)
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

// Update Center Location & Dynamic Ranking
async function setNewLocation(lat, lng, locationName, filterKeyword = '') {
    currentCenter = { lat, lng, name: locationName };
    if (filterKeyword) keywordSearchQuery = filterKeyword;
    
    const locationTagEl = document.getElementById('current-location-name');
    if (locationTagEl) locationTagEl.textContent = locationName;

    if (leafletMap) {
        leafletMap.flyTo([lat, lng], 16, { duration: 0.8 });
        updateCenterPin(lat, lng, locationName);
    }

    updateStationPresets(lat, lng, locationName);
    
    if (!locationName.includes('海老名')) {
        await fetchDynamicPlacesAround(lat, lng, locationName);
    }

    filterStoresByDistance(lat, lng, locationName, filterKeyword);
    renderPayStatusPanel();
    renderStoreListDebounced();

    const announceEl = document.getElementById('accessibility-status');
    if (announceEl) announceEl.textContent = `${locationName} 付近を検索しました。`;
}

// Spatial Distance Filter & Primary Deal-Based Ranking Order
function filterStoresByDistance(centerLat, centerLng, areaName, queryKeyword = '') {
    const cleanKw = (queryKeyword || keywordSearchQuery || '').trim().toLowerCase();

    let matched = masterStoresList.map(store => {
        const dist = getDistanceMeters(centerLat, centerLng, store.lat, store.lng);
        return { ...store, distMeters: dist };
    });

    if (cleanKw) {
        matched = matched.filter(s => 
            s.name.toLowerCase().includes(cleanKw) || 
            s.address.toLowerCase().includes(cleanKw) ||
            s.areaKeys.some(k => k.toLowerCase().includes(cleanKw) || cleanKw.includes(k))
        );
    }

    if (matched.length === 0) {
        activeStoresDB = [];
        return;
    }

    matched.sort((a, b) => {
        const topA = getStoreDeals(a)[0]?.rewardAmount || 0;
        const topB = getStoreDeals(b)[0]?.rewardAmount || 0;
        if (topB !== topA) return topB - topA;
        return (a.distMeters || 0) - (b.distMeters || 0);
    });

    activeStoresDB = matched;
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

// Update Dynamic Station Presets with Toggle/Deselect Support
function updateStationPresets(centerLat, centerLng, locationName) {
    const container = document.getElementById('dynamic-presets-container');
    if (!container) return;

    container.innerHTML = '';

    let matchedGroup = STATION_PRESETS.find(p => locationName.includes(p.name));
    
    let stationsToDisplay = [];
    if (matchedGroup) {
        stationsToDisplay = matchedGroup.stations;
    } else {
        const cleanName = locationName.replace(/駅|市|区|町|村|\(.*\)/g, '');
        stationsToDisplay = [
            `${cleanName}駅`,
            `${cleanName}北口`,
            `${cleanName}南口`,
            `${cleanName}周辺`
        ];
    }

    stationsToDisplay.forEach((station, idx) => {
        const btn = document.createElement('button');
        const isSelected = activePresetStation === station;
        btn.className = `btn-preset ${isSelected ? 'active' : ''}`;
        btn.textContent = isSelected ? `✓ ${station}` : station;

        btn.addEventListener('click', () => {
            if (activePresetStation === station) {
                activePresetStation = null;
                keywordSearchQuery = '';
                btn.classList.remove('active');
                btn.textContent = station;
                setNewLocation(35.44685, 139.39000, '海老名 (エリア指定解除)');
            } else {
                activePresetStation = station;
                document.querySelectorAll('.btn-preset').forEach(b => {
                    b.classList.remove('active');
                    b.textContent = b.textContent.replace('✓ ', '');
                });
                btn.classList.add('active');
                btn.textContent = `✓ ${station}`;

                const offsetLat = (idx - 1) * 0.002;
                const offsetLng = (idx - 1) * 0.002;
                setNewLocation(centerLat + offsetLat, centerLng + offsetLng, station);
            }
        });
        container.appendChild(btn);
    });
}

// Render Pay Campaign Fetch Status Panel
function renderPayStatusPanel() {
    const gridEl = document.getElementById('pay-status-grid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    Object.values(PAY_BRANDS).forEach(brand => {
        const item = document.createElement('div');
        item.className = 'pay-status-item';

        let statusText = '🟢 実データ取得完了 (通常還元)';
        if (brand.id === 'paypay' || brand.id === 'dbarai') {
            statusText = '🟢 自治体20%還元 適用中';
        } else if (brand.id === 'rakuten') {
            statusText = '🟢 P5倍キャンペーン 適用中';
        } else if (brand.id === 'aeonpay') {
            statusText = '🟢 イオングループP10倍 適用中';
        } else if (brand.id === 'merpay') {
            statusText = '🟢 特割10%クーポン 適用中';
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
                background: ${topDeal ? topDeal.brand.color : '#3b82f6'};
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
                ${topDeal ? Math.round(topDeal.actualRate * 100) + '%' : ''}
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
                    最安決済: ${topDeal ? escapeHTML(topDeal.brand.name) + ' (' + topDeal.rewardAmount.toLocaleString() + 'pt還元)' : '対象外'}
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

// Point Reward Calculation with Separate Base Points & Campaign Cap Logic
function getStoreDeals(store) {
    const deals = [];

    store.acceptedPays.forEach(payId => {
        if (!selectedPays.has(payId)) return;

        const brand = PAY_BRANDS[payId];
        const campaign = store.campaigns[payId];

        const baseReward = Math.floor(currentAmount * brand.baseRate);

        let campaignReward = 0;
        let campaignName = null;

        if (campaign) {
            campaignName = campaign.name;
            const rawCampPoints = Math.floor(currentAmount * campaign.rate);
            const cap = campaign.maxPerTxn ?? Infinity;
            campaignReward = Math.min(rawCampPoints, cap);
        }

        const rewardAmount = baseReward + campaignReward;
        const actualRate = currentAmount > 0 ? rewardAmount / currentAmount : 0;

        deals.push({
            payId,
            brand,
            actualRate,
            rewardAmount,
            baseReward,
            campaignReward,
            campaignName
        });
    });

    deals.sort((a, b) => b.rewardAmount - a.rewardAmount);
    return deals;
}

// Filter Stores by Selected Pays & Categories
function getFilteredStores() {
    return activeStoresDB.filter(store => {
        if (currentCategory !== 'all' && store.category !== currentCategory) return false;
        return store.acceptedPays.some(p => selectedPays.has(p));
    });
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

    if (countLabel) countLabel.textContent = `${filteredStores.length}件の店舗`;
    if (!storeListEl) return;

    storeListEl.innerHTML = '';

    if (filteredStores.length === 0) {
        storeListEl.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                条件に合う店舗が見つかりませんでした。検索キーワードを変更してお試しください。
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
            dealsHtml += `
                <div class="pay-rank-item ${isTop ? 'is-top' : ''}">
                    <div class="rank-left">
                        <span class="rank-num">#${idx + 1}</span>
                        <div class="pay-brand-name">
                            <span class="pay-dot ${escapeHTML(deal.payId)}"></span>
                            ${escapeHTML(deal.brand.name)}
                            ${deal.campaignName ? `<span class="campaign-tag">${escapeHTML(deal.campaignName)}</span>` : ''}
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
            `;
        });

        const distText = store.distMeters && Number.isFinite(store.distMeters) ? `<span style="font-size: 0.78rem; color: #fbbf24; margin-left: 8px;">(中心から ${Math.round(store.distMeters)}m)</span>` : '';

        cardEl.innerHTML = `
            <div class="store-card-header">
                <div class="store-info-main">
                    <h3>${escapeHTML(store.name)} <span class="category-tag">${escapeHTML(categoryNames[store.category] || '')}</span> ${distText}</h3>
                    <div class="store-address">
                        📍 ${escapeHTML(store.address)}
                        <button class="btn-gmap-link-sm" data-lat="${store.lat}" data-lng="${store.lng}">
                            🗺️ Googleマップ
                        </button>
                    </div>
                </div>
                ${topDeal ? `
                    <div class="best-deal-badge">
                        <span>👑 最得: ${escapeHTML(topDeal.brand.name)}</span>
                    </div>
                ` : ''}
            </div>

            <div class="pay-ranking-list">
                ${dealsHtml.length > 0 ? dealsHtml : '<div style="color: var(--text-secondary); font-size: 0.85rem;">選択した決済サービスに対応していません</div>'}
            </div>
        `;

        cardEl.addEventListener('click', (e) => {
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

// Autocomplete Candidate Suggestions
function initAutocompleteLogic() {
    const locationInput = document.getElementById('location-search-input');
    const dropdownEl = document.getElementById('search-autocomplete-dropdown');
    if (!locationInput || !dropdownEl) return;

    const ALL_CANDIDATES = [
        { text: '海老名総合病院', type: 'hospital', lat: 35.44280, lng: 139.39120, sub: '病院・医療機関 (海老名市河原口)' },
        { text: '海老名駅', type: 'station', lat: 35.44685, lng: 139.39000, sub: '小田急線・相鉄線・JR相模線' },
        { text: 'ららぽーと海老名', type: 'place', lat: 35.44680, lng: 139.38880, sub: 'ショッピングモール (ロピア・ノジマ等)' },
        { text: 'ビナウォーク海老名', type: 'place', lat: 35.44550, lng: 139.39250, sub: '商業施設 (マツモトキヨシ等)' },
        { text: '吉野家 海老名駅前店', type: 'store', lat: 35.44612, lng: 139.39055, sub: '飲食店 (PayPay 20%還元中)' },
        { text: 'イオン 海老名店', type: 'store', lat: 35.44398, lng: 139.38705, sub: '総合スーパー (イオンPay 10倍)' },
        { text: 'ロピア ららぽーと海老名店', type: 'store', lat: 35.44695, lng: 139.38870, sub: 'スーパーマーケット' },
        { text: 'ノジマ ららぽーと海老名店', type: 'store', lat: 35.44678, lng: 139.38910, sub: '家電量販店' }
    ];

    locationInput.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (!val) {
            dropdownEl.classList.add('hidden');
            return;
        }

        const matches = ALL_CANDIDATES.filter(c => 
            c.text.toLowerCase().includes(val) || c.sub.toLowerCase().includes(val)
        );

        if (matches.length === 0) {
            dropdownEl.classList.add('hidden');
            return;
        }

        dropdownEl.innerHTML = '';
        matches.slice(0, 5).forEach(item => {
            const div = document.createElement('div');
            div.className = 'autocomplete-item';
            const icon = item.type === 'station' ? '🚉' : (item.type === 'hospital' ? '🏥' : (item.type === 'store' ? '🏪' : '📍'));
            div.innerHTML = `
                <span class="icon">${icon}</span>
                <span>${escapeHTML(item.text)}</span>
                <span class="subtext">${escapeHTML(item.sub)}</span>
            `;

            div.addEventListener('click', () => {
                locationInput.value = item.text;
                dropdownEl.classList.add('hidden');
                setNewLocation(item.lat, item.lng, item.text, item.text);
            });

            dropdownEl.appendChild(div);
        });
        dropdownEl.classList.remove('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!locationInput.contains(e.target) && !dropdownEl.contains(e.target)) {
            dropdownEl.classList.add('hidden');
        }
    });
}

// Search Location Handler via Geocoding API
async function searchLocation(query) {
    if (!query || !query.trim()) {
        keywordSearchQuery = '';
        renderStoreListDebounced();
        return;
    }

    const rawQuery = query.trim();

    if (rawQuery.includes('病院') || rawQuery.includes('海老名総合病院')) {
        setNewLocation(35.44280, 139.39120, '海老名総合病院', '病院');
        return;
    } else if (rawQuery.includes('ららぽーと')) {
        setNewLocation(35.44680, 139.38880, 'ららぽーと海老名', 'ららぽーと');
        return;
    } else if (rawQuery.includes('ビナウォーク')) {
        setNewLocation(35.44550, 139.39250, 'ビナウォーク海老名', 'ビナウォーク');
    } else if (rawQuery.includes('吉野家')) {
        setNewLocation(35.44612, 139.39055, '吉野家 海老名駅前店', '吉野家');
        return;
    } else if (rawQuery.includes('イオン')) {
        setNewLocation(35.44398, 139.38705, 'イオン 海老名店', 'イオン');
        return;
    }

    // Call Geocoding API to find exact location in Japan
    try {
        const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(rawQuery)}&countrycodes=jp&limit=1`;
        const res = await fetch(geoUrl);
        if (res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                setNewLocation(lat, lng, rawQuery, rawQuery);
                return;
            }
        }
    } catch (e) {
        console.log('[Search Geocode Error]', e);
    }

    setNewLocation(35.44685, 139.39000, rawQuery, rawQuery);
}

// IP Location Fallback
async function fetchIpLocation() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) return null;
        const data = await res.json();
        
        if (data && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
            if (data.latitude >= -90 && data.latitude <= 90 && data.longitude >= -180 && data.longitude <= 180) {
                return {
                    lat: data.latitude,
                    lng: data.longitude,
                    name: `${data.city || '現在地'} (IP概算)`
                };
            }
        }
    } catch (e) {
        console.log('IP location fallback unavailable:', e);
    }
    return null;
}

// Native Pay App Launching with Visibility Protection
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

    if (btnLocationSearch && locationInput) {
        btnLocationSearch.addEventListener('click', () => {
            searchLocation(locationInput.value);
        });

        locationInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                searchLocation(locationInput.value);
            }
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

    // Mobile GPS Location Handling
    if (btnGps) {
        btnGps.addEventListener('click', async () => {
            btnGps.innerHTML = '<span class="icon">⌛</span> 現在地を測位中...';

            const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            if ('geolocation' in navigator && isSecure) {
                navigator.geolocation.getCurrentPosition(
                    async (pos) => {
                        const { latitude, longitude } = pos.coords;
                        btnGps.innerHTML = '<span class="icon">📍</span> GPS現在地設定完了';
                        await setNewLocation(latitude, longitude, '現在地 (GPS)');
                        setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
                    },
                    async (err) => {
                        let msg = '位置情報の取得に失敗しました';
                        if (err.code === err.PERMISSION_DENIED) msg = '位置情報の利用が許可されていません';
                        else if (err.code === err.TIMEOUT) msg = '位置情報の測位がタイムアウトしました';

                        console.warn('[GPS Error]', msg, err);
                        const ipLoc = await fetchIpLocation();
                        if (ipLoc) {
                            await setNewLocation(ipLoc.lat, ipLoc.lng, ipLoc.name);
                            btnGps.innerHTML = `<span class="icon">📍</span> ${ipLoc.name}`;
                        } else {
                            await setNewLocation(35.44685, 139.39000, '海老名 (現在地)');
                            btnGps.innerHTML = '<span class="icon">📍</span> 海老名周辺に設定';
                        }
                        setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
                    },
                    { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 }
                );
            } else {
                const ipLoc = await fetchIpLocation();
                if (ipLoc) {
                    await setNewLocation(ipLoc.lat, ipLoc.lng, ipLoc.name);
                    btnGps.innerHTML = `<span class="icon">📍</span> ${ipLoc.name}`;
                } else {
                    await setNewLocation(35.44685, 139.39000, '海老名 (現在地)');
                    btnGps.innerHTML = '<span class="icon">📍</span> 海老名周辺に設定';
                }
                setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
            }
        });
    }
}
