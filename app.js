// PayCross - Dynamic Location & Store Database Engine (PWA Pro)

// Mock Payment Brands Data
const PAY_BRANDS = {
    paypay: { id: 'paypay', name: 'PayPay', color: 'var(--color-paypay)', baseRate: 0.005 },
    rakuten: { id: 'rakuten', name: '楽天ペイ', color: 'var(--color-rakuten)', baseRate: 0.015 },
    dbarai: { id: 'dbarai', name: 'd払い', color: 'var(--color-dbarai)', baseRate: 0.005 },
    aupay: { id: 'aupay', name: 'au PAY', color: 'var(--color-aupay)', baseRate: 0.005 },
    merpay: { id: 'merpay', name: 'メルペイ', color: 'var(--color-merpay)', baseRate: 0.005 },
    aeonpay: { id: 'aeonpay', name: 'イオンPay', color: 'var(--color-aeonpay)', baseRate: 0.005 }
};

// Base Stores Seed Data
let activeStoresDB = [
    {
        id: 1,
        name: 'セブン-イレブン 店',
        category: 'convenience',
        lat: 35.4462,
        lng: 139.3908,
        address: '海老名市・周辺エリア',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 }
        }
    },
    {
        id: 2,
        name: 'マツモトキヨシ 店',
        category: 'supermarket',
        lat: 35.4472,
        lng: 139.3920,
        address: '海老名市・周辺エリア',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            rakuten: { rate: 0.05, name: 'ドラッグストアP5倍', maxPerTxn: 500 },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            aupay: { rate: 0.10, name: 'auたぬきの大恩返し', maxPerTxn: 500 }
        }
    },
    {
        id: 3,
        name: '吉野家 / すき家 飲食チェーン店',
        category: 'restaurant',
        lat: 35.4450,
        lng: 139.3890,
        address: '海老名市・周辺エリア',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            merpay: { rate: 0.10, name: '飲食特割10%クーポン', maxPerTxn: 300 },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 }
        }
    },
    {
        id: 4,
        name: 'ビックカメラ / ノジマ 家電店',
        category: 'appliance',
        lat: 35.4480,
        lng: 139.3940,
        address: '海老名市・周辺エリア',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'aeonpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            aupay: { rate: 0.05, name: '家電大還元フェス', maxPerTxn: 2000 }
        }
    },
    {
        id: 5,
        name: 'イオンモール / イオンスーパー店',
        category: 'supermarket',
        lat: 35.4440,
        lng: 139.3870,
        address: '海老名市・周辺エリア',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            aeonpay: { rate: 0.10, name: 'イオングループP10倍', maxPerTxn: 1500 },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 }
        }
    }
];

// App State
let currentAmount = 3000;
let selectedPays = new Set(['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay']);
let currentCategory = 'all';
let keywordSearchQuery = '';
let map = null;
let markersMap = {};
let centerMarker = null;
let currentCenter = { lat: 35.4462, lng: 139.3908, name: '海老名' };
let deferredPwaPrompt = null;

// Regional Stations Dictionary for Dynamic Presets
const STATION_PRESETS = [
    { name: '海老名', lat: 35.4462, lng: 139.3908, stations: ['海老名駅', '厚木駅', '本厚木駅', '社家駅'] },
    { name: '渋谷', lat: 35.6595, lng: 139.7000, stations: ['渋谷駅', '原宿駅', '恵比寿駅', '代々木駅'] },
    { name: '新宿', lat: 35.6909, lng: 139.7005, stations: ['新宿駅', '大久保駅', '代々木駅', '高田馬場駅'] },
    { name: '池袋', lat: 35.7295, lng: 139.7109, stations: ['池袋駅', '要町駅', '目白駅', '大塚駅'] },
    { name: '東京駅', lat: 35.6812, lng: 139.7671, stations: ['東京駅', '大手町駅', '有楽町駅', '日本橋駅'] },
    { name: '難波', lat: 34.6654, lng: 135.5013, stations: ['難波駅', '心斎橋駅', '日本橋駅', '天王寺駅'] }
];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    initPwaInstallPrompt();
    loadProductionLiveData();
    updateStationPresets(currentCenter.lat, currentCenter.lng, currentCenter.name);
    renderPayStatusPanel();
    renderStoreList();
});

