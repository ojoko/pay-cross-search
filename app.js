// PayCross - Dynamic Location & Store Database Engine (PWA & B案 Hybrid Architecture)

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
        name: 'セブン-イレブン 道玄坂店',
        category: 'convenience',
        lat: 35.6595,
        lng: 139.6985,
        address: '東京都渋谷区道玄坂2-10-1',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 }
        }
    },
    {
        id: 2,
        name: 'マツモトキヨシ 中央通店',
        category: 'supermarket',
        lat: 35.6605,
        lng: 139.6998,
        address: '東京都渋谷区宇田川町22-3',
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
        name: 'ビックカメラ 駅前店',
        category: 'appliance',
        lat: 35.6591,
        lng: 139.7032,
        address: '東京都渋谷区渋谷1-24-12',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'aeonpay'],
        campaigns: {
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            aupay: { rate: 0.05, name: '家電大還元フェス', maxPerTxn: 2000 }
        }
    },
    {
        id: 4,
        name: 'スターバックス カフェ店',
        category: 'restaurant',
        lat: 35.6597,
        lng: 139.7006,
        address: '東京都渋谷区宇田川町21-6',
        acceptedPays: ['paypay', 'dbarai', 'rakuten'],
        campaigns: {
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 }
        }
    },
    {
        id: 5,
        name: 'イオンモール / イオンスーパー店',
        category: 'supermarket',
        lat: 35.6542,
        lng: 139.7081,
        address: '東京都渋谷区東1-26-22',
        acceptedPays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'],
        campaigns: {
            aeonpay: { rate: 0.10, name: 'イオングループP10倍', maxPerTxn: 1500 },
            paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 },
            merpay: { rate: 0.10, name: 'スーパー特割クーポン', maxPerTxn: 300 }
        }
    }
];

// App State
let currentAmount = 3000;
let selectedPays = new Set(['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay']);
let currentCategory = 'all';
let map = null;
let markersMap = {};
let centerMarker = null;
let currentCenter = { lat: 35.6595, lng: 139.7000, name: '渋谷' };
let deferredPwaPrompt = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    initPwaInstallPrompt();
    loadProductionLiveData();
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

            // Update Sync Status Bar in Header
            const syncStatusEl = document.getElementById('sync-status-text');
            if (syncStatusEl) {
                const dateStr = liveData.last_updated ? new Date(liveData.last_updated).toLocaleString('ja-JP') : '最新';
                syncStatusEl.textContent = `本番実データ同期済み (${dateStr} 更新・全端末対応)`;
            }

            // Update Active Campaigns Notice List
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
    generateStoresAround(lat, lng, locationName);
    renderStoreList();

    const campaignCityEl = document.querySelector('.highlight-city');
    if (campaignCityEl) campaignCityEl.textContent = locationName;
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
        { name: 'イオンモール / イオンスーパー', category: 'supermarket', pays: ['aeonpay', 'paypay', 'rakuten', 'dbarai', 'aupay'], camp: { aeonpay: { rate: 0.10, name: 'イオンP10倍', maxPerTxn: 1500 } } },
        { name: 'マックスバリュ', category: 'supermarket', pays: ['aeonpay', 'paypay', 'dbarai', 'aupay'], camp: { aeonpay: { rate: 0.05, name: '感謝デーP5倍', maxPerTxn: 1000 } } },
        { name: 'セブン-イレブン', category: 'convenience', pays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay'], camp: { paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: 'ローソン', category: 'convenience', pays: ['paypay', 'dbarai', 'aupay', 'rakuten'], camp: { dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: 'マツモトキヨシ', category: 'supermarket', pays: ['paypay', 'rakuten', 'dbarai', 'aupay', 'merpay', 'aeonpay'], camp: { rakuten: { rate: 0.05, name: 'P5倍デー', maxPerTxn: 500 }, paypay: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } },
        { name: 'ウエルシア薬局', category: 'supermarket', pays: ['paypay', 'dbarai', 'aupay', 'merpay', 'aeonpay'], camp: { aupay: { rate: 0.10, name: 'たぬきの大恩返し', maxPerTxn: 1000 } } },
        { name: 'ヤマダデンキ', category: 'appliance', pays: ['paypay', 'rakuten', 'dbarai', 'aupay'], camp: { paypay: { rate: 0.15, name: '家電ポイント還元', maxPerTxn: 2000 } } },
        { name: 'スターバックス', category: 'restaurant', pays: ['paypay', 'dbarai', 'rakuten'], camp: { dbarai: { rate: 0.20, name: '自治体20%還元中', maxPerTxn: 1000 } } }
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
                条件に合う店舗が見つかりませんでした。絞り込み条件を変更してください。
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

// Geocoding Location Search
async function searchLocation(query) {
    if (!query || !query.trim()) return;
    const cleanQuery = query.trim();

    const locationDict = {
        '海老名': { lat: 35.4462, lng: 139.3908 },
        '海老名市': { lat: 35.4462, lng: 139.3908 },
        '海老名駅': { lat: 35.4462, lng: 139.3908 },
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
            alert(`「${cleanQuery}」の位置が見つかりませんでした。地名や駅名をお試しください。`);
        }
    } catch (err) {
        console.error('Geocoding error:', err);
        setNewLocation(35.6812, 139.7671, cleanQuery);
    }
}

// IP-Based Location Fallback when HTTP blocks raw GPS
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
    const presetBtns = document.querySelectorAll('.btn-preset');

    btnLocationSearch.addEventListener('click', () => {
        searchLocation(locationInput.value);
    });

    locationInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchLocation(locationInput.value);
        }
    });

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            presetBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const lat = parseFloat(btn.dataset.lat);
            const lng = parseFloat(btn.dataset.lng);
            const name = btn.dataset.name;
            locationInput.value = name;
            setNewLocation(lat, lng, name);
        });
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

        // Check if browser supports Geolocation AND is running on Secure Origin (HTTPS or localhost)
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
                        setNewLocation(35.6595, 139.7000, '渋谷 (擬似現在地)');
                        btnGps.innerHTML = '<span class="icon">📍</span> 渋谷周辺に設定';
                    }
                    setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
                },
                { timeout: 5000, enableHighAccuracy: true }
            );
        } else {
            // Over HTTP (e.g. http://192.168.1.10:8088), Mobile Safari blocks raw GPS API. Fallback to IP Geolocation!
            const ipLoc = await fetchIpLocation();
            if (ipLoc) {
                setNewLocation(ipLoc.lat, ipLoc.lng, ipLoc.name);
                btnGps.innerHTML = `<span class="icon">📍</span> ${ipLoc.name}`;
            } else {
                setNewLocation(35.6595, 139.7000, '渋谷 (設定位置)');
                btnGps.innerHTML = '<span class="icon">📍</span> 渋谷周辺に設定';
                alert('※iOS Safariのセキュリティ仕様により、HTTP通信(http://)では高精度GPS機能が制限されます。実運用(HTTPS化後)で高精度GPSが利用可能になります。現在はIP推定位置または地図検索機能をご利用いただけます。');
            }
            setTimeout(() => { btnGps.innerHTML = '<span class="icon">📍</span> 現在地付近を検索'; }, 3000);
        }
    });
}
