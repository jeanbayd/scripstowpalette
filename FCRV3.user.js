// ==UserScript==
// @name         FCR Lite Ultra V2
// @version      2.3.3
// @description  FCR Lite + Stow Palette + God Mode (print/floor) + Bin Check Generator + Hazmat Level Display — All-in-one + Module Toggle Panel
// @author       @jeanbayd
// @match        https://aft-sherlock.eu.aftx.amazonoperations.app/ETZ2*
// @match        https://aft-sherlock.eu.aftx.amazonoperations.app/ETZ2/*
// @match        https://fcresearch-eu.aka.amazon.com/ETZ2*
// @match        https://fcresearch-eu.aka.amazon.com/ETZ2/*
// @match        https://fcresearch-eu.aka.amazon.com/*
// @match        https://qi-fcresearch-eu.corp.amazon.com/ETZ2*
// @match        https://fcresearch-eu.aka.amazon.com/*/results?s=*
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @connect      pandash.amazon.com
// @connect      prepmanager-dub.amazon.com
// @connect      roboscout.amazon.com
// @connect      localhost
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-cookie/1.4.1/jquery.cookie.min.js
// @require      https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js
// ==/UserScript==

(function() {
    'use strict';

    // ════════════════════════════════════════════════════════════════
    // ===== MODULE SYSTEM =====
    // ════════════════════════════════════════════════════════════════
    const MODULES = {
        autoSort:       { label: '↕️ Tri auto des tables',        default: true },
        productColors:  { label: '🎨 Couleurs attributs produit', default: true },
        imageHover:     { label: '🖼️ Photo hover ASIN',           default: true },
        badgePhoto:     { label: '👤 Photo badge employé',        default: true },
        prepDisplay:    { label: '📋 Prep (affichage ASIN)',       default: true },
        prepButtons:    { label: '🔘 Prep (boutons PO)',           default: true },
        paletteCage:    { label: '📦 Max unités palette/cage',    default: true },
        weightCalc:     { label: '⚖️ Calculateur de poids',       default: true },
        csvExport:      { label: '📥 Export CSV inventaire',      default: true },
        rightClickMenu: { label: '🖱️ Menu clic droit',            default: true },
        stowPalette:    { label: '🏗️ Analyse palette (stow)',     default: true },
        godModePrint:   { label: '🖨️ God Mode (impression)',      default: true },
        floorFinder:    { label: '🗺️ Floor Finder (bins)',        default: true },
        binCheck:       { label: '✅ Bin Check Generator',        default: true },
        hazmat:         { label: '☢️ Hazmat Level Display',       default: true },
    };

    function isModuleEnabled(key) {
        return GM_getValue('module_' + key, MODULES[key].default);
    }

    function setModuleEnabled(key, value) {
        GM_setValue('module_' + key, value);
    }

    function injectModulePanel() {
        const sidebar = document.querySelector('#side-bar') || document.querySelector('.sidebar') || document.querySelector('[id*="side"]');
        if (!sidebar || document.getElementById('fcr-module-panel')) return;

        const isOpen = GM_getValue('modulePanelOpen', false);

        const panel = document.createElement('div');
        panel.id = 'fcr-module-panel';

        const header = document.createElement('div');
        header.id = 'fcr-module-header';
        header.innerHTML = `
            <span id="fcr-module-label">⚙️ MODULES ACTIFS</span>
            <span id="fcr-module-arrow">${isOpen ? '▲' : '▼'}</span>
        `;

        const body = document.createElement('div');
        body.id = 'fcr-module-body';
        body.style.display = isOpen ? 'block' : 'none';

        Object.entries(MODULES).forEach(([key, mod]) => {
            const enabled = isModuleEnabled(key);
            const row = document.createElement('div');
            row.className = 'fcr-module-row';

            const lbl = document.createElement('span');
            lbl.textContent = mod.label;
            lbl.className = 'fcr-module-row-label';

            const toggleTrack = document.createElement('span');
            toggleTrack.className = 'fcr-module-toggle' + (enabled ? ' on' : '');
            toggleTrack.dataset.key = key;

            const knob = document.createElement('span');
            knob.className = 'fcr-module-knob';

            toggleTrack.appendChild(knob);
            row.appendChild(lbl);
            row.appendChild(toggleTrack);
            body.appendChild(row);

            toggleTrack.addEventListener('click', function() {
                const k = this.dataset.key;
                const nowEnabled = !isModuleEnabled(k);
                setModuleEnabled(k, nowEnabled);
                this.classList.toggle('on', nowEnabled);
                // Show reload notice
                if (!document.getElementById('fcr-reload-notice')) {
                    const notice = document.createElement('div');
                    notice.id = 'fcr-reload-notice';
                    notice.textContent = '⚠️ Rechargez la page pour appliquer';
                    body.appendChild(notice);
                }
            });
        });

        header.addEventListener('click', () => {
            const opening = body.style.display === 'none';
            body.style.display = opening ? 'block' : 'none';
            document.getElementById('fcr-module-arrow').textContent = opening ? '▲' : '▼';
            GM_setValue('modulePanelOpen', opening);
        });

        panel.appendChild(header);
        panel.appendChild(body);

        // Insert right after the theme panel (or first)
        const themePanelEl = document.getElementById('fcr-theme-panel');
        if (themePanelEl && themePanelEl.nextSibling) {
            sidebar.insertBefore(panel, themePanelEl.nextSibling);
        } else {
            sidebar.insertBefore(panel, sidebar.firstChild);
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ===== CONFIG RÉGION =====
    // ════════════════════════════════════════════════════════════════
    let REGION = GM_getValue('userRegion', 'EU');
    const HAZMAT_MARKETPLACE = "FR";

    const URLS = {
        fcresearch: { NA: 'https://fcresearch-na.aka.amazon.com', EU: 'https://fcresearch-eu.aka.amazon.com' },
        prepmanager: { EU: 'https://prepmanager-dub.amazon.com/' }
    };

    function getURL(service, path = '') {
        const url = URLS[service];
        if (!url) return '';
        if (typeof url === 'string') return url + path;
        return (url[REGION] || url.EU) + path;
    }

    function getFCFromURL() {
        const match = window.location.pathname.match(/\/([A-Z0-9]{3,4})\//);
        return match ? match[1] : null;
    }

    let FC = getFCFromURL();

    // ════════════════════════════════════════════════════════════════
    // ===== UTILITAIRES =====
    // ════════════════════════════════════════════════════════════════
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { observer.disconnect(); resolve(el); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); reject(new Error(`${selector} not found`)); }, timeout);
        });
    }

    // waitForKeyElements : remplace l'ancienne version minifiée (setInterval 300ms infini).
    // Observe le DOM via MutationObserver, appelle le callback sur chaque nouvel élément trouvé,
    // marque les éléments déjà traités pour éviter les doublons.
    // Si `runOnce` est false (défaut), continue à surveiller après la 1ère occurrence.
    function waitForKeyElements(selector, callback, runOnce = false) {
        const seen = new WeakSet();

        function processMatches() {
            const elements = document.querySelectorAll(selector);
            let matched = false;
            elements.forEach(el => {
                if (seen.has(el)) return;
                seen.add(el);
                matched = true;
                // Encapsule dans un objet jQuery-like pour compatibilité avec les callbacks existants
                const jqLike = $(el);
                callback(jqLike);
            });
            return matched;
        }

        // Traitement immédiat si des éléments sont déjà présents
        const foundImmediately = processMatches();
        if (foundImmediately && runOnce) return;

        const obs = new MutationObserver(() => {
            const found = processMatches();
            if (found && runOnce) obs.disconnect();
        });
        obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
    }

    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    function getCookie(c) {
        var cookies = document.cookie.split(";");
        for (var i = 0; i < cookies.length; i++) {
            if (cookies[i].includes(c)) return cookies[i].substring(cookies[i].indexOf("=") + 1);
        }
        return "";
    }

    function genId() {
        var id1 = "";
        for (var i = 0; i < 10; i++) id1 += Math.floor(Math.random() * 9);
        return id1;
    }

    function asciihex(str) {
        var text1 = "";
        for (var i = 0, l = str.length; i < l; i++) text1 += Number(str.charCodeAt(i)).toString(16);
        return text1;
    }

    // ════════════════════════════════════════════════════════════════
    // ===== TRI AUTOMATIQUE DES TABLES =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('autoSort')) {
        waitForKeyElements('#purchase-order-placed', function() { $('#purchase-order-placed').click().click(); });
        waitForKeyElements('#shipment-arrival', function() { $('#shipment-arrival').click().click(); });
        waitForKeyElements('#purchase-order-item-order-date', function() { $('#purchase-order-item-order-date').click().click(); });
    }

    // ════════════════════════════════════════════════════════════════
    // ===== THEME COLOR SYSTEM =====
    // ════════════════════════════════════════════════════════════════
    const THEMES = {
        base: {
            bg1:'transparent', bg2:'transparent', bg3:'transparent',
            accent:'', accentDark:'', label:'⬜ Base',
            prepBg:'transparent', prepNoPrep:'#f37d15', prepYes:'pink', isBase:true
        },
        bleu: {
            bg1:'#0a1128', bg2:'#121d3d', bg3:'#1c2b5a',
            accent:'#cfb53b', accentDark:'#7a632a', label:'🔵 Bleu',
            prepBg:'#121d3d', prepNoPrep:'#f37d15', prepYes:'#ff9eb5'
        },
        rouge: {
            bg1:'#1a0505', bg2:'#2d0a0a', bg3:'#4a1010',
            accent:'#e07b3b', accentDark:'#7a3a1a', label:'🔴 Rouge',
            prepBg:'#2d0a0a', prepNoPrep:'#e8c84a', prepYes:'#ff9eb5'
        },
        vert: {
            bg1:'#051a0a', bg2:'#0a2d12', bg3:'#104a1e',
            accent:'#4ecb71', accentDark:'#1a7a32', label:'🟢 Vert',
            prepBg:'#0a2d12', prepNoPrep:'#f37d15', prepYes:'#ff9eb5'
        },
        violet: {
            bg1:'#0e0520', bg2:'#1a0d35', bg3:'#2e1060',
            accent:'#c97aff', accentDark:'#6a2a9a', label:'🟣 Violet',
            prepBg:'#1a0d35', prepNoPrep:'#ffaa44', prepYes:'#ff9eb5'
        },
        cyan: {
            bg1:'#021520', bg2:'#042535', bg3:'#064060',
            accent:'#2ee8d8', accentDark:'#0a6060', label:'🩵 Cyan',
            prepBg:'#042535', prepNoPrep:'#f5c542', prepYes:'#ff9eb5'
        },
        orange: {
            bg1:'#1a0e00', bg2:'#2e1800', bg3:'#4e2c00',
            accent:'#ffaa00', accentDark:'#7a5000', label:'🟠 Orange',
            prepBg:'#2e1800', prepNoPrep:'#88ff66', prepYes:'#ff9eb5'
        },
        aurora: {
            bg1:'#020c12', bg2:'#06201f', bg3:'#0a3a2e',
            accent:'#5bffc1', accentDark:'#0f6b52', label:'🌌 Aurora',
            prepBg:'#06201f', prepNoPrep:'#ffd166', prepYes:'#7be0ff',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #0a3a2e 0%, #0f6b52 45%, #1c9c7a 100%)',
            gradPanel:'linear-gradient(160deg, #06201f 0%, #042a24 55%, #06201f 100%)',
            gradAccent:'linear-gradient(90deg, #5bffc1 0%, #7be0ff 50%, #c8ff9e 100%)',
            gradBtn:'linear-gradient(135deg, #0a3a2e 0%, #1c9c7a 100%)'
        },
        magma: {
            bg1:'#160402', bg2:'#2c0805', bg3:'#4a0f08',
            accent:'#ff7a3d', accentDark:'#8a2a10', label:'🌋 Magma',
            prepBg:'#2c0805', prepNoPrep:'#ffe066', prepYes:'#ff5d8f',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #4a0f08 0%, #8a2a10 45%, #d6451a 100%)',
            gradPanel:'linear-gradient(160deg, #2c0805 0%, #1c0503 55%, #2c0805 100%)',
            gradAccent:'linear-gradient(90deg, #ff7a3d 0%, #ffcc33 50%, #ff5d8f 100%)',
            gradBtn:'linear-gradient(135deg, #4a0f08 0%, #d6451a 100%)'
        },
        nebula: {
            bg1:'#0c0420', bg2:'#1a0838', bg3:'#321266',
            accent:'#d77bff', accentDark:'#5a1f9e', label:'🪐 Nebula',
            prepBg:'#1a0838', prepNoPrep:'#ffb86b', prepYes:'#ff8fd6',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #321266 0%, #5a1f9e 45%, #9b3fd6 100%)',
            gradPanel:'linear-gradient(160deg, #1a0838 0%, #100526 55%, #1a0838 100%)',
            gradAccent:'linear-gradient(90deg, #d77bff 0%, #ff8fd6 50%, #7bc8ff 100%)',
            gradBtn:'linear-gradient(135deg, #321266 0%, #9b3fd6 100%)'
        },
        glacier: {
            bg1:'#010d18', bg2:'#021e30', bg3:'#033552',
            accent:'#00e5ff', accentDark:'#005f7a', label:'🧊 Glacier',
            prepBg:'#021e30', prepNoPrep:'#ffe066', prepYes:'#80ffea',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #033552 0%, #005f7a 40%, #007ea8 70%, #00b4d8 100%)',
            gradPanel:'linear-gradient(160deg, #010d18 0%, #021e30 50%, #010d18 100%)',
            gradAccent:'linear-gradient(90deg, #00e5ff 0%, #80ffea 40%, #48cae4 70%, #00e5ff 100%)',
            gradBtn:'linear-gradient(135deg, #033552 0%, #007ea8 60%, #00e5ff 100%)'
        },
        // ── THÈMES ANIMÉS ──────────────────────────────────────────────
        wave: {
            bg1:'#020b18', bg2:'#051428', bg3:'#082040',
            accent:'#38bdf8', accentDark:'#0369a1', label:'🌊 Wave',
            prepBg:'#051428', prepNoPrep:'#fbbf24', prepYes:'#7dd3fc',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #082040 0%, #0369a1 50%, #38bdf8 100%)',
            gradPanel:'linear-gradient(160deg, #020b18 0%, #051428 100%)',
            gradAccent:'linear-gradient(90deg, #38bdf8 0%, #7dd3fc 50%, #38bdf8 100%)',
            gradBtn:'linear-gradient(135deg, #082040 0%, #0369a1 100%)',
            animCSS:`
@keyframes fcr-wave-bg {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
@keyframes fcr-wave-header {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
body, #side-bar {
    background: linear-gradient(135deg, #020b18, #051a38, #082040, #051428, #020b18) !important;
    background-size: 400% 400% !important;
    animation: fcr-wave-bg 12s ease infinite !important;
}
#fcr-theme-panel, #fcr-module-panel {
    background: linear-gradient(135deg, #051428, #082040, #051428) !important;
    background-size: 300% 300% !important;
    animation: fcr-wave-header 8s ease infinite !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #082040, #0369a1, #38bdf8, #0369a1, #082040) !important;
    background-size: 300% 300% !important;
    animation: fcr-wave-header 6s ease infinite !important;
}`
        },
        pulse: {
            bg1:'#0a0015', bg2:'#130025', bg3:'#220040',
            accent:'#e040fb', accentDark:'#6a0080', label:'⚡ Pulse',
            prepBg:'#130025', prepNoPrep:'#ffd740', prepYes:'#ea80fc',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #220040 0%, #6a0080 50%, #e040fb 100%)',
            gradPanel:'linear-gradient(160deg, #0a0015 0%, #130025 100%)',
            gradAccent:'linear-gradient(90deg, #e040fb 0%, #ea80fc 50%, #e040fb 100%)',
            gradBtn:'linear-gradient(135deg, #220040 0%, #6a0080 100%)',
            animCSS:`
@keyframes fcr-pulse-glow {
    0%, 100% { box-shadow: 0 0 8px #e040fb44, 0 0 20px #e040fb22; border-color: #6a0080; }
    50%       { box-shadow: 0 0 18px #e040fbaa, 0 0 40px #e040fb55; border-color: #e040fb; }
}
@keyframes fcr-pulse-accent {
    0%, 100% { opacity: 1; text-shadow: 0 0 6px #e040fb88; }
    50%       { opacity: 0.75; text-shadow: 0 0 14px #e040fbff; }
}
@keyframes fcr-pulse-bg {
    0%, 100% { background-color: #0a0015; }
    50%       { background-color: #130020; }
}
body, #side-bar { animation: fcr-pulse-bg 4s ease-in-out infinite !important; }
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-pulse-glow 4s ease-in-out infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    animation: fcr-pulse-accent 4s ease-in-out infinite !important;
}`
        },
        stars: {
            bg1:'#00010d', bg2:'#00021a', bg3:'#000428',
            accent:'#ffe566', accentDark:'#7a6800', label:'🌌 Stars',
            prepBg:'#00021a', prepNoPrep:'#ff9944', prepYes:'#aaddff',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #000428 0%, #001060 50%, #0020a0 100%)',
            gradPanel:'linear-gradient(160deg, #00010d 0%, #00021a 100%)',
            gradAccent:'linear-gradient(90deg, #ffe566 0%, #ffffff 50%, #ffe566 100%)',
            gradBtn:'linear-gradient(135deg, #000428 0%, #001060 100%)',
            animCSS:`
@keyframes fcr-star-twinkle-1 {
    0%,100% { opacity:0.2; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.3); }
}
@keyframes fcr-star-twinkle-2 {
    0%,100% { opacity:0.7; transform:scale(1.1); } 60% { opacity:0.1; transform:scale(0.7); }
}
@keyframes fcr-star-twinkle-3 {
    0%,100% { opacity:0.4; transform:scale(1); } 30% { opacity:1; transform:scale(1.5); }
}
@keyframes fcr-stars-drift {
    0%   { background-position: 0px 0px, 0px 0px, 0px 0px; }
    100% { background-position: 200px 300px, -150px 200px, 100px -100px; }
}
body, #side-bar {
    background:
        radial-gradient(1px 1px at 20% 15%, #fff 0%, transparent 100%),
        radial-gradient(1px 1px at 60% 40%, #ffe566 0%, transparent 100%),
        radial-gradient(1.5px 1.5px at 80% 70%, #aaddff 0%, transparent 100%),
        radial-gradient(1px 1px at 35% 80%, #fff 0%, transparent 100%),
        radial-gradient(1px 1px at 55% 25%, #ffe566 0%, transparent 100%),
        radial-gradient(1px 1px at 90% 10%, #fff 0%, transparent 100%),
        radial-gradient(1.5px 1.5px at 10% 60%, #aaddff 0%, transparent 100%),
        radial-gradient(1px 1px at 70% 90%, #fff 0%, transparent 100%),
        #00010d !important;
    background-size: 200px 200px, 300px 300px, 250px 250px, 180px 180px,
                     220px 220px, 150px 150px, 280px 280px, 200px 200px, cover !important;
    animation: fcr-stars-drift 60s linear infinite !important;
}
#fcr-theme-panel, #fcr-module-panel {
    background: linear-gradient(180deg, #000428 0%, #00021a 100%) !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #000428, #001060, #0020a0) !important;
}`
        },
        ember: {
            bg1:'#0d0200', bg2:'#1c0400', bg3:'#300800',
            accent:'#ff6a00', accentDark:'#7a2a00', label:'🔥 Ember',
            prepBg:'#1c0400', prepNoPrep:'#ffe066', prepYes:'#ff9eb5',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #300800 0%, #7a2a00 45%, #ff6a00 100%)',
            gradPanel:'linear-gradient(160deg, #0d0200 0%, #1c0400 55%, #0d0200 100%)',
            gradAccent:'linear-gradient(90deg, #ff6a00 0%, #ffcc33 50%, #ff4500 100%)',
            gradBtn:'linear-gradient(135deg, #300800 0%, #cc3300 100%)',
            animCSS:`
@keyframes fcr-ember-flicker {
    0%,100% { background-position: 50% 100%; opacity:1; }
    25%      { background-position: 45% 90%; opacity:0.92; }
    50%      { background-position: 55% 95%; opacity:0.97; }
    75%      { background-position: 48% 85%; opacity:0.94; }
}
@keyframes fcr-ember-glow {
    0%,100% { box-shadow: 0 0 10px #ff6a0055, inset 0 0 15px #ff2a0022; }
    50%      { box-shadow: 0 0 25px #ff6a00aa, inset 0 0 30px #ff2a0055; }
}
@keyframes fcr-ember-header {
    0%,100% { background-position: 0% 50%; }
    33%      { background-position: 60% 30%; }
    66%      { background-position: 40% 70%; }
}
body, #side-bar {
    background: radial-gradient(ellipse at 50% 120%, #3d0a00 0%, #1c0400 40%, #0d0200 100%) !important;
    animation: fcr-ember-flicker 5s ease-in-out infinite !important;
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-ember-glow 3s ease-in-out infinite !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #300800, #7a2a00, #ff6a00, #cc3300, #300800) !important;
    background-size: 300% 300% !important;
    animation: fcr-ember-header 4s ease-in-out infinite !important;
}`
        },
        matrix: {
            bg1:'#000800', bg2:'#001200', bg3:'#001f00',
            accent:'#00ff41', accentDark:'#004d00', label:'💠 Matrix',
            prepBg:'#001200', prepNoPrep:'#ffe566', prepYes:'#80ffb0',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #001f00 0%, #004d00 50%, #00ff41 100%)',
            gradPanel:'linear-gradient(160deg, #000800 0%, #001200 100%)',
            gradAccent:'linear-gradient(90deg, #00ff41 0%, #80ffb0 50%, #00ff41 100%)',
            gradBtn:'linear-gradient(135deg, #001f00 0%, #004d00 100%)',
            animCSS:`
@keyframes fcr-matrix-scan {
    0%   { transform: translateY(-100%); opacity: 0; }
    5%   { opacity: 0.12; }
    95%  { opacity: 0.12; }
    100% { transform: translateY(100vh); opacity: 0; }
}
@keyframes fcr-matrix-flicker {
    0%,100% { opacity:1; }
    92%     { opacity:1; }
    93%     { opacity:0.7; }
    94%     { opacity:1; }
    97%     { opacity:0.85; }
    98%     { opacity:1; }
}
@keyframes fcr-matrix-text-glow {
    0%,100% { text-shadow: 0 0 4px #00ff4188; color: #00ff41; }
    50%      { text-shadow: 0 0 12px #00ff41cc, 0 0 24px #00ff4144; color: #80ffb0; }
}
body, #side-bar {
    background: #000800 !important;
    animation: fcr-matrix-flicker 8s step-end infinite !important;
    position: relative !important;
}
body::after {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 120px;
    background: linear-gradient(180deg, transparent 0%, #00ff4115 50%, transparent 100%);
    pointer-events: none;
    z-index: 9998;
    animation: fcr-matrix-scan 6s linear infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label,
#hazmat-fcr-header a, #hazmat-fcr-arrow, #fcr-theme-arrow, #fcr-module-arrow {
    animation: fcr-matrix-text-glow 3s ease-in-out infinite !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #001f00, #004d00) !important;
    border-bottom: 1px solid #00ff4144 !important;
}`
        }
    };

    let currentTheme = GM_getValue('colorTheme', 'bleu');

    // ─── Restyle Hazmat panel on theme change (global scope, called by applyTheme) ───
    function injectHazmatPanel_restyle(t) {
        const panel = document.getElementById('hazmat-fcr-panel');
        if (!panel) return;

        const panelBg = t.isBase ? '#fff' : (t.isGradient ? t.gradPanel : t.bg2);
        const headerBg = t.isBase ? '#f5f5f5' : (t.isGradient ? t.gradHeader : t.bg3);

        panel.style.border = `1px solid ${t.isBase ? '#ddd' : t.accentDark}`;
        panel.style.background = panelBg;

        const header = panel.querySelector('#hazmat-fcr-header');
        if (header) {
            header.style.background = headerBg;
            const title = header.querySelector('#hazmat-fcr-header-title');
            if (title) title.style.color = t.isBase ? '#333' : t.accent;
            const arrow = header.querySelector('#hazmat-fcr-arrow');
            if (arrow) arrow.style.color = t.isBase ? '#333' : t.accent;
            const pandashLink = header.querySelector('a');
            if (pandashLink) pandashLink.style.color = t.isBase ? '#0066c0' : t.accent;
        }

        const body = panel.querySelector('#hazmat-fcr-body');
        if (body) body.style.background = 'transparent';

        panel.querySelectorAll('span[style*="color:#666"]').forEach(el => {
            el.style.color = t.isBase ? '#666' : '#aab4c8';
        });
        panel.querySelectorAll('div[style*="color:#555"]').forEach(el => {
            el.style.color = t.isBase ? '#555' : '#c8d0de';
            el.style.background = t.isBase ? '#fff8' : (t.bg1 + 'cc');
        });
    }

    function applyTheme(themeName) {
        const t = THEMES[themeName] || THEMES.bleu;
        GM_setValue('colorTheme', themeName);
        currentTheme = themeName;

        let styleEl = document.getElementById('dark-mode-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dark-mode-style';
            document.body.appendChild(styleEl);
        }

        if (t.isBase) {
            styleEl.textContent = `
            #fcr-theme-panel { background:#f0f0f0; border-bottom:2px solid #ccc; overflow:hidden; }
            #fcr-theme-header { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; cursor:pointer; border-bottom:1px solid #ccc; user-select:none; }
            #fcr-theme-header:hover { background:#e0e0e0; }
            #fcr-theme-label { color:#333; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
            #fcr-theme-arrow { color:#333; font-size:9px; font-weight:700; }
            #fcr-theme-body { padding:7px 8px 8px 8px; }
            #fcr-theme-panel .fcr-theme-btn { display:inline-block; margin:2px 3px 2px 0; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; border:1px solid; transition:0.2s; white-space:nowrap; }
            #fcr-theme-panel .fcr-theme-btn.active { opacity:1; box-shadow:0 0 6px currentColor; transform:scale(1.08); }
            #fcr-theme-panel .fcr-theme-btn:not(.active) { opacity:0.5; }
            #fcr-theme-btn-base   { background:#e8e8e8; color:#333; border-color:#999; }
            #fcr-theme-btn-bleu   { background:#1c2b5a; color:#cfb53b; border-color:#cfb53b; }
            #fcr-theme-btn-rouge  { background:#4a1010; color:#e07b3b; border-color:#e07b3b; }
            #fcr-theme-btn-vert   { background:#104a1e; color:#4ecb71; border-color:#4ecb71; }
            #fcr-theme-btn-violet { background:#2e1060; color:#c97aff; border-color:#c97aff; }
            #fcr-theme-btn-cyan   { background:#064060; color:#2ee8d8; border-color:#2ee8d8; }
            #fcr-theme-btn-orange { background:#4e2c00; color:#ffaa00; border-color:#ffaa00; }
            #fcr-theme-btn-aurora { background:${THEMES.aurora.gradBtn}; color:#eafff5; border-color:${THEMES.aurora.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
            #fcr-theme-btn-magma  { background:${THEMES.magma.gradBtn}; color:#fff0e8; border-color:${THEMES.magma.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
            #fcr-theme-btn-nebula { background:${THEMES.nebula.gradBtn}; color:#f6ecff; border-color:${THEMES.nebula.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
            #fcr-theme-btn-glacier { background:${THEMES.glacier.gradBtn}; color:#e0faff; border-color:${THEMES.glacier.accent}; text-shadow:0 1px 4px rgba(0,200,255,0.5); box-shadow:0 0 8px rgba(0,229,255,0.3); }
            #fcr-theme-btn-wave   { background:${THEMES.wave.gradBtn}; color:#e0f7ff; border-color:${THEMES.wave.accent}; }
            #fcr-theme-btn-pulse  { background:${THEMES.pulse.gradBtn}; color:#fce4ff; border-color:${THEMES.pulse.accent}; animation:fcr-pulse-glow 4s ease-in-out infinite; }
            #fcr-theme-btn-stars  { background:${THEMES.stars.gradBtn}; color:#fff8d6; border-color:${THEMES.stars.accent}; }
            #fcr-theme-btn-ember  { background:${THEMES.ember.gradBtn}; color:#fff0e0; border-color:${THEMES.ember.accent}; }
            #fcr-theme-btn-matrix { background:${THEMES.matrix.gradBtn}; color:#ccffdd; border-color:${THEMES.matrix.accent}; }
            #fcr-module-panel { background:#f0f0f0; border-bottom:2px solid #ccc; overflow:hidden; }
            #fcr-module-header { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; cursor:pointer; border-bottom:1px solid #ccc; user-select:none; }
            #fcr-module-header:hover { background:#e0e0e0; }
            #fcr-module-label { color:#333; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
            #fcr-module-arrow { color:#333; font-size:9px; font-weight:700; }
            #fcr-module-body { padding:6px 8px 8px 8px; }
            #fcr-module-panel .fcr-module-row { display:flex; align-items:center; justify-content:space-between; padding:3px 2px; }
            #fcr-module-panel .fcr-module-row-label { font-size:10px; color:#333; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            #fcr-module-panel .fcr-module-toggle { display:inline-block; width:28px; height:15px; border-radius:8px; position:relative; cursor:pointer; flex-shrink:0; margin-left:6px; transition:background 0.2s; background:#666; }
            #fcr-module-panel .fcr-module-toggle.on { background:#27ae60; }
            #fcr-module-panel .fcr-module-toggle .fcr-module-knob { position:absolute; width:11px; height:11px; background:white; border-radius:50%; top:2px; left:2px; transition:left 0.2s, right 0.2s; }
            #fcr-module-panel .fcr-module-toggle.on .fcr-module-knob { left:auto; right:2px; }
            #fcr-reload-notice { margin:5px 4px 2px 4px; padding:4px 6px; background:#fff3cd; border:1px solid #f0c040; border-radius:4px; font-size:9px; color:#856404; text-align:center; }
            /* Badge photo — thème Base */
            .badgePhoto { border-color:#999; background:#fff; }
            /* Menu clic droit — thème Base */
            .custom-context-menu { background:#ffffff; border:1px solid #ccc; color:#222; }
            .custom-context-menu .menu-item { color:#222; }
            .custom-context-menu .menu-item:hover { background-color:#e8e8e8; }
            .custom-context-menu hr { border-top:1px solid #ccc; }
            .barcode-content { background:#ffffff; }
            .barcode-close { background:#555; color:#fff; }
            .barcode-close:hover { background:#333; }
            /* Stow Palette — thème Base */
            #palette-panel .pp-title { color:#555; }
            #palette-panel .pp-copy-btn { color:#0066c0; background:#eaf3fb; border-color:#b5d4f4; }
            #palette-panel .pp-copy-btn:hover { background:#d0e8f8; }
            #palette-panel .pp-alert { background:#FAEEDA; border-color:#EF9F27; color:#633806; }
            /* Free Print panel — thème Base */
            .barcodes_cover { background-color:#f3f3f3cc; }
            .barcodes_panel { background-color:#fff; border:1px solid #aaa; color:#444; }
            .barcodes_panel > p { color:#444; }
            /* Bin Check selects — thème Base */
            #disposition-filter, #consumer-filter, #container-filter, #bin-check-comment { background:#ffffff; color:#222; border-color:#ccc; }
            `;
        } else {
            const panelBg = t.isGradient ? t.gradPanel : t.bg2;
            const headerBg = t.isGradient ? t.gradHeader : t.bg3;
            const accentCss = t.isGradient ? t.gradAccent : t.accent;
            // Pour les thèmes animés, on NE met pas background-color sur body (géré par animCSS)
            const bodyBgRule = t.isAnimated
                ? `body, .a-cal-labels, .a-popover-inner, #side-bar { color: #d1d5db; }`
                : `body, .a-cal-labels, .a-popover-inner, #side-bar { background-color: ${t.bg1}; color: #d1d5db; }`;
            styleEl.textContent = `
        ${bodyBgRule}
        table.a-bordered tr:nth-child(2n+1) { background-color: ${t.bg2}; }
        table.a-bordered tr:nth-child(2n)   { background-color: ${t.bg1}; }
        table.a-bordered tr.odd td          { background-color: ${t.bg2} !important; }
        table.a-bordered tr.even td         { background-color: ${t.bg1} !important; }
        table.a-bordered td, table.a-bordered th { border-bottom: 1px solid ${t.accentDark}; }
        table.a-bordered                    { border: 1px solid ${t.accentDark}; }
        table.a-bordered tr:last-child td   { border-color: ${t.accentDark}; }
        table.a-bordered tr:first-child th  { background: ${t.bg3}; color: ${t.accent}; border-color: ${t.accentDark}; }
        table.a-keyvalue td, table.a-keyvalue th { border-top: 1px solid ${t.accentDark}; }
        table.a-keyvalue                    { border-bottom: 1px solid ${t.accentDark}; }
        .a-keyvalue th                      { background-color: ${t.bg3} !important; color: ${t.accent} !important; }
        .a-box, .a-cal-na, #fcrp_cfg, table.a-keyvalue th { background-color: ${t.bg2}; border: 1px ${t.accentDark} solid; color: #d1d5db; }
        .a-box                              { border-top-color: ${t.accent} !important; }
        .a-box-title .a-box-inner, .a-popover-header, .aui-nav-row { color: #ffffff; background: ${t.bg2}; background: ${t.isGradient ? t.gradHeader : `linear-gradient(to bottom, ${t.bg3}, ${t.bg1})`}; }
        .p, .a-popover-inner, body a        { color: #d1d5db !important; }
        .a-nostyle, .a-nostyle span         { color: ${t.accent} !important; }
        h6                                  { color: #8a94ad; }
        .a-search input                     { color: #ffffff; background-color: ${t.bg1} !important; border: 1px solid ${t.accentDark}; }
        a.a-link-section-expander           { background-color: ${t.bg2} !important; }
        a.a-link-section-expander:hover     { background-color: ${t.bg3}; }
        .a-expander-content                 { background-color: ${t.bg1}; }
        .a-section-expander-inner, .sidebar-expander-header { border-top: 1px solid ${t.accentDark}; }
        #manualAsinProfilerButton, #rnoSizeProfilerButton,
        #hazmatLevelButton, #weightButton, #csvExportButton,
        #csvHistoryButton, .LoadPrep-button {
            background: ${t.isGradient ? t.gradBtn : t.bg3}; border-radius: 6px; box-shadow: rgba(0,0,0,0.3) 0 4px 6px;
            color: ${t.accent}; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 700;
            padding: 4px 12px; margin-left: 10px; border: 1px solid ${t.accent}; transition: 0.3s;
        }
        #weightButton:hover, .LoadPrep-button:hover, #csvExportButton:hover, #csvHistoryButton:hover {
            background: ${t.isGradient ? t.gradAccent : t.accent}; color: ${t.bg1}; box-shadow: rgba(0,0,0,0.3) 0 0 12px;
        }
        .a-nav-subnav .a-nostyle, .a-nav-subnav .a-nostyle span, #fc-research-logo,
        .a-nav-logo a, .nav-logo-link, h1.a-spacing-none a, h1.a-spacing-none,
        .a-header-logo, .a-header-logo a, header a, header span, .top-nav a, .top-nav span,
        nav.a-navber a, .a-navbar a         { color: ${t.accent} !important; }
        .prep-instructions-row th           { background-color: ${t.bg3} !important; color: ${t.accent} !important; font-weight:bold; }
        .prep-instructions-row td           { background-color: ${t.prepBg} !important; }
        .prep-instructions-row td.prep-noprep { color: ${t.prepNoPrep} !important; font-weight:bold; }
        .prep-instructions-row td.prep-yes  { color: ${t.prepYes} !important; font-weight:bold; }
        #fcr-theme-panel { border-bottom:2px solid ${t.accentDark}; background:${panelBg}; overflow:hidden; }
        #fcr-theme-header { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; cursor:pointer; border-bottom:1px solid ${t.accentDark}; user-select:none; transition:background 0.2s; }
        #fcr-theme-header:hover { background:${t.bg3}; }
        #fcr-theme-label { color:${t.accent}; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
        #fcr-theme-arrow { color:${t.accent}; font-size:9px; font-weight:700; }
        #fcr-theme-body { padding:7px 8px 8px 8px; }
        #fcr-theme-panel .fcr-theme-btn { display:inline-block; margin:2px 3px 2px 0; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; border:1px solid; transition:0.2s; white-space:nowrap; }
        #fcr-theme-panel .fcr-theme-btn.active { opacity:1; box-shadow:0 0 6px currentColor; transform:scale(1.08); }
        #fcr-theme-panel .fcr-theme-btn:not(.active) { opacity:0.5; }
        #fcr-theme-panel .fcr-theme-btn:not(.active):hover { opacity:0.85; }
        #fcr-theme-btn-base   { background:#e8e8e8; color:#333; border-color:#999; }
        #fcr-theme-btn-bleu   { background:#1c2b5a; color:#cfb53b; border-color:#cfb53b; }
        #fcr-theme-btn-rouge  { background:#4a1010; color:#e07b3b; border-color:#e07b3b; }
        #fcr-theme-btn-vert   { background:#104a1e; color:#4ecb71; border-color:#4ecb71; }
        #fcr-theme-btn-violet { background:#2e1060; color:#c97aff; border-color:#c97aff; }
        #fcr-theme-btn-cyan   { background:#064060; color:#2ee8d8; border-color:#2ee8d8; }
        #fcr-theme-btn-orange { background:#4e2c00; color:#ffaa00; border-color:#ffaa00; }
        #fcr-theme-btn-aurora { background:${THEMES.aurora.gradBtn}; color:#eafff5; border-color:${THEMES.aurora.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        #fcr-theme-btn-magma  { background:${THEMES.magma.gradBtn}; color:#fff0e8; border-color:${THEMES.magma.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        #fcr-theme-btn-nebula { background:${THEMES.nebula.gradBtn}; color:#f6ecff; border-color:${THEMES.nebula.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        #fcr-theme-btn-glacier { background:${THEMES.glacier.gradBtn}; color:#e0faff; border-color:${THEMES.glacier.accent}; text-shadow:0 1px 4px rgba(0,200,255,0.5); box-shadow:0 0 8px rgba(0,229,255,0.3); }
        #fcr-theme-btn-wave   { background:${THEMES.wave.gradBtn}; color:#e0f7ff; border-color:${THEMES.wave.accent}; }
        #fcr-theme-btn-pulse  { background:${THEMES.pulse.gradBtn}; color:#fce4ff; border-color:${THEMES.pulse.accent}; animation:fcr-pulse-glow 4s ease-in-out infinite; }
        #fcr-theme-btn-stars  { background:${THEMES.stars.gradBtn}; color:#fff8d6; border-color:${THEMES.stars.accent}; }
        #fcr-theme-btn-ember  { background:${THEMES.ember.gradBtn}; color:#fff0e0; border-color:${THEMES.ember.accent}; }
        #fcr-theme-btn-matrix { background:${THEMES.matrix.gradBtn}; color:#ccffdd; border-color:${THEMES.matrix.accent}; }
        /* Module panel theming — suit désormais le thème actif */
        #fcr-module-panel { border-bottom:2px solid ${t.accentDark}; background:${panelBg}; overflow:hidden; }
        #fcr-module-header { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; cursor:pointer; border-bottom:1px solid ${t.accentDark}; user-select:none; transition:background 0.2s; }
        #fcr-module-header:hover { background:${t.bg3}; }
        #fcr-module-label { color:${t.accent}; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
        #fcr-module-arrow { color:${t.accent}; font-size:9px; font-weight:700; }
        #fcr-module-body { padding:6px 8px 8px 8px; }
        #fcr-module-panel .fcr-module-row { display:flex; align-items:center; justify-content:space-between; padding:3px 2px; }
        #fcr-module-panel .fcr-module-row-label { font-size:10px; color:#d1d5db; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        #fcr-module-panel .fcr-module-toggle { display:inline-block; width:28px; height:15px; border-radius:8px; position:relative; cursor:pointer; flex-shrink:0; margin-left:6px; transition:background 0.2s; background:#666; }
        #fcr-module-panel .fcr-module-toggle.on { background:${t.isGradient ? t.gradBtn : t.accent}; box-shadow:0 0 6px ${t.accent}55; }
        #fcr-module-panel .fcr-module-toggle .fcr-module-knob { position:absolute; width:11px; height:11px; background:white; border-radius:50%; top:2px; left:2px; transition:left 0.2s, right 0.2s; }
        #fcr-module-panel .fcr-module-toggle.on .fcr-module-knob { left:auto; right:2px; }
        #fcr-reload-notice { margin:5px 4px 2px 4px; padding:4px 6px; background:#3a2a00; border:1px solid #f0c040; border-radius:4px; font-size:9px; color:#f0c040; text-align:center; }
        /* Badge photo — suit le thème */
        .badgePhoto { border-color:${t.accent}; background:${t.bg2}; }
        /* Menu clic droit — suit le thème */
        .custom-context-menu { background:${t.bg2}; border:1px solid ${t.accentDark}; color:#d1d5db; }
        .custom-context-menu .menu-item { color:#d1d5db; }
        .custom-context-menu .menu-item:hover { background-color:${t.bg3}; color:${t.accent}; }
        .custom-context-menu hr { border-top:1px solid ${t.accentDark}; }
        .barcode-content { background:${t.bg2}; border:1px solid ${t.accentDark}; }
        .barcode-close { background:${t.isGradient ? t.gradBtn : t.bg3}; color:${t.accent}; border:1px solid ${t.accentDark}; }
        .barcode-close:hover { background:${t.accent}; color:${t.bg1}; }
        /* Stow Palette — suit le thème */
        #palette-panel .pp-title { color:${t.accent}; }
        #palette-panel .pp-copy-btn { color:${t.accent}; background:${t.bg3}; border-color:${t.accentDark}; }
        #palette-panel .pp-copy-btn:hover { background:${t.isGradient ? t.gradBtn : t.accent}; color:${t.bg1}; }
        #palette-panel .pp-alert { background:${t.bg3}; border-color:${t.accent}; color:#d1d5db; }
        /* Free Print panel — suit le thème */
        .barcodes_cover { background-color:${t.bg1}cc; }
        .barcodes_panel { background-color:${t.bg2}; border:1px solid ${t.accentDark}; color:#d1d5db; }
        .barcodes_panel > p { color:#d1d5db; }
        /* Bin Check selects — suit le thème */
        #disposition-filter, #consumer-filter, #container-filter, #bin-check-comment { background:${t.bg2}; color:#d1d5db; border-color:${t.accentDark}; }
        /* Hazmat panel theming */
        #hazmat-fcr-panel { border:1px solid ${t.accentDark}; border-radius:8px; margin:10px 0; overflow:hidden; background:${panelBg}; }
        #hazmat-fcr-header { background:${headerBg}; padding:8px 12px; display:flex; align-items:center; justify-content:space-between; cursor:pointer; }
        #hazmat-fcr-header-title { color:${t.accent}; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
        #hazmat-fcr-body { padding:12px; }
        .hazmat-fcr-card { border-radius:8px; padding:12px 14px; display:flex; align-items:center; gap:12px; }
        .hazmat-fcr-level-badge { font-size:24px; font-weight:800; min-width:50px; text-align:center; padding:6px 10px; border-radius:6px; }
        .hazmat-fcr-info { flex:1; }
        .hazmat-fcr-message { font-size:11px; margin-top:6px; opacity:0.85; border-left:3px solid; padding-left:8px; }
        .hazmat-fcr-meta { display:flex; gap:12px; margin-top:4px; font-size:11px; opacity:0.7; }
        ${t.isAnimated && t.animCSS ? t.animCSS : ''}
        `;
        }

        document.querySelectorAll('.fcr-theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === themeName);
        });

        // Nettoie l'ancien élément séparé d'animation s'il existe (legacy)
        const oldAnimEl = document.getElementById('fcr-anim-style');
        if (oldAnimEl) oldAnimEl.remove();

        document.querySelectorAll('.prep-instructions-row').forEach(row => {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            if (!th || !td) return;
            if (t.isBase) {
                th.style.cssText = 'font-weight:bold;';
                const isNoPrep = td.classList.contains('prep-noprep');
                td.style.cssText = `color:${isNoPrep ? '#f37d15' : 'pink'} !important; font-weight:bold;`;
            } else {
                th.style.cssText = `background-color:${t.bg3} !important; color:${t.accent} !important; font-weight:bold;`;
                const isNoPrep = td.classList.contains('prep-noprep');
                td.style.cssText = `background-color:${t.prepBg} !important; color:${isNoPrep ? t.prepNoPrep : t.prepYes} !important; font-weight:bold;`;
            }
        });

        const hazmatPanel = document.getElementById('hazmat-fcr-panel');
        if (hazmatPanel) injectHazmatPanel_restyle(t);
    }

    applyTheme(currentTheme);

    function injectThemePanel() {
        const sidebar = document.querySelector('#side-bar') || document.querySelector('.sidebar') || document.querySelector('[id*="side"]');
        if (!sidebar || document.getElementById('fcr-theme-panel')) return;

        const isOpen = GM_getValue('themePanelOpen', true);
        const themeKeys = Object.keys(THEMES);

        const panel = document.createElement('div');
        panel.id = 'fcr-theme-panel';
        panel.innerHTML = `
            <div id="fcr-theme-header">
                <span id="fcr-theme-label">🎨 THÈME COULEUR</span>
                <span id="fcr-theme-arrow">${isOpen ? '▲' : '▼'}</span>
            </div>
            <div id="fcr-theme-body" style="display:${isOpen ? 'block' : 'none'}">
                ${themeKeys.map(k => `<span class="fcr-theme-btn${currentTheme===k?' active':''}" id="fcr-theme-btn-${k}" data-theme="${k}">${THEMES[k].label}</span>`).join('\n                ')}
            </div>
        `;
        sidebar.insertBefore(panel, sidebar.firstChild);

        document.getElementById('fcr-theme-header').addEventListener('click', () => {
            const body = document.getElementById('fcr-theme-body');
            const arrow = document.getElementById('fcr-theme-arrow');
            const opening = body.style.display === 'none';
            body.style.display = opening ? 'block' : 'none';
            arrow.textContent = opening ? '▲' : '▼';
            GM_setValue('themePanelOpen', opening);
        });

        panel.querySelectorAll('.fcr-theme-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); applyTheme(btn.dataset.theme); });
        });
    }

    setTimeout(() => {
        injectThemePanel();
        setTimeout(() => injectModulePanel(), 200);
    }, 1500);

    // Observer ciblé sur le sidebar uniquement (pas document.body+subtree)
    // Se déconnecte automatiquement une fois les deux panneaux injectés
    const sidebarRoot = document.querySelector('#side-bar') || document.querySelector('.sidebar') || document.querySelector('[id*="side"]') || document.body;
    const sidebarObserver = new MutationObserver(() => {
        const themeOk  = !!document.getElementById('fcr-theme-panel');
        const moduleOk = !!document.getElementById('fcr-module-panel');
        if (!themeOk)  injectThemePanel();
        if (!moduleOk) injectModulePanel();
        if (themeOk && moduleOk) sidebarObserver.disconnect();
    });
    sidebarObserver.observe(sidebarRoot, { childList: true });

    // ════════════════════════════════════════════════════════════════
    // ===== COULEURS ATTRIBUTS PRODUIT =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('productColors')) {
        $(document).ready(function() {
            waitForKeyElements('div [data-section-type="product"] .a-keyvalue', function() {
                ["Sortable", "Conveyable", "Very High Value", "Master Case"].forEach(e => {
                    const a = $('.a-keyvalue th:contains("' + e + '")');
                    const parentRow = a.parent();
                    parentRow.css('background-color', (parentRow.find('td').text().trim() === 'false') ? '#8B0000' : '#33CC02');
                });
                const weightHeader = $('.a-keyvalue th:contains("Weight")');
                if (weightHeader.length) {
                    const weightValue = parseFloat(weightHeader.parent().find('td').text());
                    if (weightValue > 49.99) weightHeader.parent().css('background-color', '#8B0000');
                }
            });
        });
    }

    // ════════════════════════════════════════════════════════════════
    // ===== PHOTO HOVER SUR ASIN =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('imageHover')) {
        function addImageHoverToASINs() {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'asin-image-container';
            imageContainer.style.cssText = `display:none;position:fixed;z-index:1000;background-color:white;padding:5px;border:1px solid #ccc;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);max-width:350px;max-height:350px;`;
            document.body.appendChild(imageContainer);

            function getContainerColors() {
                const th = THEMES[currentTheme] || THEMES.bleu;
                return th.isBase
                    ? { bg: '#ffffff', border: '#ccc' }
                    : { bg: th.bg2, border: th.accentDark };
            }

            function positionContainer(element) {
                const rect = element.getBoundingClientRect();
                const containerRect = imageContainer.getBoundingClientRect();
                const padding = 10;
                let top = rect.top, left = rect.right + padding;
                if (left + containerRect.width > window.innerWidth) left = rect.left - containerRect.width - padding;
                if (left < padding) left = padding;
                if (top + containerRect.height > window.innerHeight) top = window.innerHeight - containerRect.height - padding;
                if (top < padding) top = padding;
                imageContainer.style.top = `${top}px`;
                imageContainer.style.left = `${left}px`;
            }

            function handleMouseEnter(event, asin) {
                const element = event.target;
                const rect = element.getBoundingClientRect();
                const { bg, border } = getContainerColors();
                imageContainer.style.cssText = `display:block;position:fixed;top:${rect.top}px;left:${rect.right + 10}px;z-index:1000;background-color:${bg};padding:5px;border:1px solid ${border};border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,0.2);max-width:350px;max-height:350px;`;
                imageContainer.innerHTML = 'Loading...';
                setTimeout(() => positionContainer(element), 10);
                const warehouseId = document.cookie.split('; ').find(row => row.startsWith('fcmenu-warehouseId='))?.split('=')[1];
                if (!warehouseId) { imageContainer.innerHTML = 'Error: Missing site authentication'; return; }
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${getURL('fcresearch')}/${warehouseId}/results/product`,
                    data: `s=${asin}`,
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    onload: function(response) {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');
                        const img = doc.querySelector('img') || doc.querySelector('.product-image');
                        if (img && img.src) {
                            let imageSrc = img.src.replace(/^http:/, 'https:').replace(/https?:\/\/ecx\.images-amazon\.com/, 'https://images-na.ssl-images-amazon.com');
                            const productImg = document.createElement('img');
                            productImg.src = imageSrc;
                            productImg.style.maxWidth = '340px';
                            productImg.style.maxHeight = '340px';
                            productImg.style.display = 'block';
                            productImg.onload = () => positionContainer(element);
                            productImg.onerror = () => { imageContainer.innerHTML = 'Image unavailable'; positionContainer(element); };
                            imageContainer.innerHTML = '';
                            imageContainer.appendChild(productImg);
                            setTimeout(() => positionContainer(element), 50);
                        } else {
                            imageContainer.innerHTML = 'No image available';
                            positionContainer(element);
                        }
                    },
                    onerror: function() { imageContainer.innerHTML = 'Error loading image'; positionContainer(element); }
                });
            }

            function addHoverListeners() {
                document.querySelectorAll('a').forEach(link => {
                    if (link.hasAttribute('data-image-hover-added')) return;
                    const text = link.textContent.trim();
                    if (text.match(/^(B0|X0)[A-Z0-9]{8}$/)) {
                        link.setAttribute('data-image-hover-added', 'true');
                        link.addEventListener('mouseenter', (e) => handleMouseEnter(e, text));
                        link.addEventListener('mouseleave', () => { imageContainer.style.display = 'none'; });
                    }
                });
            }
            addHoverListeners();
            new MutationObserver((mutations) => {
                mutations.forEach(m => { if (m.addedNodes.length) addHoverListeners(); });
            }).observe(document.body, { childList: true, subtree: true });
        }
        addImageHoverToASINs();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== PHOTO HOVER SUR BADGE =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('badgePhoto')) {
        const tablesToCheck = [
            '#table-problems td:nth-child(6)',
            '#table-inventory-history td:nth-child(9)',
            '#table-receive-history_wrapper td:nth-child(2)',
            '#table-container-history td:nth-child(3)'
        ];

        function addBadgePhotoToCells(selector) {
            $(selector).each(function() {
                const name = $(this).text().trim();
                if (name && !$(this).find('.badgePhoto').length) {
                    const badgePhoto = $(`<div class="badgePhoto"><img src="https://internal-cdn.amazon.com/badgephotos.amazon.com/?uid=${name}" alt="Badge photo"></div>`);
                    $(this).append(badgePhoto);
                }
            });
        }

        GM_addStyle(`
            .badgePhoto { display:none;position:fixed;top:100px;left:100px;border:2px solid currentColor;padding:2px;z-index:10;border-radius:4px;background:#1a1a1a; }
            .badgePhoto img { width:80px;height:auto; }
            td:hover .badgePhoto { display:block; }
        `);

        $(document).ready(function() {
            tablesToCheck.forEach(selector => addBadgePhotoToCells(selector));
            setTimeout(() => tablesToCheck.forEach(selector => addBadgePhotoToCells(selector)), 6000);
        });
    }

    // ════════════════════════════════════════════════════════════════
    // ===== PREP =====
    // ════════════════════════════════════════════════════════════════
    const prepKeyword = [
        'No Prep','Amazon Fresh','Bagutte','Bread','Bread Packing','Cookies Large Packing','Cookies Small Packing',
        'Danish','Defrost Packing','Fish Packing','Shellfish Packing','Sweet Viennoiserie Packing','Viennoiserie Packing',
        'block_cheese','deli_cheese','deli_meat','deli_salad','pack','rotisserie','sandwich','slack_out','trim','wedge_cheese',
        'Debundling','Multi Part Assembly','Multi-volume component placard','Multibundle','Omake','Set Creation','Sorting',
        'Hazmat Prep','Gemologist','High Defect Check','Local Language Label Check - UK only','Organic Label Check - UK only',
        'QA Check','Tax Stamp Check - UK only','Transfer 8','Cardboard footprint','Counterfeit Check',
        'Cover opening in package','Folding','Hang garment','Jewelry inspection','Mask barcodes on outer case','Refund Tag',
        'Remove eaches from inner boxes','Remove from hanger','Remove multi-unit wrapping','Research',
        'A-Envelope Boxing','Boxing','Bubble wrap/Bubble bag','Inner wrapping with thin polyethylene',
        'Inner wrapping with tissue paper','Opaque covering','Outer wrapping with thick polyethylene',
        'Pulp Paper Tray','Stuffing','Bagging','Cellophane wrapping','Collar/Shrink band',
        'Multi-volume set taping/banding','Shrinkwrap','cap_sealing','Asin Stickering','Blank stickering',
        'Colors may vary stickering','Flip tag','LPN Stickering','Manufacturer Part Id Stickering','Rubber banding',
        'Sharp label stickering','Sold as set stickering','Suffocation warning stickering','Taping',
        'Amazon watch warranty insert','Watch Full Inspection','Watch Visual Inspection','Watch care and return insert'
    ];

    function fetchAsinLevelPrepInstructions(asin) {
        const url = `${getURL('prepmanager')}/view/${asin}?region=${REGION}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url: url,
                onload: function(response) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, 'text/html');
                    const instructionsElements = Array.from(doc.querySelectorAll('#instructions > ul > li'));
                    const instructions = instructionsElements
                        .map(el => el.textContent.trim())
                        .filter(text => prepKeyword.includes(text) || text.includes('Asin') || text.includes('Bubble'))
                        .map(text => {
                            if (text.includes('Asin')) return 'Asin Stickering';
                            if (text.includes('Bubble')) return 'Bubble wrap/Bubble bag';
                            return text;
                        }).join(', ');
                    resolve(instructions || 'No Prep');
                },
                onerror: reject
            });
        });
    }

    function findISD() {
        const shipmentPattern = /\b\d{10,18}\b/;
        const shipmentSection = document.querySelector('div[data-section-type="shipment"]');
        if (shipmentSection) {
            const rows = shipmentSection.querySelectorAll('table tbody tr');
            for (let row of rows) {
                const cells = row.querySelectorAll('td');
                if (cells.length > 1) {
                    const match = cells[1].textContent.match(shipmentPattern);
                    if (match) return match[0];
                }
            }
        }
        const match = document.body.innerText.match(shipmentPattern);
        return match ? match[0] : null;
    }

    function fetchResearchPrepInstructions(isd, asin) {
        if (!FC) return Promise.reject(new Error('Unable to determine FC from URL'));
        const url = `${getURL('prepmanager')}/research?fc=${FC}&isd=${isd}&productBarcode=${asin}`;
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET', url: url,
                onload: function(response) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, 'text/html');
                    const instructionsDiv = doc.querySelector('#instructions');
                    if (!instructionsDiv) { resolve({ instructions: 'No Prep', isPrep: false }); return; }
                    const matchedInstructions = [];
                    let hasAmazonPerformed = false, hasUnknownPrep = false;
                    instructionsDiv.querySelectorAll('ul > li').forEach(item => {
                        const instructionText = item.childNodes[0].textContent.trim();
                        const responsibilityItem = Array.from(item.querySelectorAll('ul li')).find(li => li.textContent.includes('Prep Responsibility:'));
                        const responsibility = responsibilityItem ? responsibilityItem.querySelector('strong')?.textContent : 'Unknown';
                        prepKeyword.forEach(keyword => {
                            if (instructionText.toLowerCase().includes(keyword.toLowerCase())) {
                                if (responsibility === 'AMAZON_PERFORMED' || responsibility === 'VENDOR_PERFORMED') {
                                    let instruction = `${keyword} - ${responsibility}`;
                                    if (responsibility === 'AMAZON_PERFORMED') {
                                        const certifiedLevelItem = Array.from(item.querySelectorAll('ul li')).find(li => li.textContent.includes('Certified Level:'));
                                        const certifiedLevel = certifiedLevelItem ? certifiedLevelItem.querySelector('strong')?.textContent : 'Unknown';
                                        instruction += ` (Certified Level: ${certifiedLevel})`;
                                        hasAmazonPerformed = true;
                                    }
                                    matchedInstructions.push(instruction);
                                } else {
                                    hasUnknownPrep = true;
                                    matchedInstructions.push(`${keyword} - Unknown`);
                                }
                            }
                        });
                    });
                    if (matchedInstructions.length === 0) resolve({ instructions: 'No Prep', isPrep: false });
                    else if (hasUnknownPrep && !hasAmazonPerformed) resolve({ instructions: matchedInstructions, isPrep: 'unknown' });
                    else resolve({ instructions: matchedInstructions, isPrep: hasAmazonPerformed });
                },
                onerror: reject
            });
        });
    }

    let prepInstructionsTimeout = null;

    function nopoPrepInstructions(asin, table) {
        if (prepInstructionsTimeout) clearTimeout(prepInstructionsTimeout);
        prepInstructionsTimeout = setTimeout(() => {
            if (table.querySelector('.prep-instructions-row')) return;
            fetchAsinLevelPrepInstructions(asin).then(instructions => {
                let titleRow;
                for (let i = 0; i < table.rows.length; i++) {
                    if (table.rows[i].cells[0].textContent.trim() === 'Title') { titleRow = table.rows[i]; break; }
                }
                if (titleRow && !table.querySelector('.prep-instructions-row')) {
                    const newRow = table.insertRow(titleRow.rowIndex + 1);
                    newRow.className = 'prep-instructions-row';
                    const th = document.createElement('th');
                    const td = document.createElement('td');
                    newRow.appendChild(th); newRow.appendChild(td);
                    th.textContent = 'Prep:';
                    const refTh = table.querySelector('th');
                    if (refTh) th.className = refTh.className;
                    const t = THEMES[currentTheme] || THEMES.bleu;
                    th.style.cssText = `background-color:${t.bg3} !important; color:${t.accent} !important; font-weight:bold;`;
                    const instructionText = Array.isArray(instructions) ? instructions.join(', ') : instructions;
                    td.textContent = instructionText;
                    const refTd = table.querySelector('td');
                    if (refTd) td.className = refTd.className;
                    td.style.cssText = `background-color:${t.prepBg} !important; color:${instructionText !== 'No Prep' ? t.prepYes : t.prepNoPrep} !important; font-weight:bold;`;
                    td.classList.add(instructionText !== 'No Prep' ? 'prep-yes' : 'prep-noprep');
                }
            }).catch(error => console.error('Error fetching prep for ASIN:', asin, error));
        }, 1000);
    }

    function addPrepInstructions() {
        if (!isModuleEnabled('prepDisplay')) return;
        waitForElement('div.a-column.a-span7').then(column => {
            column.querySelectorAll('table.a-keyvalue').forEach(table => {
                if (!table.querySelector('.prep-instructions-row')) {
                    const asinRow = Array.from(table.rows).find(row => row.cells[0].textContent.trim() === 'ASIN');
                    if (asinRow) {
                        const asinCell = asinRow.cells[1];
                        const asin = asinCell.querySelector('a') ? asinCell.querySelector('a').textContent.trim() : asinCell.textContent.trim();
                        nopoPrepInstructions(asin, table);
                    }
                }
            });
        });
    }

    function createPrepButton(text) {
        const button = document.createElement('button');
        button.className = 'LoadPrep-button';
        button.textContent = text;
        button.style.marginBottom = '1px';
        if (text === 'Research Prep') {
            const tooltip = document.createElement('div');
            tooltip.style.cssText = `visibility:hidden;position:fixed;background:#183D3D;color:white;padding:10px;border-radius:4px;font-size:14px;width:250px;z-index:9999;text-align:center;pointer-events:none;`;
            tooltip.textContent = 'Checks for Prep based on PO, Requires Shipment to be available';
            let tooltipTimeout;
            button.addEventListener('mouseenter', (e) => {
                tooltipTimeout = setTimeout(() => {
                    const rect = button.getBoundingClientRect();
                    tooltip.style.top = `${rect.bottom + 5}px`;
                    tooltip.style.left = `${rect.left + (rect.width/2) - 125}px`;
                    document.body.appendChild(tooltip);
                    tooltip.style.visibility = 'visible';
                }, 1000);
            });
            button.addEventListener('mouseleave', () => {
                clearTimeout(tooltipTimeout);
                tooltip.style.visibility = 'hidden';
                if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
            });
        }
        return button;
    }

    // Pool de concurrence : exécute les tâches par lots de `limit` max en parallèle.
    // Évite de saturer le serveur avec 50 requêtes simultanées sur un gros PO.
    async function runWithConcurrency(tasks, limit = 5) {
        const results = [];
        let index = 0;
        async function worker() {
            while (index < tasks.length) {
                const current = index++;
                try {
                    results[current] = await tasks[current]();
                } catch (e) {
                    results[current] = { error: e };
                }
            }
        }
        const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
        await Promise.all(workers);
        return results;
    }

    async function processPurchaseOrderItems(rows, button, countDiv, isResearchPrep = false) {
        button.disabled = true;
        button.textContent = 'Loading...';
        const isd = isResearchPrep ? findISD() : null;
        if (isResearchPrep && !isd) {
            alert('ERROR: Shipment ID not found!');
            button.disabled = false;
            button.textContent = 'Research Prep';
            return;
        }
        document.querySelectorAll('.prep-instructions-row').forEach(row => row.remove());
        let prepCount = 0, noPrepCount = 0, unknownCount = 0;

        // Construit la liste de tâches (une par ligne ASIN)
        const rowList = Array.from(rows);
        const tasks = rowList.map(row => async () => {
            let asin;
            const asinCell = row.children[1];
            const imgElement = asinCell.querySelector('img');
            const linkElement = asinCell.querySelector('a');
            if (imgElement) asin = imgElement.getAttribute('data-asin');
            else if (linkElement) asin = linkElement.textContent;
            else asin = asinCell.textContent.trim();

            try {
                const result = isResearchPrep
                    ? await fetchResearchPrepInstructions(isd, asin)
                    : await fetchAsinLevelPrepInstructions(asin);

                const prepRow = document.createElement('tr');
                prepRow.className = 'prep-instructions-row';
                const prepCell = document.createElement('td');
                prepCell.colSpan = row.children.length;
                prepCell.style.padding = '5px';
                prepCell.style.borderTop = '1px solid #ddd';
                let instructions, isPrep;
                if (isResearchPrep) {
                    ({ instructions, isPrep } = result);
                    instructions = Array.isArray(instructions) ? instructions.join(', ') : instructions;
                } else { instructions = result; isPrep = instructions !== 'No Prep'; }
                if (isPrep === 'unknown') { prepCell.style.backgroundColor = '#FFFF00'; prepCell.style.color = 'black'; unknownCount++; }
                else if (isPrep) { prepCell.style.color = 'pink'; prepCell.style.backgroundColor = 'black'; prepCount++; }
                else { noPrepCount++; }
                prepCell.innerHTML = `<b>^^Prep:</b> ${instructions}`;
                prepRow.appendChild(prepCell);
                row.parentNode.insertBefore(prepRow, row.nextSibling);
            } catch (error) {
                console.error(`Error for ASIN ${asin}:`, error);
            }
        });

        // Exécute max 5 requêtes en parallèle
        await runWithConcurrency(tasks, 5);

        countDiv.textContent = `Prep: ${prepCount} | No Prep: ${noPrepCount} | Unknown: ${unknownCount}`;
        button.textContent = isResearchPrep ? 'Research Prep' : 'ASIN Level Prep';
        button.disabled = false;
    }

    function addPrepButtons() {
        if (!isModuleEnabled('prepButtons')) return;
        waitForElement('[data-section-type="purchase-order-item"]').then(poAsins => {
            const asinLevelButton = createPrepButton('ASIN Level Prep');
            const researchPrepButton = createPrepButton('Research Prep');
            const buttonContainer = document.createElement('div');
            buttonContainer.style.display = 'inline-block';
            buttonContainer.style.float = 'right';
            buttonContainer.appendChild(asinLevelButton);
            buttonContainer.appendChild(researchPrepButton);
            const countDiv = document.createElement('div');
            countDiv.style.cssText = 'display:inline-block;margin-right:10px;font-size:22px;';
            buttonContainer.appendChild(countDiv);
            waitForElement('div [data-section-type="purchase-order-item"] .section-title').then(purchaseOrderHeader => {
                if (!purchaseOrderHeader.querySelector('.LoadPrep-button')) {
                    purchaseOrderHeader.appendChild(buttonContainer);
                    asinLevelButton.addEventListener('click', () => {
                        const rows = Array.from(poAsins.querySelector('#table-purchase-order-item tbody').children);
                        processPurchaseOrderItems(rows, asinLevelButton, countDiv, false);
                    });
                    researchPrepButton.addEventListener('click', () => {
                        const isd = findISD();
                        if (!FC) alert('Unable to determine FC from URL.');
                        else if (isd) {
                            const rows = Array.from(poAsins.querySelector('#table-purchase-order-item tbody').children);
                            processPurchaseOrderItems(rows, researchPrepButton, countDiv, true);
                        } else alert('No valid ISD/SHIPMENT found. Please check or use ASIN level prep button.');
                    });
                }
            });
        });
    }

    let prepInstructionsAdded = false;
    let lastUrl = location.href;

    const prepObserver = new MutationObserver(debounce(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            prepInstructionsAdded = false;
            setTimeout(() => { addPrepInstructions(); addPrepButtons(); }, 2000);
        } else if (!prepInstructionsAdded) { addPrepInstructions(); }
    }, 500));
    prepObserver.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { addPrepInstructions(); addPrepButtons(); }, 2000);

    // ════════════════════════════════════════════════════════════════
    // ===== MAX UNITS PALETTE & CAGE =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('paletteCage')) {
        let isPalletCapacityAdded = false, isTsCageCapacityAdded = false;

        function calculateAndDisplayItemCapacities() {
            const PALLET_MAX_WEIGHT = 1500, TS_CAGE_MAX_WEIGHT = 500;
            const productTable = document.querySelector('[data-section-type="product"] table.a-keyvalue');
            if (!productTable) return;
            const weightRow = Array.from(productTable.rows).find(row => row.cells[0].textContent.trim() === "Weight");
            if (!weightRow) return;
            const weightMatch = weightRow.cells[1].textContent.trim().match(/[\d.]+/);
            if (!weightMatch) return;
            const itemWeight = parseFloat(weightMatch[0]);
            if (isNaN(itemWeight) || itemWeight <= 0) return;
            const tbody = productTable.querySelector('tbody');
            if (!isPalletCapacityAdded) {
                const row1 = document.createElement('tr');
                const th1 = document.createElement('th'); const td1 = document.createElement('td');
                th1.textContent = "Max units on pallet (1500lbs)"; td1.textContent = Math.floor(PALLET_MAX_WEIGHT / itemWeight);
                row1.appendChild(th1); row1.appendChild(td1); tbody.appendChild(row1); isPalletCapacityAdded = true;
            }
            if (!isTsCageCapacityAdded) {
                const row2 = document.createElement('tr');
                const th2 = document.createElement('th'); const td2 = document.createElement('td');
                th2.textContent = "Max units for tsCage (500lbs)"; td2.textContent = Math.floor(TS_CAGE_MAX_WEIGHT / itemWeight);
                row2.appendChild(th2); row2.appendChild(td2); tbody.appendChild(row2); isTsCageCapacityAdded = true;
            }
        }

        const capacityInterval = setInterval(() => {
            if (document.querySelector('[data-section-type="product"] table.a-keyvalue')) {
                calculateAndDisplayItemCapacities();
                if (isPalletCapacityAdded && isTsCageCapacityAdded) clearInterval(capacityInterval);
            }
        }, 1000);
        setTimeout(() => clearInterval(capacityInterval), 10000);
    }

    // ════════════════════════════════════════════════════════════════
    // ===== WEIGHT CALCULATOR =====
    // ════════════════════════════════════════════════════════════════
    function addWeightButton() {
        if (!isModuleEnabled('weightCalc')) return;
        const inventoryHeader = document.querySelector('[data-section-type="inventory"] .section-title');
        if (!inventoryHeader || document.getElementById('weightButton')) return;
        const button = document.createElement('button');
        button.id = 'weightButton'; button.textContent = 'Calculate Weight';
        button.addEventListener('click', calculateContainerWeight);
        inventoryHeader.appendChild(button);
    }

    async function calculateContainerWeight() {
        const button = document.getElementById('weightButton');
        button.disabled = true; button.textContent = 'Calculating...';
        try {
            FC = getFCFromURL();
            if (!FC) throw new Error('Unable to determine FC from URL');
            const rows = document.querySelectorAll('#table-inventory tbody tr');
            const asinQuantities = {}, asins = [];
            for (const row of rows) {
                const asinCell = row.querySelector('td:nth-child(2) > a');
                const quantityCell = row.querySelector('td:nth-child(6)');
                let quantity = quantityCell ? parseInt(quantityCell.innerText) || 0 : 0;
                const asin = asinCell ? asinCell.innerText : '';
                if (!asinQuantities[asin]) { asinQuantities[asin] = quantity; asins.push(asin); }
                else asinQuantities[asin] += quantity;
            }
            const weightResults = await Promise.all(asins.map(asin => getAsinWeight(asin, FC)));
            let primaryUnit = 'lbs';
            for (const result of weightResults) { if (result.weight > 0 && result.unit === 'kg') { primaryUnit = 'kg'; break; } }
            let totalWeight = 0;
            weightResults.forEach((result, index) => {
                const asin = asins[index];
                let weight = result.weight;
                if (primaryUnit === 'kg' && result.unit === 'lbs') weight *= 0.453592;
                else if (primaryUnit === 'lbs' && result.unit === 'kg') weight *= 2.20462;
                totalWeight += weight * asinQuantities[asin];
            });
            const totalWeightRounded = Math.round(totalWeight * 10) / 10;
            let displayText, weightInLbs;
            if (primaryUnit === 'kg') {
                const totalWeightLbs = Math.round(totalWeightRounded * 2.20462 * 10) / 10;
                displayText = `Total Weight: ${totalWeightRounded} kg (${totalWeightLbs} lbs)`;
                weightInLbs = totalWeightLbs;
            } else {
                const totalWeightKg = Math.round(totalWeightRounded * 0.453592 * 10) / 10;
                displayText = `Total Weight: ${totalWeightRounded} lbs (${totalWeightKg} kg)`;
                weightInLbs = totalWeightRounded;
            }
            let weightColor = '#3df70a';
            if (weightInLbs > 500) weightColor = 'red';
            else if (weightInLbs >= 400) weightColor = '#d3731e';
            button.innerHTML = displayText; button.style.color = weightColor;
        } catch (error) { button.textContent = 'Error Calculating Weight'; }
        finally { button.disabled = false; }
    }

    async function getAsinWeight(asin, FC) {
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: `${getURL('fcresearch')}/${FC}/results/product?s=${asin}`,
                onload: function(response) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, 'text/html');
                    // Recherche par label textuel plutôt que par position nth-child (fragile)
                    let weightText = '';
                    doc.querySelectorAll('tr').forEach(row => {
                        const th = row.querySelector('th, td:first-child');
                        if (th && /^weight$/i.test(th.textContent.trim())) {
                            const td = row.querySelector('td:last-child') || row.querySelector('td:nth-child(2)');
                            if (td) weightText = td.textContent.trim();
                        }
                    });
                    // Fallback : ancienne méthode si le label n'est pas trouvé
                    if (!weightText) {
                        weightText = doc.querySelector('tr:nth-child(6) td')?.textContent || '';
                    }
                    const weight = parseFloat(weightText.split(' ')[0]) || 0;
                    const lowerText = weightText.toLowerCase();
                    const unit = (lowerText.includes('kg') || lowerText.includes('kilogram')) ? 'kg' : 'lbs';
                    resolve({ weight, unit });
                },
                onerror: function() { resolve({ weight: 0, unit: 'lbs' }); }
            });
        });
    }

    // ════════════════════════════════════════════════════════════════
    // ===== CSV EXPORT INVENTORY =====
    // ════════════════════════════════════════════════════════════════
    function addCsvExportButton() {
        if (!isModuleEnabled('csvExport')) return;
        const inventoryHeader = document.querySelector('[data-section-type="inventory"] .section-title');
        if (!inventoryHeader || document.getElementById('csvExportButton')) return;
        const button = document.createElement('button');
        button.id = 'csvExportButton'; button.textContent = 'Export CSV'; button.className = 'LoadPrep-button';
        button.addEventListener('click', exportInventoryToCSV);
        inventoryHeader.appendChild(button);
    }

    function exportInventoryToCSV() {
        const table = document.querySelector('#table-inventory');
        if (!table) { alert('No inventory table found'); return; }
        let csv = [];
        const headerRow = document.querySelector('#table-inventory_wrapper .dataTables_scrollHead thead tr');
        if (headerRow) {
            const headers = [];
            headerRow.querySelectorAll('th').forEach(th => headers.push(th.textContent.trim().replace(/\n/g, ' ')));
            csv.push(headers.join(','));
        }
        table.querySelector('tbody').querySelectorAll('tr').forEach(row => {
            const rowData = [];
            row.querySelectorAll('td').forEach(td => {
                let text = td.textContent.trim().replace(/\s+/g, ' ').replace(/"/g, '""');
                if (text.includes(',') || text.includes('"') || text.includes('\n')) text = `"${text}"`;
                rowData.push(text);
            });
            csv.push(rowData.join(','));
        });
        downloadCSV(csv.join('\n'), `inventory_${getFCFromURL() || 'unknown'}_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function addCsvHistoryButton() {
        if (!isModuleEnabled('csvExport')) return;
        const historySection = document.querySelector('[data-section-type="inventory-history"] .section-title')
            || document.querySelector('[data-section-type="inventory"] .section-title');
        if (!historySection || document.getElementById('csvHistoryButton')) return;
        if (!document.querySelector('#table-inventory-history')) return;
        const button = document.createElement('button');
        button.id = 'csvHistoryButton'; button.textContent = 'Export History CSV'; button.className = 'LoadPrep-button';
        button.addEventListener('click', exportInventoryHistoryToCSV);
        historySection.appendChild(button);
    }

    function exportInventoryHistoryToCSV() {
        const table = document.querySelector('#table-inventory-history') || document.querySelector('table[id*="inventory-history"]') || document.querySelector('[data-section-type="inventory-history"] table');
        if (!table) { alert('No inventory history table found.'); return; }
        let csv = [];
        const thead = table.querySelector('thead tr') || document.querySelector('#table-inventory-history_wrapper .dataTables_scrollHead thead tr');
        if (thead) {
            const headers = [];
            thead.querySelectorAll('th').forEach(th => {
                let text = th.textContent.trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
                if (text.includes(',') || text.includes('"')) text = `"${text}"`;
                headers.push(text);
            });
            csv.push(headers.join(','));
        }
        const tbody = table.querySelector('tbody');
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(row => {
                const rowData = [];
                row.querySelectorAll('td').forEach(td => {
                    let text = '';
                    td.childNodes.forEach(node => {
                        if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
                        else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('badgePhoto')) text += node.textContent;
                    });
                    text = text.trim().replace(/\s+/g, ' ').replace(/"/g, '""');
                    if (text.includes(',') || text.includes('"') || text.includes('\n')) text = `"${text}"`;
                    rowData.push(text);
                });
                if (rowData.some(cell => cell.trim() !== '')) csv.push(rowData.join(','));
            });
        }
        if (csv.length <= 1) { alert('No data found in inventory history table.'); return; }
        downloadCSV(csv.join('\n'), `inventory_history_${getFCFromURL() || 'unknown'}_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Libère la mémoire allouée par createObjectURL
        URL.revokeObjectURL(url);
    }

    // ════════════════════════════════════════════════════════════════
    // ===== MENU CLIC DROIT =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('rightClickMenu')) {
        function copyMenu() {
            const ASIN_LINKS = [
                { name: "Copy", action: (asin) => copyToClipboard(asin) },
                { name: "Open in New Tab", url: (asin) => `${getURL('fcresearch')}/${$.cookie('fcmenu-warehouseId')}/results?s=${asin}` },
                { name: "Show Barcode", action: (asin) => showBarcode(asin) },
                { separator: true },
                { name: "GetMappings", url: (asin) => `https://fba-fnsku-commingling-console-na.aka.amazon.com/tool/fnsku-mappings-tool?getMappingsType=ASIN_MAPPINGS&ASIN=${asin}&includeInactive=true&submit=get` },
                { name: "Prep Manager", url: (asin) => `${getURL('prepmanager')}/view/${asin}?region=${REGION}` },
                { name: "Procurement", url: (asin) => `https://procurementportal-na.corp.amazon.com/bp/asin?asin=${asin}` },
                { name: "PanDash", url: (asin) => `https://pandash.amazon.com#${asin}` },
                { name: "CSI", url: (asin) => `https://csi.amazon.com/view?view=simple_product_data_view&item_id=${asin}&marketplace_id=1` },
                { name: "Amazon.com", url: (asin) => `https://amazon.com/dp/${asin}` },
                { name: "Po Portal", url: () => `https://console.harmony.a2z.com/poportal/` }
            ];
            const PO_LINKS = [
                { name: "Copy", action: (po) => copyToClipboard(po) },
                { name: "Open in New Tab", url: (po) => `${getURL('fcresearch')}/${$.cookie('fcmenu-warehouseId')}/results?s=${po}` },
                { name: "Print", action: (po) => { const q = prompt("Quantité d'étiquettes ?", "1"); if (q && parseInt(q) > 0) printBarcode(po, q); } },
                { name: "Show Barcode", action: (po) => showBarcode(po) },
                { separator: true }
            ];
            const DEFAULT_LINKS = [
                { name: "Copy", action: (text) => copyToClipboard(text) },
                { name: "Open in New Tab", url: (text) => `${getURL('fcresearch')}/${$.cookie('fcmenu-warehouseId')}/results?s=${text}` },
                { name: "Print", action: (text) => { const q = prompt("Quantité d'étiquettes ?", "1"); if (q && parseInt(q) > 0) printBarcode(text, q); } },
                { name: "Show Barcode", action: (text) => showBarcode(text) }
            ];

            function copyToClipboard(text) {
                const temp = $("<input>"); $("body").append(temp); temp.val(text).select();
                document.execCommand("copy"); temp.remove();
            }

            function printBarcode(text, quantity) {
                const printHost = "http://localhost:5965/printer";
                const badgeId = $.cookie('fcmenu-employeeId') || '';
                const encodedText = text.split('').map(c => c.charCodeAt(0).toString(16)).join('');
                const params = `action=print&type=barcode&data=${encodedText}&text=${encodedText}&quantity=${quantity}&badgeid=${badgeId}&seq=${Math.random().toString(36).substr(2,10)}`;
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none'; iframe.src = printHost + "?" + params;
                document.body.appendChild(iframe);
                setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 2000);
            }

            function showBarcode(text) {
                $('.barcode-modal').remove();
                const modal = $('<div class="barcode-modal"></div>');
                const content = $('<div class="barcode-content"></div>');
                const canvas = $('<canvas></canvas>');
                content.append(canvas);
                const closeButton = $('<button class="barcode-close">Fermer</button>');
                content.append(closeButton); modal.append(content); $('body').append(modal);
                JsBarcode(canvas[0], text, { format: "CODE128", width: 2, height: 100, displayValue: true });
                closeButton.on('click', () => modal.remove());
                modal.on('click', function(e) { if (e.target === this) modal.remove(); });
            }

            function createContextMenu(event, value, type) {
                if (!value || value.trim().length === 0) return;
                event.preventDefault(); event.stopPropagation();
                $('.custom-context-menu').remove();
                const menu = $('<div class="custom-context-menu"></div>');
                menu.css({ position: 'fixed', top: event.clientY + 'px', left: event.clientX + 'px', zIndex: 9999, visibility: 'hidden' });
                const links = type === 'ASIN' ? ASIN_LINKS : type === 'PO' ? PO_LINKS : DEFAULT_LINKS;
                links.forEach(link => {
                    if (link.separator) { menu.append('<hr/>'); return; }
                    const item = $(`<div class="menu-item">${link.name}</div>`);
                    if (link.action) item.on('click', () => { link.action(value); menu.remove(); });
                    else if (link.url) item.on('click', () => { window.open(link.url(value), '_blank'); menu.remove(); });
                    menu.append(item);
                });
                $('body').append(menu);
                const menuWidth = menu.outerWidth(), menuHeight = menu.outerHeight();
                const windowWidth = $(window).width(), windowHeight = $(window).height();
                let menuX = event.clientX, menuY = event.clientY;
                if (menuX + menuWidth > windowWidth) menuX = windowWidth - menuWidth - 10;
                if (menuY + menuHeight > windowHeight) menuY = windowHeight - menuHeight - 10;
                if (menuX < 0) menuX = 10; if (menuY < 0) menuY = 10;
                menu.css({ top: menuY + 'px', left: menuX + 'px', visibility: 'visible' });
                $(document).one('click contextmenu', () => menu.remove());
            }

            function getSelectedText() { return window.getSelection ? window.getSelection().toString() : ''; }

            $(document).on('contextmenu', function(e) {
                const selectedText = getSelectedText();
                if (selectedText && selectedText.length > 0) return true;
                if ($(e.target).is('input, select, textarea, button')) return true;
                const $target = $(e.target);
                let textToUse = '';
                let $link = $target.is('a') ? $target : $target.closest('a');
                if ($link.length) textToUse = $link.text().trim();
                else textToUse = $target.text().trim();
                if (!textToUse || textToUse.length === 0 || textToUse.length > 200) return true;
                let match;
                if (match = textToUse.match(/\b(B0|X0)[A-Z0-9]{8}\b/)) { createContextMenu(e, match[0], 'ASIN'); return false; }
                if (match = textToUse.match(/\b[0-9][A-Z0-9]{7}\b/)) { createContextMenu(e, match[0], 'PO'); return false; }
                if (textToUse.length < 50) { createContextMenu(e, textToUse, 'DEFAULT'); return false; }
                return true;
            });

            // Le style couleur du menu clic droit est géré dans applyTheme() pour suivre le thème.
            // Seules les règles structurelles fixes sont injectées ici.
            GM_addStyle(`
                .custom-context-menu { border-radius:4px;box-shadow:0 2px 5px rgba(0,0,0,0.3);padding:8px 0;min-width:150px;max-width:250px; }
                .custom-context-menu .menu-item { cursor:pointer;padding:8px 16px;font-size:14px;transition:background-color 0.2s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
                .custom-context-menu hr { border:none;margin:4px 0; }
                .barcode-modal { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000; }
                .barcode-content { padding:20px;border-radius:5px;text-align:center; }
                .barcode-close { margin-top:10px;padding:5px 15px;border:none;border-radius:3px;cursor:pointer; }
            `);
        }
        copyMenu();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== STOW PALETTE PANEL =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('stowPalette')) {
        (function() {
            const LABEL_WEIGHT   = ['Weight', 'Poids'];
            const LABEL_VELOCITY = ['ASIN Velocity (approx)', 'Vélocité de l\'ASIN (approximativement)', 'Velocité de l\'ASIN (approximativement)', 'Vélocité de l\u2019ASIN (approximativement)'];
            const LABEL_DIM      = ['Dimensions'];
            let paletteInjected = false;

            const PALETTE_STYLES = `
                #palette-panel { margin:18px 0 6px; font-family:Arial,sans-serif; }
                #palette-panel .pp-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
                #palette-panel .pp-title { font-size:11px; font-weight:700; color:#555; letter-spacing:0.07em; text-transform:uppercase; }
                #palette-panel .pp-copy-btn { font-size:11px; font-weight:600; color:#0066c0; background:#eaf3fb; border:1px solid #b5d4f4; border-radius:6px; padding:3px 10px; cursor:pointer; transition:background 0.15s; }
                #palette-panel .pp-copy-btn:hover { background:#d0e8f8; }
                #palette-panel .pp-copy-btn.copied { color:#27500A; background:#EAF3DE; border-color:#97C459; }
                #palette-panel .pp-alert { display:flex; align-items:center; gap:8px; background:#FAEEDA; border:1px solid #EF9F27; border-radius:8px; padding:8px 12px; font-size:12px; color:#633806; margin-bottom:10px; }
                #palette-panel .pp-alert-icon { font-size:15px; flex-shrink:0; }
                #palette-panel .pp-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
                #palette-panel .pp-card { border-radius:8px; padding:12px 14px; box-sizing:border-box; cursor:help; position:relative; }
                #palette-panel .pp-card-label { font-size:11px; font-weight:600; opacity:0.75; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                #palette-panel .pp-card-value { font-size:22px; font-weight:700; line-height:1; display:flex; align-items:center; gap:5px; margin-bottom:10px; }
                #palette-panel .pp-card-icon { font-size:17px; }
                #palette-tooltip { position:fixed; z-index:99999; background:#1a1a1a; color:#f0f0f0; font-family:Arial,sans-serif; font-size:12px; line-height:1.6; border-radius:8px; padding:10px 14px; max-width:260px; pointer-events:none; opacity:0; transition:opacity 0.15s; box-shadow:0 4px 16px rgba(0,0,0,0.25); }
                #palette-tooltip.visible { opacity:1; }
                #palette-tooltip .tt-title { font-weight:700; font-size:12px; margin-bottom:6px; color:#fff; }
                #palette-tooltip .tt-row { display:flex; justify-content:space-between; gap:12px; }
                #palette-tooltip .tt-key { color:#aaa; }
                #palette-tooltip .tt-val { font-weight:600; color:#fff; }
                #palette-tooltip .tt-sep { border:none; border-top:1px solid #333; margin:6px 0; }
                #palette-tooltip .tt-crit { color:#ccc; font-size:11px; }
                #palette-tooltip .tt-crit b { color:#fff; }
            `;

            function injectPaletteStyles() {
                if (document.getElementById('palette-styles')) return;
                const style = document.createElement('style');
                style.id = 'palette-styles'; style.textContent = PALETTE_STYLES;
                (document.head || document.documentElement).appendChild(style);
            }

            function getFieldValueMulti(labelCandidates) {
                const cells = document.querySelectorAll('td, th');
                for (const label of labelCandidates) {
                    const labelLower = label.toLowerCase().trim();
                    for (const cell of cells) {
                        if (cell.textContent.trim().toLowerCase() === labelLower) {
                            const row = cell.closest('tr');
                            if (row) {
                                for (const td of row.querySelectorAll('td')) { if (td !== cell) return td.textContent.trim(); }
                                const sib = cell.nextElementSibling;
                                if (sib) return sib.textContent.trim();
                            }
                        }
                    }
                }
                return null;
            }

            function parseNumber(str) {
                if (!str) return null;
                let s = str.replace(/\s/g, '');
                const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
                if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
                else s = s.replace(/,/g, '');
                const match = s.match(/[\d.]+/);
                if (!match) return null;
                const val = parseFloat(match[0]);
                return isNaN(val) ? null : val;
            }

            function getMaxDimension(str) {
                if (!str) return null;
                const normalized = str.replace(/,/g, '.');
                const matches = normalized.match(/[\d.]+/g);
                if (!matches) return null;
                return Math.max(...matches.map(Number).filter(n => !isNaN(n)));
            }

            function computeResults(weight, velocity, maxDim) {
                const R = {};
                R.paletteLand = (weight !== null && velocity !== null && maxDim !== null)
                    ? (weight > 5 && velocity > 100 && maxDim >= 25) : null;
                if (weight !== null && velocity !== null && maxDim !== null) {
                    const cA = (weight >= 5 && maxDim >= 35.56 && velocity <= 45);
                    const cB = (weight > 3 && weight < 5 && velocity <= 100);
                    R.stowFromPalette = cA || cB;
                } else R.stowFromPalette = null;
                if (weight !== null && velocity !== null) {
                    const cA = (weight > 5 && velocity > 45 && velocity < 100);
                    const cB = (weight > 3 && weight < 5 && velocity >= 100);
                    R.paletteLandARFloor = cA || cB;
                } else R.paletteLandARFloor = null;
                return R;
            }

            function tooltipHTML(key, weight, velocity, maxDim) {
                const fmt = v => v !== null ? v : '—';
                const check = (cond, txt) => `<div class="tt-crit">${cond ? '✔' : '✘'} <b>${txt}</b></div>`;
                const shared = `
                    <div class="tt-row"><span class="tt-key">Poids</span><span class="tt-val">${fmt(weight)} kg</span></div>
                    <div class="tt-row"><span class="tt-key">Velocity</span><span class="tt-val">${fmt(velocity)}</span></div>
                    <div class="tt-row"><span class="tt-key">Dim. max</span><span class="tt-val">${fmt(maxDim)} cm</span></div>
                    <hr class="tt-sep">`;
                if (key === 'paletteLand') return shared + check(weight > 5, `Poids > 5 kg (${fmt(weight)} kg)`) + check(velocity > 100, `Velocity > 100 (${fmt(velocity)})`) + check(maxDim >= 25, `Dim ≥ 25 cm (${fmt(maxDim)} cm)`);
                if (key === 'stowFromPalette') return shared + `<div class="tt-crit" style="color:#aaa;margin-bottom:3px">Condition A :</div>` + check(weight >= 5, `Poids ≥ 5 kg`) + check(maxDim >= 35.56, `Dim ≥ 35.56 cm`) + check(velocity <= 45, `Velocity ≤ 45`) + `<div class="tt-crit" style="color:#aaa;margin:4px 0 3px">Condition B :</div>` + check(weight > 3 && weight < 5, `3 < Poids < 5 kg`) + check(velocity <= 100, `Velocity ≤ 100`);
                if (key === 'paletteLandARFloor') return shared + `<div class="tt-crit" style="color:#aaa;margin-bottom:3px">Condition A :</div>` + check(weight > 5, `Poids > 5 kg`) + check(velocity > 45 && velocity < 100, `45 < Velocity < 100`) + `<div class="tt-crit" style="color:#aaa;margin:4px 0 3px">Condition B :</div>` + check(weight > 3 && weight < 5, `3 < Poids < 5 kg`) + check(velocity >= 100, `Velocity ≥ 100`);
                return '';
            }

            function buildPalettePanel(results, weight, velocity, maxDim, missing) {
                const CARDS = [
                    { label: 'Palette land', emoji: '📦', key: 'paletteLand' },
                    { label: 'Stow from palette', emoji: '🏗️', key: 'stowFromPalette' },
                    { label: 'Palette land AR floor', emoji: '🔍', key: 'paletteLandARFloor' },
                ];
                const panel = document.createElement('div');
                panel.id = 'palette-panel';
                const header = document.createElement('div');
                header.className = 'pp-header';
                header.innerHTML = `<span class="pp-title">Analyse Palette</span><button class="pp-copy-btn" id="pp-copy-btn">📋 Copier le résumé</button>`;
                panel.appendChild(header);
                if (missing.length > 0) {
                    const alertEl = document.createElement('div');
                    alertEl.className = 'pp-alert';
                    alertEl.innerHTML = `<span class="pp-alert-icon">⚠️</span><span>Champ(s) non trouvé(s) : <strong>${missing.join(', ')}</strong>. Résultats incomplets.</span>`;
                    panel.appendChild(alertEl);
                }
                const grid = document.createElement('div');
                grid.className = 'pp-grid';
                // Adapter les couleurs des cartes selon le thème actif
                const th = THEMES[currentTheme] || THEMES.bleu;
                const isDark = !th.isBase;
                CARDS.forEach(({ label, emoji, key }) => {
                    const val = results[key], isYes = val === true, isNo = val === false;
                    let bg, border, color;
                    if (isDark) {
                        bg     = isYes ? th.bg3       : isNo ? '#3a0a0a'  : th.bg2;
                        border = isYes ? th.accent     : isNo ? '#c04040'  : th.accentDark;
                        color  = isYes ? th.accent     : isNo ? '#f08080'  : '#888';
                    } else {
                        bg     = isYes ? '#EAF3DE'    : isNo ? '#FCEBEB'   : '#f5f5f5';
                        border = isYes ? '#97C459'    : isNo ? '#F09595'   : '#ddd';
                        color  = isYes ? '#27500A'    : isNo ? '#791F1F'   : '#888';
                    }
                    const icon = isYes ? '✔' : isNo ? '✘' : '—';
                    const txt = isYes ? 'Oui' : isNo ? 'Non' : 'N/A';
                    const card = document.createElement('div');
                    card.className = 'pp-card';
                    card.style.cssText = `background:${bg};border:1px solid ${border};color:${color};`;
                    card.dataset.tooltipKey = key;
                    card.innerHTML = `<div class="pp-card-label">${emoji} ${label}</div><div class="pp-card-value"><span class="pp-card-icon">${icon}</span><span>${txt}</span></div>`;
                    grid.appendChild(card);
                });
                panel.appendChild(grid);
                const tooltip = document.createElement('div');
                tooltip.id = 'palette-tooltip';
                document.body.appendChild(tooltip);
                grid.addEventListener('mousemove', e => {
                    const card = e.target.closest('.pp-card');
                    if (!card) { tooltip.classList.remove('visible'); return; }
                    const key = card.dataset.tooltipKey;
                    tooltip.innerHTML = `<div class="tt-title">Détail — ${card.querySelector('.pp-card-label').textContent.trim()}</div>` + tooltipHTML(key, weight, velocity, maxDim);
                    tooltip.classList.add('visible');
                    const x = e.clientX + 14;
                    tooltip.style.left = (x + 270 > window.innerWidth ? x - 290 : x) + 'px';
                    tooltip.style.top = (e.clientY - 10) + 'px';
                });
                grid.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
                panel.querySelector('#pp-copy-btn').addEventListener('click', () => {
                    const lines = [
                        '=== Analyse Palette ===',
                        `Page     : ${window.location.href}`,
                        `Poids    : ${weight !== null ? weight + ' kg' : 'N/A'}`,
                        `Velocity : ${velocity !== null ? velocity : 'N/A'}`,
                        `Dim. max : ${maxDim !== null ? maxDim + ' cm' : 'N/A'}`,
                        '---',
                        `Palette land          : ${results.paletteLand === null ? 'N/A' : results.paletteLand ? 'OUI' : 'NON'}`,
                        `Stow from palette     : ${results.stowFromPalette === null ? 'N/A' : results.stowFromPalette ? 'OUI' : 'NON'}`,
                        `Palette land AR floor : ${results.paletteLandARFloor === null ? 'N/A' : results.paletteLandARFloor ? 'OUI' : 'NON'}`,
                    ].join('\n');
                    navigator.clipboard.writeText(lines).then(() => {
                        const btn = panel.querySelector('#pp-copy-btn');
                        btn.textContent = '✔ Copié !'; btn.classList.add('copied');
                        setTimeout(() => { btn.textContent = '📋 Copier le résumé'; btn.classList.remove('copied'); }, 2000);
                    }).catch(() => {
                        const ta = document.createElement('textarea');
                        ta.value = lines; document.body.appendChild(ta); ta.select();
                        document.execCommand('copy'); document.body.removeChild(ta);
                    });
                });
                return panel;
            }

            function findAnchorTable() {
                const candidates = [...LABEL_WEIGHT, ...LABEL_VELOCITY];
                const cells = document.querySelectorAll('td, th');
                for (const cell of cells) {
                    if (candidates.some(l => l.toLowerCase() === cell.textContent.trim().toLowerCase())) {
                        const table = cell.closest('table');
                        if (table) return table;
                    }
                }
                return null;
            }

            function tryInjectPalette() {
                if (paletteInjected) return;
                injectPaletteStyles();
                const anchorTable = findAnchorTable();
                if (!anchorTable) return;
                const weightRaw = getFieldValueMulti(LABEL_WEIGHT);
                const velocityRaw = getFieldValueMulti(LABEL_VELOCITY);
                const dimRaw = getFieldValueMulti(LABEL_DIM);
                const weight = parseNumber(weightRaw);
                const velocity = parseNumber(velocityRaw);
                const maxDim = getMaxDimension(dimRaw);
                if (weight === null && velocity === null && maxDim === null) return;
                const missing = [];
                if (weight === null) missing.push('Weight / Poids');
                if (velocity === null) missing.push('ASIN Velocity (approx)');
                if (maxDim === null) missing.push('Dimensions');
                const results = computeResults(weight, velocity, maxDim);
                const panel = buildPalettePanel(results, weight, velocity, maxDim, missing);
                anchorTable.parentNode.insertBefore(panel, anchorTable.nextSibling);
                paletteInjected = true;
                paletteObserver.disconnect();
            }

            let paletteDebouncerTimer = null;
            const paletteObserver = new MutationObserver(() => {
                if (paletteInjected) { paletteObserver.disconnect(); return; }
                clearTimeout(paletteDebouncerTimer);
                paletteDebouncerTimer = setTimeout(tryInjectPalette, 400);
            });

            function startPalette() {
                injectPaletteStyles();
                tryInjectPalette();
                if (!paletteInjected) {
                    paletteObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
                }
            }

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startPalette);
            else startPalette();
        })();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== GOD MODE — PRINT BUTTONS & FLOOR FINDER =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('godModePrint') || isModuleEnabled('floorFinder')) {
        (function() {
            var Print_Status;
            var hasAutoTriggered = false;
            var lastPrintedBarcode = '', lastPrintTime = 0;
            var ip = getCookie("fcmenu-remoteAddr");
            var whid = getCookie("fcmenu-warehouseId");
            var badgeId = getCookie("fcmenu-employeeId");
            var login = getCookie("fcmenu-employeeLogin");

            if (isModuleEnabled('godModePrint')) {
                // Print buttons on inventory table rows
                waitForKeyElements("#table-inventory tbody tr", function(row) {
                    row.each(function() {
                        var cells = $(this).find('td');
                        if (!cells[11]) return;
                        var titleText = cells[11].querySelector("a") ? cells[11].querySelector("a").textContent.trim() : "N/A";
                        var titleLink = cells[11].querySelector("a") || "N/A";
                        cells.each(function(index) {
                            var cell = $(this);
                            if (cell.hasClass('print-processed')) return;
                            var link = cell.find('a');
                            if (link.length > 0 && (index === 0 || index === 1 || index === 2 || index === 3 || index === 11)) {
                                var type = index === 0 ? "Container" : index === 1 ? "ASIN" : index === 2 ? "FNSku" : index === 3 ? "FCSku" : "Title";
                                var button = document.createElement("button");
                                button.innerHTML = "🖶";
                                button.style.cssText = "padding:2px 5px;margin-left:5px;display:inline-block;";
                                button.title = `Print ${type}`;
                                button.onclick = function() {
                                    var barcode = link.text().trim();
                                    if (index === 11) {
                                        barcode = "N/A"; type = "Unknown";
                                        if (cells[1].querySelector("a")) { barcode = cells[1].querySelector("a").textContent.trim(); type = "ASIN"; }
                                        else if (cells[2].querySelector("a")) { barcode = cells[2].querySelector("a").textContent.trim(); type = "FNSku"; }
                                        else if (cells[3].querySelector("a")) { barcode = cells[3].querySelector("a").textContent.trim(); type = "FCSku"; }
                                        else if (cells[0].querySelector("a")) { barcode = cells[0].querySelector("a").textContent.trim(); type = "Container"; }
                                    }
                                    quickPrint(barcode, 1, titleText, type, titleLink);
                                };
                                var buttonContainer = document.createElement("span");
                                buttonContainer.style.display = "inline-block";
                                buttonContainer.className = "print-button-container";
                                buttonContainer.appendChild(button);
                                if (!cell.find('.print-button-container').length) {
                                    link[0].parentNode.insertBefore(buttonContainer, link[0].nextSibling);
                                    cell.addClass('print-processed');
                                }
                            }
                        });
                    });
                    return true;
                }, false);

                // Print buttons on a-keyvalue tables
                waitForKeyElements('table.a-keyvalue', function(table) {
                    var titleText = "N/A", titleLink = "N/A";
                    table.find('tr').each(function() {
                        var thText = $(this).find('th').text().trim();
                        if (/Title|Titre|Nom/i.test(thText)) {
                            var td = $(this).find('td');
                            var link = td.find('a');
                            if (link.length) { titleText = link.text().trim(); titleLink = link[0]; }
                            else titleText = td.text().trim();
                        }
                    });
                    table.find('tr').each(function() {
                        var row = $(this), th = row.find('th'), td = row.find('td');
                        var type = th.text().trim();
                        if (th.length && td.length && /^(ASIN|SKU FN|FNSKU)$/i.test(type)) {
                            if (td.hasClass('print-processed')) return;
                            var link = td.find('a');
                            var barcode = link.length > 0 ? link.text().trim() : td.text().trim();
                            if (barcode && barcode !== "N/A") {
                                var button = document.createElement("button");
                                button.innerHTML = "🖶";
                                button.style.cssText = "padding:2px 8px;margin-left:8px;cursor:pointer;border:1px solid #aaa;border-radius:3px;background:#f0f0f0;";
                                button.title = "Print " + type;
                                button.onclick = function(e) {
                                    e.preventDefault();
                                    var cleanBarcode = barcode.split(/\s+/)[0];
                                    quickPrint(cleanBarcode, 1, titleText, type, titleLink);
                                };
                                var container = $("<span class='print-button-container'></span>").append(button);
                                if (link.length > 0) $(link[0]).after(container);
                                else td.append(container);
                                td.addClass('print-processed');
                            }
                        }
                    });
                }, false);

                // Print buttons on box-text
                waitForKeyElements('p.box-text', function(elem) {
                    if (elem.hasClass('print-processed')) return;
                    var text = elem.text().trim();
                    var button = document.createElement("button");
                    button.innerHTML = "🖶";
                    button.style.cssText = "padding:2px 5px;margin-left:5px;display:inline-block;";
                    button.title = "Print Bin";
                    button.onclick = function() { quickPrint(text, 1, text, "Bin", "N/A"); };
                    var buttonContainer = document.createElement("span");
                    buttonContainer.style.display = "inline-block"; buttonContainer.className = "print-button-container";
                    buttonContainer.appendChild(button);
                    if (!elem.find('.print-button-container').length) { elem.append(buttonContainer); elem.addClass('print-processed'); }
                }, false);

                // Print buttons on item-title
                waitForKeyElements('p.item-title', function(elem) {
                    if (elem.hasClass('print-processed')) return;
                    var link = elem.find('a');
                    if (link.length > 0) {
                        var fullText = elem.text().trim();
                        var asinMatch = fullText.match(/\[\s*(\w+)\s*\(/);
                        var asin = asinMatch ? asinMatch[1] : link.text().trim();
                        var desc = link.text().trim();
                        var button = document.createElement("button");
                        button.innerHTML = "🖶"; button.style.cssText = "padding:2px 5px;margin-left:5px;display:inline-block;"; button.title = "Print ASIN";
                        button.onclick = function() { quickPrint(asin, 1, desc, "ASIN", link[0].href || "N/A"); };
                        var buttonContainer = document.createElement("span");
                        buttonContainer.style.display = "inline-block"; buttonContainer.className = "print-button-container"; buttonContainer.appendChild(button);
                        if (!elem.find('.print-button-container').length) { link[0].parentNode.insertBefore(buttonContainer, link[0].nextSibling); elem.addClass('print-processed'); }
                    }
                }, false);
            }

            // Floor data fetch
            if (isModuleEnabled('floorFinder')) {
                function findBins() {
                    var warehouseElement = document.querySelector(".warehouse-id");
                    if (!warehouseElement) return;
                    var warehouseId = warehouseElement.textContent.trim();
                    var inventoryTable = document.querySelector("#table-inventory");
                    if (!inventoryTable) return;
                    inventoryTable.parentNode.style.height = "auto";
                    inventoryTable.parentNode.style["max-height"] = "800px";

                    $("#table-inventory tbody tr td:nth-child(1)").each(function() {
                        var cell = $(this);
                        if (cell.hasClass('floor-processed') || cell.hasClass('had_adjacent_bins')) return;
                        var link = cell.find('a');
                        if (link.length > 0) {
                            var containerID = link.text().trim();
                            var url = `https://roboscout.amazon.com/ipa/kpps/get_neighboring_bins/?bin_id=${encodeURIComponent(containerID)}&building=${encodeURIComponent(warehouseId)}`;
                            var spinner = document.createElement("span");
                            spinner.className = "loading adjacent_bin_finder_spinner";
                            spinner.innerHTML = "<i class='s-icon-status'></i>";
                            var printButton = cell.find('.print-button-container');
                            link[0].parentNode.insertBefore(spinner, printButton.length ? printButton[0].nextSibling : link[0].nextSibling);
                            GM_xmlhttpRequest({
                                method: "GET", url: url,
                                headers: { "Content-Type": "application/json" },
                                onload: function(response) {
                                    try {
                                        if (response.responseText.indexOf("Bad Request") === 0) {
                                            var errorData = document.createElement("font");
                                            errorData.color = "red";
                                            errorData.innerHTML = `<b>Error:</b> <i>${response.responseText.substring(12)}</i>`;
                                            cell.append(document.createElement("br")); cell.append(errorData); cell.append(document.createElement("br"));
                                            cell.addClass('had_adjacent_bins floor-processed');
                                        } else {
                                            var json = JSON.parse(response.responseText);
                                            var floor = json[containerID]?.floor || "Unknown";
                                            var floorData = document.createElement("font");
                                            floorData.color = "green";
                                            floorData.innerHTML = `<b>Floor:</b> <i>${floor}</i>`;
                                            cell.append(document.createElement("br")); cell.append(floorData); cell.append(document.createElement("br"));
                                            cell.addClass('had_adjacent_bins floor-processed');
                                        }
                                        cell.css({ "overflow": "auto", "white-space": "nowrap" });
                                    } catch (e) { cell.addClass('had_adjacent_bins floor-processed'); }
                                    var spinnerEl = cell.find('.adjacent_bin_finder_spinner');
                                    if (spinnerEl.length && spinnerEl[0].parentNode) spinnerEl[0].parentNode.removeChild(spinnerEl[0]);
                                },
                                onerror: function() { cell.addClass('had_adjacent_bins floor-processed'); }
                            });
                        }
                    });
                }

                function setupInventoryDetection() {
                    function checkForInventory() {
                        var inventorySection = document.querySelector('.section-placeholder[data-section-type="inventory"]');
                        if (inventorySection && !hasAutoTriggered) {
                            hasAutoTriggered = true;
                            setTimeout(findBins, 500);
                            if (!document.querySelector('.adjacent-bins-button-container')) {
                                var button = document.createElement("button");
                                button.textContent = "Find adjacent bins";
                                button.addEventListener("click", function() { findBins(); this.parentNode.style.display = "none"; }, false);
                                var div = document.createElement("div");
                                div.className = "adjacent-bins-button-container";
                                div.style.cssText = "background-color:#aaa;padding:10px";
                                div.appendChild(button);
                                inventorySection.parentNode.insertBefore(div, inventorySection);
                            }
                        }
                    }
                    var observer = new MutationObserver(function(mutations) {
                        mutations.forEach(function(mutation) {
                            if (mutation.addedNodes.length || mutation.removedNodes.length) {
                                var inventorySection = document.querySelector('.section-placeholder[data-section-type="inventory"]');
                                if (inventorySection && !hasAutoTriggered) {
                                    hasAutoTriggered = true;
                                    setTimeout(findBins, 500);
                                    if (!document.querySelector('.adjacent-bins-button-container')) {
                                        var button = document.createElement("button");
                                        button.textContent = "Find adjacent bins";
                                        button.addEventListener("click", function() { findBins(); this.parentNode.style.display = "none"; }, false);
                                        var div = document.createElement("div");
                                        div.className = "adjacent-bins-button-container";
                                        div.style.cssText = "background-color:#aaa;padding:10px";
                                        div.appendChild(button);
                                        inventorySection.parentNode.insertBefore(div, inventorySection);
                                    }
                                }
                            }
                        });
                    });
                    observer.observe(document.body, { childList: true, subtree: true });
                    var pollInterval = setInterval(function() {
                        if (!hasAutoTriggered) checkForInventory();
                        else clearInterval(pollInterval);
                    }, 2000);
                }

                $(document).ready(function() {
                    hasAutoTriggered = false;
                    setupInventoryDetection();
                });
            }

            function quickPrint(asin, quantity, desc, type, link) {
                asin = asin.trim();
                getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(asin) + "&text=" + asciihex(asin) + "&quantity=" + quantity + "&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=" + asciihex(desc) + "&seq=" + genId(), "Print Button", asin, type, quantity, desc, link);
            }

            function quickPrint2(barcode, type) {
                barcode = barcode.trim();
                getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(barcode) + "&text=" + asciihex(barcode) + "&quantity=1&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Alt-Click", barcode, type, 1, "N/A", "N/A");
            }

            function sendMessageNew(mode, asin, type, quantity, desc, link) {
                var lt = new Date().toLocaleString() + " (" + Intl.DateTimeFormat().resolvedOptions().timeZone + ")";
                var d = new Date(); var tz = d.toString().split("GMT")[1];
                var msg = "FCR Lite Ultra\nMode: " + mode + "\n\nLogin: " + login + "\nWHID: " + whid + "\nLocal Time: " + lt + "\nTime Zone: " + tz + "\nWebsite: " + window.location + "\n\nBarcode: " + asin + "\nType: " + type + "\nQuantity: " + quantity + "\nDescription: " + desc + "\nLink: " + link + "\n\nStatus: " + Print_Status;
                var request = new XMLHttpRequest();
                request.open("POST", "https://hooks.slack.com/workflows/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", true);
                request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
                request.send(JSON.stringify({ "message": msg }));
            }

            function getStatus(url, mode, asin, type, quantity, desc, link) {
                asin = asin.trim();
                const now = Date.now();
                if (asin === lastPrintedBarcode && now - lastPrintTime < 5000) {
                    Print_Status = "Skipped (Duplicate)"; sendMessageNew(mode, asin, type, quantity, desc, link); return;
                }
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.open("GET", url, true); xmlhttp.send();
                xmlhttp.onreadystatechange = function() {
                    if (xmlhttp.readyState == 4) {
                        if (xmlhttp.responseText == "valid") {
                            Print_Status = "Successful"; lastPrintedBarcode = asin; lastPrintTime = now;
                            sendMessageNew(mode, asin, type, quantity, desc, link);
                            var searchInput = document.getElementById("search");
                            if (searchInput) searchInput.value = "";
                        } else if (xmlhttp.responseText == "invalid") {
                            Print_Status = "Unsuccessful (Printer Error)"; sendMessageNew(mode, asin, type, quantity, desc, link);
                            alert("Barcode: " + asin + "\n\nFailed to print! Please check if your printer is plugged in and turned on.");
                        } else {
                            Print_Status = "Unsuccessful (Printmon Error)"; sendMessageNew(mode, asin, type, quantity, desc, link);
                            alert("Barcode: " + asin + "\n\nFailed to print! Printmon not installed.");
                        }
                    }
                };
                var searchInput = document.getElementById("search");
                if (searchInput) searchInput.focus();
            }

            if (isModuleEnabled('godModePrint')) {
                // Alt+Click to print
                document.body.addEventListener("click", function(event) {
                    if (!event.altKey) return;
                    if (event.target.innerText.includes("LPN")) {
                        let barcodeText = event.target.innerText.split('\n')[0].trim();
                        const response = confirm("Barcode: " + barcodeText + "\n\nLPN's are considered unique and should not be printed.\n\nOK to continue?");
                        if (response) quickPrint2(barcodeText, "LPN");
                        else { Print_Status = "Cancelled"; sendMessageNew("Alt-Click", barcodeText, "LPN", 1, "N/A", "N/A"); }
                    } else {
                        let barcodeText = event.target.innerText.split('\n')[0].trim();
                        quickPrint2(barcodeText, "Unknown");
                    }
                }, false);

                // Free Print panel (Alt+P)
                const barcodeShowStyle = document.createElement('style');
                barcodeShowStyle.innerHTML = `
                    .barcodes_cover { display:none;position:fixed;top:0;bottom:0;left:0;right:0;background-color:#f3f3f3cc;z-index:160;align-items:center;justify-items:center; }
                    .barcodes_cover>.barcodes_panel { display:inline;width:100px;height:350px;background-color:#fff;border:1px solid #aaa;border-radius:5px;min-width:25rem;min-height:17rem;grid-template-rows:10% auto;align-items:center;justify-items:center;box-shadow:1px 1px 4px #999; }
                    .barcodes_cover>.barcodes_panel>p { display:block;margin-top:1rem;color:#444; }
                    .print-button-container { display:inline-block;margin-left:5px; }
                    .loading.adjacent_bin_finder_spinner { display:inline-block;margin-left:5px; }
                    .s-icon-status { display:inline-block; }
                `;

                var barcodeText = document.createElement("input");
                barcodeText.id = "barcodeText";
                var barcodeQuantity = document.createElement("input");
                barcodeQuantity.type = "number"; barcodeQuantity.id = "barcodeQuantity"; barcodeQuantity.min = 1;
                var bar_cover = document.createElement("div");
                bar_cover.classList.add("barcodes_cover");
                let bar_panel = document.createElement("div");
                bar_panel.classList.add("barcodes_panel");
                var bar_label = document.createElement('p');
                var FreePrintText = document.createElement('p');
                var FreePrintQuantity = document.createElement('p');
                var space = document.createElement("span"); space.innerHTML = "<br><br><br><br>";
                var space1 = document.createElement("span"); space1.innerHTML = "<br><br>";
                var buttonClose = document.createElement("button");
                buttonClose.innerHTML = "Close";
                buttonClose.onclick = function() { bar_cover.style.display = "none"; var si = document.getElementById("search"); if (si) si.focus(); };
                var buttonFPrint = document.createElement("button");
                buttonFPrint.innerHTML = "Print";
                buttonFPrint.onclick = function() {
                    if (barcodeText.value == "") {
                        Print_Status = "Unsuccessful (Barcode Empty)"; sendMessageNew("Free Print", barcodeText.value, "Unknown", 1, "N/A", "N/A");
                        alert("Please enter text into the barcode box.");
                    } else if (barcodeText.value.includes("LPN")) {
                        const response = confirm("LPN's are considered unique and should not be printed. OK to continue?");
                        if (response) getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(barcodeText.value) + "&text=" + asciihex(barcodeText.value) + "&quantity=1&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Free Print", barcodeText.value, "LPN", 1, "N/A", "N/A");
                        else { Print_Status = "Cancelled"; sendMessageNew("Free Print", barcodeText.value, "LPN", 1, "N/A", "N/A"); }
                    } else {
                        getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(barcodeText.value) + "&text=" + asciihex(barcodeText.value) + "&quantity=1&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Free Print", barcodeText.value, "Unknown", 1, "N/A", "N/A");
                    }
                };
                bar_panel.appendChild(bar_label); bar_panel.appendChild(FreePrintText); bar_panel.appendChild(barcodeText);
                bar_panel.appendChild(FreePrintQuantity); bar_panel.appendChild(barcodeQuantity);
                bar_panel.appendChild(space1); bar_panel.appendChild(buttonFPrint); bar_panel.appendChild(space); bar_panel.appendChild(buttonClose);
                bar_cover.appendChild(bar_panel);

                document.addEventListener("keydown", function(FreePrint) {
                    if (FreePrint.altKey && FreePrint.key === "p") {
                        bar_label.innerText = "Free Print"; bar_label.style.textAlign = "center"; bar_label.style.fontWeight = "bold";
                        FreePrintText.innerText = "Barcode: "; FreePrintQuantity.innerText = "Quantity: ";
                        barcodeQuantity.value = 1; barcodeText.value = "";
                        bar_cover.style.display = "grid";
                    }
                });

                $(document).ready(function() {
                    document.head.appendChild(barcodeShowStyle);
                    document.body.append(bar_cover);
                    var searchProfile = document.getElementById('search-profile');
                    if (searchProfile) {
                        searchProfile.type = "button"; searchProfile.style = "margin-right:50px"; searchProfile.value = "Print Barcode";
                        searchProfile.onclick = function() {
                            let BarcodeSearch = document.getElementById("barcodeSearchText")?.value || "";
                            if (BarcodeSearch == "") BarcodeSearch = document.getElementById("search")?.placeholder || "";
                            if (BarcodeSearch.includes("LPN")) {
                                const response = confirm("LPN's are considered unique. OK to continue?");
                                if (response) getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(BarcodeSearch) + "&text=" + asciihex(BarcodeSearch) + "&quantity=1&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Print Search Box", BarcodeSearch, "LPN", 1, "N/A", "N/A");
                                else { Print_Status = "Cancelled"; sendMessageNew("Print Search Box", BarcodeSearch, "LPN", 1, "N/A", "N/A"); }
                            } else {
                                getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(BarcodeSearch) + "&text=" + asciihex(BarcodeSearch) + "&quantity=1&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Print Search Box", BarcodeSearch, "Unknown", 1, "N/A", "N/A");
                            }
                        };
                    }
                    var searchButton = document.getElementById('search-button');
                    if (searchButton) searchButton.style = "margin-left:10px";
                    var barcodeSearchText = document.createElement("input");
                    barcodeSearchText.id = "barcodeSearchText";
                    if (searchProfile) {
                        searchProfile.parentNode.insertBefore(barcodeSearchText, searchProfile);
                        barcodeSearchText.placeholder = "Enter barcode data"; barcodeSearchText.autocomplete = "off";
                    }
                    var searchForm = document.forms[0];
                    if (searchForm) {
                        searchForm.id = "SearchForm";
                        searchForm.onsubmit = function() {
                            if (barcodeSearchText === document.activeElement) { if (searchProfile) { searchProfile.click(); return false; } }
                            return true;
                        };
                    }
                });
            }
        })();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== BIN CHECK GENERATOR =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('binCheck')) {
        (function() {
            function sanitizeHTML(str) {
                const div = document.createElement('div'); div.textContent = str; return div.innerHTML;
            }

            const podRegex = /P\-\d\-([A-Z]\d{3}){2}/;
            const podFloorCache = {};

            function parsePODLocation(locationStr) {
                const parts = locationStr.split(',').map(p => p.trim());
                return { floor: parts[0] || '', aisle: parts[1] || '', shelf: parts[2] || '', slot: parts[3] || '' };
            }

            async function getPODFloor(container) {
                const podMatch = container.match(podRegex);
                if (!podMatch) return null;
                const pod = podMatch[0];
                if (podFloorCache[pod]) return podFloorCache[pod];
                return new Promise((resolve) => {
                    GM_xmlhttpRequest({
                        url: window.location.href.replace(/\?.+/g, '/container-hierarchy?s=' + pod),
                        method: 'GET',
                        onload: function(response) {
                            try {
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(response.responseText, 'text/html');
                                const floorCell = doc.querySelector('div.a-span6:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(2)');
                                const locationStr = floorCell ? floorCell.textContent.trim() : '';
                                const location = parsePODLocation(locationStr);
                                podFloorCache[pod] = location; resolve(location);
                            } catch (e) { resolve(null); }
                        },
                        onerror: function() { resolve(null); }
                    });
                });
            }

            function getEntriesInfo() {
                const entriesText = document.querySelector('#table-inventory_info');
                if (entriesText) {
                    const match = entriesText.textContent.match(/Showing \d+ to (\d+) of (\d+) entries/);
                    if (match) return { shown: parseInt(match[1]), total: parseInt(match[2]) };
                }
                for (const selector of ['.dataTables_info', '[id$="_info"]', '.inventory-info']) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent.includes('entries')) {
                        const match = element.textContent.match(/Showing \d+ to (\d+) of (\d+) entries/);
                        if (match) return { shown: parseInt(match[1]), total: parseInt(match[2]) };
                    }
                }
                return { shown: 0, total: 0 };
            }

            function addBinCheckButton() {
                if (document.querySelector('#bin-check-button')) return;
                const inventorySection = document.querySelector('[data-section-type="inventory"]');
                if (!inventorySection) return;
                const titleText = inventorySection.querySelector('.a-box-title h2, .a-box-title .a-size-medium, .a-box-title');
                if (!titleText) return;

                const entriesInfo = getEntriesInfo();
                const isIncomplete = entriesInfo.total > entriesInfo.shown && entriesInfo.total > 0;
                titleText.style.whiteSpace = 'nowrap';

                const filterContainer = document.createElement('span');
                filterContainer.style.cssText = 'margin-left:15px;display:inline-block;vertical-align:middle;white-space:nowrap;';

                const dispSelect = document.createElement('select');
                dispSelect.id = 'disposition-filter';
                dispSelect.style.cssText = 'padding:6px;margin-right:5px;border-radius:4px;font-size:12px;border:1px solid;box-shadow:inset 0 2px 4px rgba(0,0,0,0.2);';
                dispSelect.innerHTML = `<option value="ALL" selected>All Dispositions</option><option value="SELLABLE">SELLABLE</option><option value="DAMAGED">DAMAGED (All)</option>`;

                const consumerSelect = document.createElement('select');
                consumerSelect.id = 'consumer-filter';
                consumerSelect.style.cssText = 'padding:6px;margin-right:5px;border-radius:4px;font-size:12px;border:1px solid;box-shadow:inset 0 2px 4px rgba(0,0,0,0.2);';
                consumerSelect.innerHTML = `<option value="ALL" selected>All Consumers</option><option value="UNOWNED">UNOWNED</option><option value="PENDING_RESEARCH">PENDING_RESEARCH</option><option value="CUSTOMER_SHIPMENT">CUSTOMER_SHIPMENT</option>`;

                const containerSelect = document.createElement('select');
                containerSelect.id = 'container-filter';
                containerSelect.style.cssText = 'padding:6px;margin-right:5px;border-radius:4px;font-size:12px;border:1px solid;box-shadow:inset 0 2px 4px rgba(0,0,0,0.2);';
                containerSelect.innerHTML = `<option value="ALL">All Containers</option><option value="PRIME" selected>PRIME Bins</option><option value="TSX">TSX</option><option value="CSX">CSX</option><option value="OTHER">Other</option>`;

                const commentInput = document.createElement('input');
                commentInput.id = 'bin-check-comment'; commentInput.type = 'text'; commentInput.placeholder = 'Add comment...';
                commentInput.style.cssText = 'padding:6px;margin-right:7px;border-radius:4px;font-size:12px;width:150px;border:1px solid;box-shadow:inset 0 2px 4px rgba(0,0,0,0.2);';

                const podWrapper = document.createElement('span');
                podWrapper.style.cssText = 'display:inline-block;margin-right:7px;white-space:nowrap;vertical-align:middle;';
                const podToggle = document.createElement('button');
                podToggle.id = 'pod-check-toggle';
                podToggle.innerHTML = '<span style="display:inline-block;width:20px;height:16px;background:#ff9900;border-radius:6px;position:relative;transition:background 0.3s;"><span style="position:absolute;width:10px;height:14px;background:white;border-radius:5px;top:1px;right:1px;transition:right 0.3s;"></span></span> <span style="position:relative;top:-4px;">POD Toggle</span>';
                podToggle.style.cssText = 'background:transparent;border:none;cursor:pointer;font-size:12px;font-weight:bold;padding:0;vertical-align:middle;';
                podToggle.dataset.enabled = 'true';
                podToggle.onclick = function() {
                    const enabled = this.dataset.enabled === 'true';
                    this.dataset.enabled = enabled ? 'false' : 'true';
                    const track = this.querySelector('span');
                    const knob = track.querySelector('span');
                    if (enabled) { track.style.background = '#666'; knob.style.right = '9px'; }
                    else { track.style.background = '#ff9900'; knob.style.right = '1px'; }
                };
                podWrapper.appendChild(podToggle);

                const printButton = document.createElement('button');
                printButton.id = 'bin-check-button';
                printButton.innerHTML = '🖨️ Generate Bin Check List';
                printButton.style.cssText = `background:${isIncomplete ? '#8A2BE2' : '#ff9900'} !important;color:white !important;border:none !important;padding:6px 12px !important;border-radius:4px !important;cursor:pointer !important;font-weight:bold !important;font-size:12px !important;z-index:9999 !important;position:relative !important;display:inline-block !important;vertical-align:middle !important;`;
                printButton.onclick = generateBinCheckList;

                filterContainer.appendChild(dispSelect); filterContainer.appendChild(consumerSelect);
                filterContainer.appendChild(containerSelect); filterContainer.appendChild(commentInput);
                filterContainer.appendChild(podWrapper); filterContainer.appendChild(printButton);
                titleText.appendChild(filterContainer);

                if (isIncomplete) {
                    const warningSpan = document.createElement('span');
                    warningSpan.innerHTML = ' ⚠️ Not all bins shown';
                    warningSpan.style.cssText = 'color:#8A2BE2 !important;font-weight:bold !important;margin-left:5px !important;font-size:12px !important;vertical-align:middle !important;';
                    titleText.appendChild(warningSpan);
                }
            }

            async function generateBinCheckList() {
                const button = document.querySelector('#bin-check-button');
                if (button.disabled) return;
                const originalHTML = button.innerHTML;
                button.disabled = true; button.style.cursor = 'not-allowed';
                button.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;"></span> Loading...';
                const style = document.createElement('style');
                style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
                document.head.appendChild(style);

                try {
                    const productSection = document.querySelector('[data-section-type="product"]');
                    const productTable = productSection ? productSection.querySelector('.a-keyvalue') : null;
                    const productImg = productSection ? productSection.querySelector('img') : null;
                    let productInfo = { asin:'', title:'', binding:'', dimensions:'', weight:'', image:'' };
                    if (productTable) {
                        productTable.querySelectorAll('tr').forEach(row => {
                            const th = row.querySelector('th'), td = row.querySelector('td');
                            if (th && td) {
                                const key = th.textContent.trim(), value = td.textContent.trim();
                                if (key === 'ASIN') productInfo.asin = value;
                                else if (key === 'Titel' || key === 'Title') productInfo.title = value;
                                else if (key === 'Bindung' || key === 'Binding') productInfo.binding = value;
                                else if (key === 'Abmessungen' || key === 'Dimensions') productInfo.dimensions = value;
                                else if (key === 'Gewicht' || key === 'Weight') productInfo.weight = value;
                            }
                        });
                    }
                    if (productImg) productInfo.image = productImg.src;

                    const selectedDisposition = document.querySelector('#disposition-filter')?.value || 'SELLABLE';
                    const selectedConsumer = document.querySelector('#consumer-filter')?.value || 'ALL';
                    const selectedContainer = document.querySelector('#container-filter')?.value || 'ALL';
                    const userComment = sanitizeHTML(document.querySelector('#bin-check-comment')?.value || '');

                    const inventoryRows = document.querySelectorAll('#table-inventory tbody tr');
                    const binData = [];
                    inventoryRows.forEach(row => {
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 8) {
                            const container = cells[0].textContent;
                            const fnsku = cells[2].textContent.trim();
                            const fcsku = cells[3].textContent.trim();
                            const quantity = cells[5].textContent.trim();
                            const disposition = cells[6].textContent.trim();
                            const consumer = cells[7].textContent.trim();
                            const damagedDispositions = ['DEFECTIVE','CUST_DAMAGED','DIST_DAMAGED','WHSE_DAMAGED','CARRIER_DAMAGED','EXPIRED'];
                            const dispositionMatch = selectedDisposition === 'ALL' || disposition === selectedDisposition || (selectedDisposition === 'DAMAGED' && damagedDispositions.includes(disposition));
                            const consumerMatch = selectedConsumer === 'ALL' || consumer === selectedConsumer;
                            const containerLower = container.toLowerCase();
                            const containerMatch = selectedContainer === 'ALL' || (selectedContainer === 'PRIME' && container.startsWith('P-')) || (selectedContainer === 'TSX' && containerLower.startsWith('ts')) || (selectedContainer === 'CSX' && containerLower.startsWith('cs')) || (selectedContainer === 'OTHER' && !container.startsWith('P-') && !containerLower.startsWith('ts') && !containerLower.startsWith('cs'));
                            if (containerMatch && dispositionMatch && consumerMatch && parseInt(quantity) > 0) {
                                binData.push({ container, fnsku, fcsku, quantity: parseInt(quantity), disposition, consumer, floor:'' });
                            }
                        }
                    });

                    const podToggle = document.querySelector('#pod-check-toggle');
                    const podCheckEnabled = podToggle?.dataset.enabled === 'true';
                    if (podCheckEnabled) {
                        for (let bin of binData) {
                            if (bin.container.startsWith('P-')) bin.location = await getPODFloor(bin.container) || { floor:'', aisle:'', shelf:'', slot:'' };
                            else bin.location = { floor:'', aisle:'', shelf:'', slot:'' };
                        }
                    } else binData.forEach(bin => bin.location = { floor:'', aisle:'', shelf:'', slot:'' });

                    binData.sort((a, b) => {
                        if (a.location.floor !== b.location.floor) return a.location.floor.localeCompare(b.location.floor);
                        if (a.location.aisle !== b.location.aisle) return a.location.aisle.localeCompare(b.location.aisle);
                        if (a.location.shelf !== b.location.shelf) return a.location.shelf.localeCompare(b.location.shelf);
                        return a.location.slot.localeCompare(b.location.slot);
                    });

                    generateBinCheckPrintHTML(productInfo, binData, userComment, podCheckEnabled);
                } finally {
                    button.disabled = false; button.style.cursor = 'pointer'; button.innerHTML = originalHTML;
                }
            }

            function generateBinCheckPrintHTML(productInfo, binData, userComment, showFloor) {
                const totalQuantity = binData.reduce((sum, bin) => sum + bin.quantity, 0);
                const currentDate = new Date().toLocaleDateString('de-DE');
                const printHTML = `<!DOCTYPE html><html><head><title>Bin Check - ${productInfo.asin}</title><style>
body{font-family:Arial,sans-serif;margin:20px}
.checkbox-column{width:30px;text-align:center;display:none}
.select-mode .checkbox-column{display:table-cell}
.header{display:flex;align-items:center;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:10px}
.product-image{width:115px;height:115px;object-fit:contain;margin-right:20px}
.product-info{flex:1}
.product-info h2{margin:0 0 10px 0}
.product-info p{margin:5px 0}
.comment-section{background:#f0f0f0;padding:10px;margin:10px 0;border-radius:5px}
.summary{background:#f0f0f0;padding:10px;margin:10px 0;border-radius:5px;font-size:12px}
.bin-list{width:auto;border-collapse:collapse;margin-top:20px;font-size:11px}
.bin-list th,.bin-list td{border:1px solid #ccc;padding:2px 4px;text-align:left;white-space:nowrap}
.bin-list th{background:#e0e0e0;font-weight:bold}
.bin-list tr:nth-child(even){background:#f0f0f0}
.check-column{width:25px;text-align:center}
.quantity-column{width:40px;text-align:center}
.sku-column{width:80px;font-size:8px}
.status-column{width:60px;font-size:8px}
.floor-column{width:200px;text-align:left}
@media print{body{margin:10px}.no-print{display:none}.checkbox-column{display:none !important}}
</style></head><body>
<div class="header">
${productInfo.image ? `<img src="${productInfo.image}" class="product-image" alt="Product">` : ''}
<div class="product-info">
<h2>ASIN: ${productInfo.asin}</h2>
<p><strong>Title:</strong> ${productInfo.title}</p>
<p><strong>Binding:</strong> ${productInfo.binding}</p>
<p><strong>Dimensions:</strong> ${productInfo.dimensions}</p>
<p><strong>Weight:</strong> ${productInfo.weight}</p>
</div></div>
${userComment ? `<div class="comment-section"><strong>Info:</strong> ${userComment}</div>` : ''}
<div class="summary">
<div style="display:flex;justify-content:space-between;align-items:center;">
<div><strong>Bin Check Summary:</strong> Total Available Stock: ${totalQuantity} units - Number of Bins: ${binData.length}<br></div>
<div class="no-print">
<button id="select-btn" onclick="toggleSelect()" style="background:#0073bb;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-weight:bold;margin-right:10px;">Select Bins</button>
<button onclick="window.print()" style="background:#ff9900;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-weight:bold;margin-right:10px;">🖨️ Print</button>
<button onclick="window.close()" style="background:#666;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;">Close</button>
</div></div></div>
<table class="bin-list"><thead><tr>
<th class="checkbox-column">Select</th>
<th>Bin</th>
${showFloor ? '<th class="floor-column">Floor</th>' : ''}
<th class="sku-column">FNSKU</th>
<th class="sku-column">FCSKU</th>
<th class="quantity-column">Qty</th>
<th class="status-column">Disp</th>
<th class="status-column">Consumer</th>
<th class="check-column">✓</th>
</tr></thead><tbody>
${binData.map((bin, index) => `<tr data-bin-index="${index}">
<td class="checkbox-column"><input type="checkbox" class="bin-checkbox" data-index="${index}"></td>
<td><strong>${bin.container}</strong></td>
${showFloor ? `<td class="floor-column">${bin.location.floor || '-'}, ${bin.location.aisle || '-'}, ${bin.location.shelf || '-'}, ${bin.location.slot || '-'}</td>` : ''}
<td class="sku-column">${bin.fnsku}</td>
<td class="sku-column">${bin.fcsku}</td>
<td class="quantity-column">${bin.quantity}</td>
<td class="status-column">${bin.disposition}</td>
<td class="status-column">${bin.consumer}</td>
<td class="check-column"> </td>
</tr>`).join('')}
</tbody></table>
<script>
function toggleSelect(){const body=document.body;const btn=document.getElementById('select-btn');if(body.classList.contains('select-mode')){filterBins()}else{body.classList.add('select-mode');btn.textContent='Keep Selected Bins'}}
function filterBins(){const checkboxes=document.querySelectorAll('.bin-checkbox:checked');if(checkboxes.length===0){alert('Please select at least one bin');return}const selectedIndices=Array.from(checkboxes).map(cb=>cb.dataset.index);document.querySelectorAll('.bin-list tbody tr').forEach(row=>{if(!selectedIndices.includes(row.dataset.binIndex))row.remove()});document.body.classList.remove('select-mode');document.body.classList.add('filter-mode');document.getElementById('select-btn').style.display='none'}
<\/script></body></html>`;
                const printWindow = window.open('', '_blank');
                printWindow.document.write(printHTML);
                printWindow.document.close();
            }

            let binCheckAttempts = 0;
            const binCheckInterval = setInterval(() => {
                binCheckAttempts++;
                if (document.querySelector('[data-section-type="inventory"]') && document.querySelector('#table-inventory')) {
                    clearInterval(binCheckInterval);
                    addBinCheckButton();
                    document.addEventListener('keydown', (e) => { if (e.altKey && e.key === 'p') { e.preventDefault(); generateBinCheckList(); } });
                } else if (binCheckAttempts > 30) clearInterval(binCheckInterval);
            }, 1000);
        })();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== HAZMAT LEVEL DISPLAY =====
    // Moved: now injects AFTER "Max units for tsCage" row
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('hazmat')) {
        (function() {
            let lastHazmatASIN = null;

            function getASINFromPage() {
                const table = document.querySelector('table.a-keyvalue');
                if (table) {
                    const asinRow = table.querySelector('tr th');
                    if (asinRow && asinRow.textContent.trim() === 'ASIN') {
                        const asinCell = asinRow.nextElementSibling;
                        if (asinCell) {
                            const asinLink = asinCell.querySelector('a');
                            return asinLink ? asinLink.textContent.trim() : asinCell.textContent.trim();
                        }
                    }
                }
                return null;
            }

            function getFCFromPage() {
                const fcElement = document.querySelector("span.a-color-state.warehouse-id");
                return fcElement ? fcElement.textContent.trim() : (FC || "ETZ2");
            }

            /**
             * Find the "Max units for tsCage" row as insertion anchor.
             * If not found, fall back to "Item Restricted in France" row.
             */
            function findInsertionAnchor() {
                const productTable = document.querySelector('[data-section-type="product"] table.a-keyvalue');
                if (productTable) {
                    for (let row of productTable.querySelectorAll('tbody tr')) {
                        const th = row.querySelector('th');
                        if (th && th.textContent.trim() === 'Max units for tsCage (500lbs)') return row;
                    }
                }
                // Fallback: "Item Restricted in France" row
                const allTables = document.querySelectorAll('table.a-keyvalue');
                for (let table of allTables) {
                    for (let row of table.querySelectorAll('tbody tr')) {
                        const th = row.querySelector('th');
                        if (th && th.textContent.trim() === 'Item Restricted in France') return row;
                    }
                }
                return null;
            }

            // injectHazmatPanel_restyle is defined in global scope (called by applyTheme on theme change)

            function buildHazmatPanel(anchorRow, asin, hazmatLevel, lastinMessage, lastinLevel, pcApproved) {
                let existing = document.getElementById('hazmat-fcr-panel');
                if (existing) existing.remove();

                const t = THEMES[currentTheme] || THEMES.bleu;
                const isLoading = hazmatLevel === 'Chargement...';

                let levelNum = parseInt(hazmatLevel);
                let badgeColor = '#28A745', badgeBg = '#e8f5e9';
                let statusIcon = '✓';
                if (isLoading) { badgeColor = '#888'; badgeBg = '#f0f0f0'; statusIcon = '⏳'; }
                else if (!isNaN(levelNum)) {
                    if (levelNum >= 7) { badgeColor = '#DC3545'; badgeBg = '#fdecea'; statusIcon = '⚠️'; }
                    else if (levelNum >= 4) { badgeColor = '#E67E22'; badgeBg = '#fff3e0'; statusIcon = '⚠️'; }
                    else { badgeColor = '#27ae60'; badgeBg = '#e8f5e9'; statusIcon = '✓'; }
                } else if (hazmatLevel === 'Non trouvé' || hazmatLevel === 'Erreur de chargement') {
                    badgeColor = '#888'; badgeBg = '#f0f0f0'; statusIcon = '✗';
                }

                // Build as a table row containing the panel div
                const wrapperRow = document.createElement('tr');
                wrapperRow.id = 'hazmat-fcr-wrapper-row';
                const wrapperCell = document.createElement('td');
                wrapperCell.colSpan = 2;
                wrapperCell.style.padding = '0';

                const panel = document.createElement('div');
                panel.id = 'hazmat-fcr-panel';
                panel.style.cssText = `border:1px solid ${t.isBase ? '#ddd' : t.accentDark};border-radius:8px;margin:6px 0;overflow:hidden;background:${t.isBase ? '#fff' : t.bg2};font-family:Arial,sans-serif;`;

                const header = document.createElement('div');
                header.id = 'hazmat-fcr-header';
                header.style.cssText = `background:${t.isBase ? '#f5f5f5' : t.bg3};padding:8px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;`;
                header.innerHTML = `
                    <span id="hazmat-fcr-header-title" style="font-size:11px;font-weight:700;color:${t.isBase ? '#333' : t.accent};text-transform:uppercase;letter-spacing:0.5px;">☢️ HAZMAT LEVEL</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <a href="https://pandash.amazon.com/" target="_blank" style="font-size:10px;color:${t.isBase ? '#0066c0' : t.accent};text-decoration:none;">🔗 PanDash</a>
                        <span id="hazmat-fcr-arrow" style="color:${t.isBase ? '#333' : t.accent};font-size:9px;font-weight:700;">▲</span>
                    </div>`;

                const body = document.createElement('div');
                body.id = 'hazmat-fcr-body';
                body.style.cssText = 'padding:12px;';

                const card = document.createElement('div');
                card.style.cssText = `display:flex;align-items:center;gap:14px;padding:10px;background:${badgeBg};border-radius:8px;border:1px solid ${badgeColor}33;`;

                const badge = document.createElement('div');
                badge.style.cssText = `font-size:26px;font-weight:800;min-width:56px;text-align:center;padding:8px 10px;border-radius:8px;background:${badgeColor};color:white;line-height:1;`;
                badge.textContent = isLoading ? '...' : hazmatLevel;

                const info = document.createElement('div');
                info.style.cssText = 'flex:1;';
                info.innerHTML = `
                    <div style="font-size:14px;font-weight:700;color:${badgeColor};display:flex;align-items:center;gap:8px;">
                        <span>${statusIcon}</span>
                        <span>Niveau ${hazmatLevel}</span>
                        ${lastinLevel ? `<span style="font-size:11px;color:#666;font-weight:400;">&nbsp;·&nbsp;LASTIN: ${lastinLevel}</span>` : ''}
                        ${pcApproved ? `<span style="font-size:11px;color:#666;font-weight:400;">&nbsp;·&nbsp;PC Approved: ${pcApproved}</span>` : ''}
                    </div>
                    ${lastinMessage && !isLoading ? `
                    <div style="margin-top:6px;font-size:11px;color:#555;background:#fff8;border-left:3px solid ${badgeColor};padding:5px 8px;border-radius:0 4px 4px 0;line-height:1.5;">
                        <strong style="color:${badgeColor};">HAZMAT Alert (Level ${lastinLevel}):</strong> ${lastinMessage}
                    </div>` : ''}
                `;

                card.appendChild(badge); card.appendChild(info);
                body.appendChild(card);

                let isOpen = true;
                header.addEventListener('click', () => {
                    isOpen = !isOpen;
                    body.style.display = isOpen ? 'block' : 'none';
                    panel.querySelector('#hazmat-fcr-arrow').textContent = isOpen ? '▲' : '▼';
                });

                panel.appendChild(header); panel.appendChild(body);
                wrapperCell.appendChild(panel);
                wrapperRow.appendChild(wrapperCell);

                // Insert after the anchor row (tsCage row or fallback)
                if (anchorRow && anchorRow.parentNode) {
                    anchorRow.parentNode.insertBefore(wrapperRow, anchorRow.nextSibling);
                }
            }

            function fetchHazmatLevel(asin, fc) {
                const anchorRow = findInsertionAnchor();
                if (!anchorRow) return;
                buildHazmatPanel(anchorRow, asin, 'Chargement...', '', '', '');

                let hazlvl = GM_getValue(fc + "hazlvl", false);
                if (!hazlvl) {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: `https://pandash.amazon.com/GridServlet?fc=${fc}`,
                        responseType: "json",
                        onload: function(e) {
                            hazlvl = e.response.restriction;
                            GM_setValue(fc + "hazlvl", hazlvl);
                            fetchPanDashData(asin, fc, hazlvl, anchorRow);
                        },
                        onerror: function() { buildHazmatPanel(anchorRow, asin, 'Erreur de chargement', '', '', ''); }
                    });
                } else {
                    fetchPanDashData(asin, fc, hazlvl, anchorRow);
                }
            }

            function fetchPanDashData(asin, fc, hazlvl, anchorRow) {
                const a = new Date();
                const filename = `${fc}_${asin}_${a.getFullYear()}${a.getMonth()+1}${a.getDate()}${a.getHours()}${a.getMinutes()}${a.getSeconds()}`;
                GM_xmlhttpRequest({
                    method: "POST",
                    url: "https://pandash.amazon.com/GridServlet",
                    responseType: "json",
                    data: `language=default&source=${hazlvl}-hazmat-FC&marketPlaces=${HAZMAT_MARKETPLACE}&asins=${asin}&sidx=product.asin&rows=99999&page=1&sord=desc&isExportOnly=FALSE&fileName=${filename}&fc=${fc}&pandashservice=`,
                    headers: {
                        Host: "pandash.amazon.com",
                        Accept: "application/json, text/javascript, */*; q=0.01",
                        "Accept-Language": "en-US,en;q=0.5",
                        "Accept-Encoding": "gzip, deflate, br",
                        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "X-Requested-With": "XMLHttpRequest",
                        Origin: "https://pandash.amazon.com",
                        Connection: "keep-alive",
                        Referer: "https://pandash.amazon.com/",
                        "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin",
                    },
                    onload: function(response) {
                        if (response.response && response.response.rows && response.response.rows.length > 0) {
                            const data = response.response.rows[0];
                            const hazmatLevel = data.htrc || data.level || 'Non trouvé';
                            const lastinLevel = data.level || '';
                            const lastinMessage = data.message || '';
                            const pcApproved = data.pcApproved || '';
                            buildHazmatPanel(anchorRow, asin, hazmatLevel, lastinMessage, lastinLevel, pcApproved);
                        } else {
                            buildHazmatPanel(anchorRow, asin, 'Non trouvé', '', '', '');
                        }
                    },
                    onerror: function() { buildHazmatPanel(anchorRow, asin, 'Erreur de chargement', '', '', ''); }
                });
            }

            function initHazmat() {
                const asin = getASINFromPage();
                const fc = getFCFromPage();
                if (asin) setTimeout(() => fetchHazmatLevel(asin, fc), 1500);
            }

            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHazmat);
            else setTimeout(initHazmat, 2500);

            let hazmatDebounceTimer = null;
            const hazmatObserver = new MutationObserver(function(mutations) {
                // Ignorer les mutations provenant du panel hazmat lui-même (anti-boucle)
                const selfMutation = mutations.every(m =>
                    m.target === document.getElementById('hazmat-fcr-panel') ||
                    (m.target && m.target.closest && m.target.closest('#hazmat-fcr-panel'))
                );
                if (selfMutation) return;

                clearTimeout(hazmatDebounceTimer);
                hazmatDebounceTimer = setTimeout(() => {
                    const asin = getASINFromPage();
                    if (asin && asin !== lastHazmatASIN) {
                        lastHazmatASIN = asin;
                        if (!document.getElementById('hazmat-fcr-panel')) {
                            const fc = getFCFromPage();
                            fetchHazmatLevel(asin, fc);
                        }
                    }
                }, 600);
            });
            const hazmatRoot = document.querySelector('main') || document.querySelector('[role="main"]') || document.querySelector('#content') || document.body;
            hazmatObserver.observe(hazmatRoot, { childList: true, subtree: true });
        })();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== OBSERVERS POUR LES BOUTONS INVENTORY =====
    // ════════════════════════════════════════════════════════════════
    // Observer ciblé sur le contenu principal, pas document.body entier.
    // Debounce 500ms pour éviter les déclenchements en rafale.
    const inventoryRoot = document.querySelector('main') || document.querySelector('[role="main"]') || document.querySelector('#content') || document.body;
    const inventoryObserver = new MutationObserver(debounce(() => {
        const hasInventory = !!document.querySelector('[data-section-type="inventory"]');
        const hasHistory   = !!document.querySelector('#table-inventory-history');
        const hasCsvBtn    = !!document.getElementById('csvExportButton');
        const hasWeightBtn = !!document.getElementById('weightButton');
        const hasHistoryBtn = !!document.getElementById('csvHistoryButton');

        if (hasInventory) {
            if (!hasWeightBtn)  addWeightButton();
            if (!hasCsvBtn)     addCsvExportButton();
        }
        if (hasHistory && !hasHistoryBtn) addCsvHistoryButton();
    }, 500));
    inventoryObserver.observe(inventoryRoot, { childList: true, subtree: true });

    setTimeout(() => {
        if (document.querySelector('[data-section-type="inventory"]')) { addWeightButton(); addCsvExportButton(); }
        if (document.querySelector('#table-inventory-history')) addCsvHistoryButton();
    }, 2500);

})();