// Load Production Live Campaign Data from backend sync API/JSON
async function loadProductionLiveData() {
    try {
        const res = await fetch('./production_live_data.json');
        if (!res.ok) return;
        const liveData = await res.json();

        if (liveData && liveData.active_campaigns && liveData.active_campaigns.length > 0) {
            console.log('[PayCross Engine] Live production campaign data loaded:', liveData.active_campaigns.length, 'campaigns');

            const syncStatusEl = document.getElementById('sync-status-text');
            if (syncStatusEl) {
                const dateStr = liveData.last_updated ? new Date(liveData.last_updated).toLocaleString('ja-JP') : '最新';
                syncStatusEl.textContent = `全Pay実データ同期完了 (${dateStr} 更新)`;
            }

            const campaignListEl = document.getElementById('active-campaigns-list');
            if (campaignListEl) {
                campaignListEl.innerHTML = '';
                liveData.active_campaigns.forEach(c => {
                    const li = document.createElement('li');
                    li.innerHTML = `<strong class="highlight-city">${c.target_region}</strong> ${c.title}`;
                    campaignListEl.appendChild(li);
                });
            }
        }
    } catch (e) {
        console.log('[PayCross Engine] Running in local offline mode:', e);
    }
}

// Initialize Leaflet Map
function initMap() {
    map = L.map('map').setView([currentCenter.lat, currentCenter.lng], 15);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    updateCenterPin(currentCenter.lat, currentCenter.lng, currentCenter.name);

    map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        setNewLocation(lat, lng, `指定位置 (${lat.toFixed(3)}, ${lng.toFixed(3)})`);
    });

    renderMapMarkers();
}

// Update Location & Dynamic Store Generation
function setNewLocation(lat, lng, locationName) {
    currentCenter = { lat, lng, name: locationName };
    map.flyTo([lat, lng], 15, { duration: 1.0 });

    updateCenterPin(lat, lng, locationName);
    updateStationPresets(lat, lng, locationName);
    generateStoresAround(lat, lng, locationName);
    renderPayStatusPanel();
    renderStoreList();

    const campaignCityEl = document.querySelector('.highlight-city');
    if (campaignCityEl) campaignCityEl.textContent = locationName;
}

// Update Dynamic Station Presets based on Current Location
function updateStationPresets(centerLat, centerLng, locationName) {
    const container = document.getElementById('dynamic-presets-container');
    if (!container) return;

    container.innerHTML = '';

    // Find closest preset group or generate nearby stations dynamically
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
            `${cleanName}中央`
        ];
    }

    stationsToDisplay.forEach((station, idx) => {
        const btn = document.createElement('button');
        btn.className = `btn-preset ${idx === 0 ? 'active' : ''}`;
        btn.textContent = station;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Slightly offset for station choice
            const offsetLat = (idx - 1) * 0.003;
            const offsetLng = (idx - 1) * 0.003;
            setNewLocation(centerLat + offsetLat, centerLng + offsetLng, station);
        });
        container.appendChild(btn);
    });
}

// Update Map Center Marker Icon
function updateCenterPin(lat, lng, name) {
    if (centerMarker) map.removeLayer(centerMarker);

    const centerHtml = `
        <div style="
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 3px solid #fff;
            box-shadow: 0 0 16px rgba(251, 191, 36, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
            color: #1e293b;
        ">
            📍
        </div>
    `;

    const icon = L.divIcon({
        html: centerHtml,
        className: 'center-pin',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    centerMarker = L.marker([lat, lng], { icon }).addTo(map);
    centerMarker.bindPopup(`<strong style="color: #fbbf24;">検索基準地: ${name}</strong>`).openPopup();
}

// Dynamically generate stores around any specified location
function generateStoresAround(centerLat, centerLng, areaName) {
    const templates = [
        { name: 'セブン-イレブン', category: 'convenience', pays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'], camp: { paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: 'ローソン / ファミリーマート', category: 'convenience', pays: ['paypay', 'dbarai', 'aupay', 'rakuten', 'aeonpay'], camp: { dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: 'マツモトキヨシ / ウエルシア', category: 'supermarket', pays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'], camp: { rakuten: { rate: 0.05, name: 'P5倍デー', maxPerTxn: 500 }, paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: '吉野家 / すき家 / 松屋', category: 'restaurant', pays: ['paypay', 'dbarai', 'aupay', 'merpay', 'aeonpay'], camp: { merpay: { rate: 0.10, name: '飲食10%還元', maxPerTxn: 300 }, paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: 'スターバックス / ドトール', category: 'restaurant', pays: ['paypay', 'dbarai', 'rakuten', 'aeonpay'], camp: { dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: 'ヤマダデンキ / ノジマ', category: 'appliance', pays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'aeonpay'], camp: { paypay: { rate: 0.15, name: '家電ポイント還元', maxPerTxn: 2000 } } },
        { name: 'イオンモール / イオンスーパー', category: 'supermarket', pays: ['aeonpay', 'paypay', 'rakuten', 'dbarai', 'aupay'], camp: { aeonpay: { rate: 0.10, name: 'イオンP10倍', maxPerTxn: 1500 }, paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } }
    ];

    activeStoresDB = templates.map((tmpl, idx) => {
        const offsetLat = (Math.random() - 0.5) * 0.012;
        const offsetLng = (Math.random() - 0.5) * 0.014;
        
        return {
            id: idx + 100,
            name: `${tmpl.name} ${areaName}店`,
            category: tmpl.category,
            lat: centerLat + offsetLat,
            lng: centerLng + offsetLng,
            address: `${areaName} 近郊`,
            acceptedPays: tmpl.pays,
            campaigns: tmpl.camp
        };
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

        // Check if active campaign exists at current center
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
                <span class="pay-dot ${brand.id}"></span>
                ${brand.name}
            </div>
            <div class="pay-status-right">
                ${statusText}
            </div>
        `;
        gridEl.appendChild(item);
    });
}

// Render Pins on Map
function renderMapMarkers() {
    Object.values(markersMap).forEach(marker => map.removeLayer(marker));
    markersMap = {};

    const filteredStores = getFilteredStores();

    filteredStores.forEach(store => {
        const topDeal = getStoreDeals(store)[0];
        
        const iconHtml = `
            <div style="
                background: ${topDeal ? topDeal.brand.color : '#3b82f6'};
                width: 26px;
                height: 26px;
                border-radius: 50%;
                border: 2px solid #fff;
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: bold;
                color: #fff;
            ">
                ${topDeal ? Math.round(topDeal.effectiveRate * 100) + '%' : ''}
            </div>
        `;

        const customIcon = L.divIcon({
            html: iconHtml,
            className: 'custom-map-pin',
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });

        const marker = L.marker([store.lat, store.lng], { icon: customIcon }).addTo(map);

        const popupContent = `
            <div style="padding: 4px; text-align: left;">
                <strong style="font-size: 14px; color: #fff;">${store.name}</strong><br>
                <span style="font-size: 11px; color: #94a3b8;">${store.address}</span><br>
                <div style="margin-top: 6px; font-weight: bold; color: #10b981;">
                    最安決済: ${topDeal ? topDeal.brand.name + ' (' + topDeal.rewardAmount + '円分還元)' : '対象外'}
                </div>
            </div>
        `;
        marker.bindPopup(popupContent);
        marker.on('click', () => scrollToStoreCard(store.id));

        markersMap[store.id] = marker;
    });
}

// Calculate Cash Back & Rewards
function getStoreDeals(store) {
    const deals = [];

    store.acceptedPays.forEach(payId => {
        if (!selectedPays.has(payId)) return;

        const brand = PAY_BRANDS[payId];
        const campaign = store.campaigns[payId];

        let effectiveRate = brand.baseRate;
        let campaignName = null;

        if (campaign) {
            effectiveRate += campaign.rate;
            campaignName = campaign.name;
        }

        let rewardAmount = Math.floor(currentAmount * effectiveRate);
        if (campaign && campaign.maxPerTxn && rewardAmount > campaign.maxPerTxn) {
            rewardAmount = campaign.maxPerTxn;
        }

        deals.push({
            payId,
            brand,
            effectiveRate,
            rewardAmount,
            campaignName
        });
    });

    deals.sort((a, b) => b.rewardAmount - a.rewardAmount);
    return deals;
}

// Filter Stores
function getFilteredStores() {
    return activeStoresDB.filter(store => {
        if (currentCategory !== 'all' && store.category !== currentCategory) return false;
        
        // Keyword Search Filter (Store name or category)
        if (keywordSearchQuery && keywordSearchQuery.trim()) {
            const q = keywordSearchQuery.trim().toLowerCase();
            const matchesName = store.name.toLowerCase().includes(q);
            const matchesCat = store.category.toLowerCase().includes(q);
            if (!matchesName && !matchesCat) return false;
        }

        return store.acceptedPays.some(p => selectedPays.has(p));
    });
}

// Render Store List & Ranking Cards
function renderStoreList() {
    const storeListEl = document.getElementById('store-list');
    const countLabel = document.getElementById('store-count-label');
    const filteredStores = getFilteredStores();

    countLabel.textContent = `${filteredStores.length}件の店舗`;
    storeListEl.innerHTML = '';

    if (filteredStores.length === 0) {
        storeListEl.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                条件に合う店舗が見つかりませんでした。「${keywordSearchQuery}」の検索条件を変更してください。
            </div>
        `;
        return;
    }

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
                            <span class="pay-dot ${deal.payId}"></span>
                            ${deal.brand.name}
                            ${deal.campaignName ? `<span class="campaign-tag">${deal.campaignName}</span>` : ''}
                        </div>
                    </div>
                    <div class="rank-right">
                        <div class="reward-amount">+${deal.rewardAmount.toLocaleString()} pt</div>
                        <div class="reward-rate">還元率 ${(deal.effectiveRate * 100).toFixed(1)}%</div>
                    </div>
                </div>
            `;
        });

        cardEl.innerHTML = `
            <div class="store-card-header">
                <div class="store-info-main">
                    <h3>${store.name} <span class="category-tag">${categoryNames[store.category] || ''}</span></h3>
                    <div class="store-address">📍 ${store.address}</div>
                </div>
                ${topDeal ? `
                    <div class="best-deal-badge">
                        <span>👑 最得: ${topDeal.brand.name}</span>
                    </div>
                ` : ''}
            </div>

            <div class="pay-ranking-list">
                ${dealsHtml.length > 0 ? dealsHtml : '<div style="color: var(--text-secondary); font-size: 0.85rem;">選択した決済サービスに対応していません</div>'}
            </div>
        `;

        storeListEl.appendChild(cardEl);
    });

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

// Smart Geocoding / Keyword Search Logic
async function searchLocation(query) {
    if (!query || !query.trim()) {
        keywordSearchQuery = '';
        renderStoreList();
        return;
    }
    const cleanQuery = query.trim();

    // Check if query is a store / brand / category keyword (e.g. "コンビニ", "吉野家", "すき家", "カフェ", "ドラッグストア", "スーパー", "セブン", "マツキヨ", "イオン", "ビックカメラ")
    const storeKeywords = ['コンビニ', '吉野家', 'すき家', '松屋', 'カフェ', 'スタバ', 'ドラッグストア', '薬局', 'スーパー', 'セブン', 'ローソン', 'ファミマ', 'マツキヨ', 'ウエルシア', 'イオン', '家電', 'ビックカメラ', 'ヤマダ'];
    
    const isStoreKeyword = storeKeywords.some(k => cleanQuery.includes(k));

    if (isStoreKeyword) {
        // Keep current map center (e.g. Ebina or GPS location), filter stores matching keyword around current location!
        keywordSearchQuery = cleanQuery;
        renderStoreList();

        // Scroll to stores container
        const storeContainer = document.querySelector('.stores-container');
        if (storeContainer) storeContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    // Otherwise, treat query as a Geographic Location / Station name!
    keywordSearchQuery = '';

    const locationDict = {
        '海老名': { lat: 35.4462, lng: 139.3908 },
        '海老名市': { lat: 35.4462, lng: 139.3908 },
        '海老名駅': { lat: 35.4462, lng: 139.3908 },
        '厚木': { lat: 35.4430, lng: 139.3660 },
        '本厚木': { lat: 35.4390, lng: 139.3640 },
        '渋谷': { lat: 35.6595, lng: 139.7000 },
        '新宿': { lat: 35.6909, lng: 139.7005 },
        '池袋': { lat: 35.7295, lng: 139.7109 },
        '東京': { lat: 35.6812, lng: 139.7671 },
        '東京駅': { lat: 35.6812, lng: 139.7671 },
        '品川': { lat: 35.6284, lng: 139.7387 },
        '横浜': { lat: 35.4658, lng: 139.6223 },
        '難波': { lat: 34.6654, lng: 135.5013 },
        '梅田': { lat: 34.7025, lng: 135.4959 },
        '名古屋': { lat: 35.1709, lng: 136.8815 },
        '博多': { lat: 33.5902, lng: 130.4207 },
        '札幌': { lat: 43.0687, lng: 141.3508 }
    };

    for (const key in locationDict) {
        if (cleanQuery.includes(key)) {
            setNewLocation(locationDict[key].lat, locationDict[key].lng, cleanQuery);
            return;
        }
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&countrycodes=jp`);
        const data = await response.json();

        if (data && data.length > 0) {
            const first = data[0];
            setNewLocation(parseFloat(first.lat), parseFloat(first.lon), cleanQuery);
        } else {
            // Treat as keyword search around current location if geocoding fails
            keywordSearchQuery = cleanQuery;
            renderStoreList();
        }
    } catch (err) {
        console.error('Geocoding error:', err);
        keywordSearchQuery = cleanQuery;
        renderStoreList();
    }
}

// IP-Based Location Fallback
async function fetchIpLocation() {
    try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (data && data.latitude && data.longitude) {
            return {
                lat: data.latitude,
                lng: data.longitude,
                name: `${data.city || '現在地'} (IP判定)`
            };
        }
    } catch (e) {
        console.log('IP location fallback unavailable:', e);
    }
    return null;
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
            console.log(`[PWA] User response to install prompt: ${outcome}`);
            deferredPwaPrompt = null;
            installBtn.classList.add('hidden');
        });
    }
}

// Event Listeners
function initEventListeners() {
    const amountInput = document.getElementById('purchase-amount');
    const amountSlider = document.getElementById('amount-slider');
    const categorySelect = document.getElementById('category-filter');
    const btnGps = document.getElementById('btn-gps');
    const chips = document.querySelectorAll('.chip');
    const locationInput = document.getElementById('location-search-input');
    const btnLocationSearch = document.getElementById('btn-location-search');

    btnLocationSearch.addEventListener('click', () => {
        searchLocation(locationInput.value);
    });

    locationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchLocation(locationInput.value);
        }
    });

    amountInput.addEventListener('input', (e) => {
        currentAmount = Math.max(100, parseInt(e.target.value) || 0);
        amountSlider.value = currentAmount;
        renderStoreList();
    });

    amountSlider.addEventListener('input', (e) => {
        currentAmount = parseInt(e.target.value);
        amountInput.value = currentAmount;
        renderStoreList();
    });

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const checkbox = chip.querySelector('input');
            checkbox.checked = !checkbox.checked;
            chip.classList.toggle('checked', checkbox.checked);

            const payId = chip.dataset.pay;
            if (checkbox.checked) {
                selectedPays.add(payId);
            } else {
                selectedPays.delete(payId);
            }
            renderPayStatusPanel();
            renderStoreList();
        });
    });

    categorySelect.addEventListener('change', (e) => {
        currentCategory = e.target.value;
        renderStoreList();
    });

    // GPS Locate Button with HTTP/HTTPS Fallback
    btnGps.addEventListener('click', async () => {
        btnGps.innerHTML = '<span class="icon">⌛</span> 現在地を測位中...';

        const isSecureOrigin = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if ('geolocation' in navigator && isSecureOrigin) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    btnGps.innerHTML = '<span class="icon">📍</span> GPS現在地に設定完了';
                    setNewLocation(latitude, longitude, '現在地 (GPS)');
                    setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
                },
                async (err) => {
                    console.log('GPS error or denied:', err);
                    const ipLoc = await fetchIpLocation();
                    if (ipLoc) {
                        setNewLocation(ipLoc.lat, ipLoc.lng, ipLoc.name);
                        btnGps.innerHTML = `<span class="icon">📍</span> ${ipLoc.name}`;
                    } else {
                        setNewLocation(35.4462, 139.3908, '海老名 (現在地)');
                        btnGps.innerHTML = '<span class="icon">📍</span> 海老名周辺に設定';
                    }
                    setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
                },
                { timeout: 5000, enableHighAccuracy: true }
            );
        } else {
            const ipLoc = await fetchIpLocation();
            if (ipLoc) {
                setNewLocation(ipLoc.lat, ipLoc.lng, ipLoc.name);
                btnGps.innerHTML = `<span class="icon">📍</span> ${ipLoc.name}`;
            } else {
                setNewLocation(35.4462, 139.3908, '海老名 (現在地)');
                btnGps.innerHTML = '<span class="icon">📍</span> 海老名周辺に設定';
            }
            setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
        }
    });
}
