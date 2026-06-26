// ==UserScript==
// @name         TTIN Floor Sweep — T.corp Panel
// @version      5.5.9
// @description  Panneau flottant T.corp : bins par etage (5% stock), filtre etage avant recherche, etage via FCResearch, QR hover tooltip.
// @author       @JEANBAYD
// @match        https://t.corp.amazon.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @connect      fcresearch-eu.aka.amazon.com
// @connect      qi-fcresearch-eu.corp.amazon.com
// @connect      barcodeapi.org

// ==/UserScript==

(function () {
    'use strict';

    const FCR_BASE  = 'https://fcresearch-eu.aka.amazon.com';
    const PCT_MAX   = 0.05;
    const FCR_CONCURRENCY = 5;
    const KNOWN_FLOORS = ['2','3','4'];

    GM_addStyle(`
        #ttin-panel {
            position:fixed; bottom:24px; right:24px; width:490px; max-height:88vh;
            background:#111827; border:1.5px solid #1e3a5f; border-radius:14px;
            box-shadow:0 10px 50px #000a; z-index:99999;
            font-family:'Segoe UI',Arial,sans-serif; font-size:13px; color:#e2e8f0;
            display:flex; flex-direction:column; overflow:hidden;
        }
        #ttin-panel.mini { max-height:46px; width:210px; }
        #ttin-panel.mini #ttin-body { display:none; }
        #ttin-header {
            background:linear-gradient(90deg,#1e3a5f,#0f172a);
            padding:10px 14px; display:flex; align-items:center;
            justify-content:space-between; cursor:move; user-select:none;
            border-radius:12px 12px 0 0; flex-shrink:0;
        }
        #ttin-header .htitle { font-weight:700; font-size:14px; color:#f87171; letter-spacing:.4px; }
        #ttin-header .htitle small { color:#93c5fd; font-weight:400; font-size:11px; margin-left:7px; }
        #ttin-hbtns { display:flex; gap:5px; }
        #ttin-hbtns button {
            background:none; border:1px solid #1e3a5f; color:#93c5fd;
            border-radius:5px; padding:2px 8px; cursor:pointer; font-size:12px;
        }
        #ttin-hbtns button:hover { background:#1e3a5f; }
        #ttin-body { overflow-y:auto; padding:10px 12px; flex:1; }
        #ttin-body::-webkit-scrollbar { width:4px; }
        #ttin-body::-webkit-scrollbar-thumb { background:#1e3a5f; border-radius:3px; }
        .ttin-fcbar {
            display:flex; align-items:center; gap:6px;
            font-size:11px; color:#93c5fd; margin-bottom:8px;
        }
        .ttin-fcbar input {
            width:58px; padding:3px 6px; border-radius:5px;
            border:1px solid #1e3a5f; background:#0f172a; color:#e2e8f0;
            font-size:11px; text-transform:uppercase;
        }
        .ttin-fcbar button {
            padding:3px 9px; border-radius:5px; border:none;
            background:#1e3a5f; color:#93c5fd; cursor:pointer; font-size:11px;
        }
        #ttin-floor-filter-wrap {
            background:#0f172a; border:1px solid #1e3a5f; border-radius:8px;
            padding:8px 10px; margin-bottom:9px;
        }
        #ttin-floor-filter-title {
            font-size:11px; color:#93c5fd; font-weight:700;
            margin-bottom:6px;
        }
        #ttin-floor-btns { display:flex; flex-wrap:wrap; gap:5px; }
        .ttin-fbtn {
            padding:3px 10px; border-radius:20px; border:1px solid #1e3a5f;
            background:#111827; color:#93c5fd; font-size:11px; font-weight:600;
            cursor:pointer; transition:all .15s; white-space:nowrap;
        }
        .ttin-fbtn:hover { border-color:#f87171; color:#f87171; }
        .ttin-fbtn.active { background:#f87171; border-color:#f87171; color:#fff; }
        .ttin-fbtn.tall { border-color:#4b8bcc; }
        .ttin-fbtn.tall.active { background:#1e3a5f; border-color:#93c5fd; color:#fff; }
        #ttin-floor-hint { font-size:10px; color:#4b5563; margin-top:5px; }
        .ttin-searchbar { display:flex; gap:6px; margin-bottom:8px; }
        .ttin-searchbar input {
            flex:1; padding:5px 9px; border-radius:6px;
            border:1px solid #1e3a5f; background:#0f172a; color:#e2e8f0;
            font-size:12px; outline:none;
        }
        .ttin-searchbar input::placeholder { color:#4b5563; }
        .ttin-searchbar button {
            padding:5px 12px; border-radius:6px; border:none;
            background:#f87171; color:#fff; font-weight:700; cursor:pointer; font-size:12px;
        }
        .ttin-searchbar button:hover { background:#ef4444; }
        #ttin-scan-btn {
            width:100%; padding:7px; border-radius:7px; border:none;
            background:linear-gradient(90deg,#1e3a5f,#f87171);
            color:#fff; font-weight:700; font-size:12px; cursor:pointer;
            margin-bottom:10px; letter-spacing:.4px;
        }
        #ttin-scan-btn:hover { opacity:.85; }
        .ttin-card {
            background:#1f2937; border:1px solid #1e3a5f;
            border-radius:9px; margin-bottom:9px; overflow:hidden;
        }
        .ttin-card-head {
            display:flex; align-items:center; justify-content:space-between;
            padding:7px 11px; cursor:pointer; background:#1e3a5f;
        }
        .ttin-card-head:hover { background:#263f60; }
        .ttin-card-asin { font-weight:700; color:#f87171; font-size:13px; }
        .ttin-card-sub {
            font-size:10px; color:#93c5fd; margin-left:7px;
            max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .ttin-card-tog { color:#93c5fd; font-size:12px; flex-shrink:0; }
        .ttin-card-body { padding:8px 10px; display:none; }
        .ttin-card-body.open { display:block; }
        .ttin-stock { font-size:11px; color:#93c5fd; margin-bottom:6px; }
        .ttin-progress-wrap {
            background:#0f172a; border-radius:4px; height:5px;
            margin-bottom:7px; overflow:hidden;
        }
        .ttin-progress-bar { height:5px; background:#f87171; border-radius:4px; transition:width .3s; }
        .ttin-floor { margin-bottom:8px; }
        .ttin-floor-lbl {
            font-weight:700; color:#f87171; font-size:12px;
            margin-bottom:3px; display:flex; align-items:center; gap:7px;
        }
        .ttin-floor-quota { font-size:10px; font-weight:400; color:#93c5fd; }
        .ttin-bin {
            display:flex; align-items:center; justify-content:space-between;
            padding:2px 6px; border-radius:4px; font-size:11px;
            margin-bottom:2px; background:#111827;
        }
        .ttin-bin:hover { background:#1e3a5f; }
        .ttin-bin-name { color:#e2e8f0; font-family:monospace; }
        .ttin-bin-loc { color:#6b7280; font-size:10px; margin-left:4px; }
        .ttin-bin-qty {
            background:#f87171; color:#fff; border-radius:4px;
            padding:1px 6px; font-size:10px; font-weight:700; flex-shrink:0;
        }
        .ttin-loading {
            color:#93c5fd; font-size:11px; padding:5px 2px;
            display:flex; align-items:center; gap:6px;
        }
        .ttin-loading::before {
            content:''; width:11px; height:11px;
            border:2px solid #93c5fd; border-top-color:#f87171;
            border-radius:50%; display:inline-block;
            animation:ttin-spin .7s linear infinite;
        }
        @keyframes ttin-spin { to { transform:rotate(360deg); } }
        .ttin-err   { color:#f87171; font-size:11px; padding:4px 2px; }
        .ttin-empty { color:#4b5563; font-size:11px; padding:4px 2px; }
        .ttin-warn  {
            color:#f87171; font-size:11px; background:#1f2937;
            border-radius:6px; padding:6px 10px; margin-bottom:8px;
        }
        .ttin-hint { font-size:10px; color:#4b5563; text-align:center; margin-bottom:4px; }

        #ttin-type-filter-wrap {
            background:#0f172a; border:1px solid #1e3a5f; border-radius:8px;
            padding:8px 10px; margin-bottom:9px;
        }
        #ttin-type-filter-title { font-size:11px; color:#93c5fd; font-weight:700; margin-bottom:6px; }
        #ttin-type-btns { display:flex; flex-wrap:wrap; gap:5px; }
        .ttin-type-btn {
            padding:3px 10px; border-radius:20px; border:1px solid #1e3a5f;
            background:#111827; color:#93c5fd; font-size:11px; font-weight:600;
            cursor:pointer; transition:all .15s; white-space:nowrap;
        }
        .ttin-type-btn:hover { border-color:#f87171; color:#f87171; }
        .ttin-type-btn.active { background:#f87171; border-color:#f87171; color:#fff; }
        .ttin-card.hidden { display:none; }
        .ttin-bin-actions { display:flex; align-items:center; gap:5px; flex-shrink:0; }
        .ttin-copy-btn {
            padding:1px 7px; border-radius:4px; border:none;
            background:#1e3a5f; color:#93c5fd; font-size:10px; cursor:pointer;
            transition:all .15s; white-space:nowrap;
        }
        .ttin-copy-btn:hover { background:#22c55e; color:#fff; }
        .ttin-copy-btn.copied { background:#22c55e; color:#fff; }
        .ttin-qr-trigger {
            display:inline-flex; align-items:center;
            padding:1px 7px; border-radius:4px; border:none;
            background:#0f172a; color:#93c5fd; font-size:10px; cursor:default;
            white-space:nowrap; user-select:none;
        }
        #ttin-qr-bubble {
            display:none; position:fixed;
            background:#fff; border-radius:8px; padding:8px;
            box-shadow:0 4px 24px #000d; z-index:9999999;
            pointer-events:none;
        }
        #ttin-qr-bubble::after {
            content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
            border:7px solid transparent; border-top-color:#fff;
        }
    `);

    let currentFC     = GM_getValue('ttin_fc', 'ETZ2');
    let selectedFloor = GM_getValue('ttin_floor', 'ALL');
    let selectedType  = 'ALL';
    // Types de tickets T.corp reconnus — ordre d'affichage
    var TICKET_TYPES = [
        { key: 'TTIN',       label: 'TTIN',        pattern: /\bTTIN\b/i },
        { key: 'BINCHECK',   label: 'Bin Check',   pattern: /bin.?check/i },
        { key: 'ANDON',      label: 'Andon',       pattern: /\bandon\b/i },
        { key: 'FLOORSWEEP', label: 'Floor Sweep', pattern: /floor.?sweep/i },
        { key: 'PREVIEW',    label: 'Preview',     pattern: /\bpreview\b/i },
        { key: 'OTHER',      label: 'Autre',       pattern: null }
    ];

    function getTicketType(title) {
        for (var i = 0; i < TICKET_TYPES.length - 1; i++) {
            if (TICKET_TYPES[i].pattern && TICKET_TYPES[i].pattern.test(title)) return TICKET_TYPES[i].key;
        }
        return 'OTHER';
    }

    const panel = document.createElement('div');
    panel.id = 'ttin-panel';
    panel.innerHTML =
        '<div id="ttin-header">' +
            '<div class="htitle">\uD83D\uDCE6 TTIN Floor Sweep <small>5% / \u00e9tage</small></div>' +
            '<div id="ttin-hbtns">' +
                '<button id="ttin-min">\u2014</button>' +
                '<button id="ttin-close">\u2715</button>' +
            '</div>' +
        '</div>' +
        '<div id="ttin-body">' +
            '<div class="ttin-fcbar">' +
                'FC: <input id="ttin-fc-inp" maxlength="6" />' +
                '<button id="ttin-fc-ok">\u2713</button>' +
                '<button id="ttin-debug-btn" title="Debug: voir les réponses FCResearch dans la console" style="background:#1e3a5f;border:1px solid #f87171;color:#f87171;border-radius:5px;padding:2px 7px;cursor:pointer;font-size:11px;">🔍</button>' +
                '<span id="ttin-fc-lbl" style="margin-left:4px;color:#4b5563;"></span>' +
            '</div>' +
            '<div id="ttin-floor-filter-wrap">' +
                '<div id="ttin-floor-filter-title">\uD83C\uDFE2 Filtrer par \u00e9tage <small style="font-weight:400;color:#4b5563;">(avant recherche)</small></div>' +
                '<div id="ttin-floor-btns"></div>' +
                '<div id="ttin-floor-hint"></div>' +
            '</div>' +
            '<div id="ttin-type-filter-wrap">' +
                '<div id="ttin-type-filter-title">\uD83C\uDFF7\uFE0F Filtrer par type de ticket</div>' +
                '<div id="ttin-type-btns"></div>' +
            '</div>' +
            '<div class="ttin-searchbar">' +
                '<input id="ttin-asin-inp" placeholder="ASIN manuel (B0\u2026, X0\u2026, ZZ\u2026)" />' +
                '<button id="ttin-go">\uD83D\uDD0D</button>' +
            '</div>' +
            '<button id="ttin-scan-btn">\uD83D\uDD04 Scanner les tickets visibles</button>' +
            '<div id="ttin-area"></div>' +
        '</div>';
    document.body.appendChild(panel);

    // ── Code 128B — générateur SVG local (aucun appel réseau) ───────────────
    var C128 = (function() {
        // Valeurs des barres pour chaque caractère Code 128B (encodage 6-éléments)
        var BARS = [
            '212222','222122','222221','121223','121322','131222','122213','122312',
            '132212','221213','221312','231212','112232','122132','122231','113222',
            '123122','123221','223211','221132','221231','213212','223112','312131',
            '311222','321122','321221','312212','322112','322211','212123','212321',
            '232121','111323','131123','131321','112313','132113','132311','211313',
            '231113','231311','112133','112331','132131','113123','113321','133121',
            '313121','211331','231131','213113','213311','213131','311123','311321',
            '331121','312113','312311','332111','314111','221411','431111','111224',
            '111422','121124','121421','141122','141221','112214','112412','122114',
            '122411','142112','142211','241211','221114','413111','241112','134111',
            '111242','121142','121241','114212','124112','124211','411212','421112',
            '421211','212141','214121','412121','111143','111341','131141','114113',
            '114311','411113','411311','113141','114131','311141','411131','211412',
            '211214','211232','2331112'
        ];
        // START B = index 104, STOP = index 106
        var START_B = 104, STOP = 106;

        function encode(text) {
            var codes = [START_B];
            var check = START_B;
            for (var i = 0; i < text.length; i++) {
                var c = text.charCodeAt(i) - 32; // Code 128B : ASCII 32-127
                if (c < 0 || c > 94) c = 0;     // remplace les inconnus par espace
                codes.push(c);
                check += c * (i + 1);
            }
            codes.push(check % 103); // checksum
            codes.push(STOP);
            return codes;
        }

        function makeSVG(text) {
            var codes  = encode(text);
            var bars   = codes.map(function(c) { return BARS[c]; }).join('');
            var W = 2, H = 60, pad = 10;
            var totalW = 0;
            for (var i = 0; i < bars.length; i++) totalW += parseInt(bars[i]) * W;
            var svgW = totalW + pad * 2;
            var rects = '';
            var x = pad, dark = true;
            for (var j = 0; j < bars.length; j++) {
                var w = parseInt(bars[j]) * W;
                if (dark) rects += '<rect x="' + x + '" y="4" width="' + w + '" height="' + H + '" fill="#000"/>';
                x += w;
                dark = !dark;
            }
            // Texte centré sous le code-barres
            rects += '<text x="' + (svgW/2) + '" y="' + (H+18) + '" font-family="monospace" font-size="11" text-anchor="middle" fill="#000">' + text + '</text>';
            return '<svg xmlns="http://www.w3.org/2000/svg" width="' + svgW + '" height="' + (H+24) + '">'
                 + '<rect width="' + svgW + '" height="' + (H+24) + '" fill="#fff"/>'
                 + rects + '</svg>';
        }

        return { makeSVG: makeSVG };
    })();

    // ── Bulle code-barres (SVG local) ────────────────────────────────────────
    var qrBubble = document.createElement('div');
    qrBubble.id = 'ttin-qr-bubble';
    qrBubble.style.cssText = 'display:none;position:fixed;background:#fff;border-radius:8px;padding:8px;box-shadow:0 4px 24px #000d;z-index:9999999;pointer-events:none;';
    document.body.appendChild(qrBubble);
    var qrHideTimer = null;

    function showQRBubble(trigger, binCode) {
        clearTimeout(qrHideTimer);
        qrBubble.innerHTML = C128.makeSVG(binCode);
        qrBubble.style.display = 'block';
        var r  = trigger.getBoundingClientRect();
        var bw = qrBubble.offsetWidth || 260;
        var bh = qrBubble.offsetHeight || 100;
        // Aligne le bord gauche de la bulle sur le bord gauche du bouton CB
        var left = r.left;
        var top  = r.top - bh - 6;
        if (top < 4) top = r.bottom + 6;
        if (left + bw > window.innerWidth - 4) left = window.innerWidth - bw - 4;
        if (left < 4) left = 4;
        qrBubble.style.left = left + 'px';
        qrBubble.style.top  = top  + 'px';
    }

    function hideQRBubble() {
        qrHideTimer = setTimeout(function() { qrBubble.style.display = 'none'; }, 80);
    }

    // Init valeurs
    panel.querySelector('#ttin-fc-inp').value = currentFC;
    panel.querySelector('#ttin-fc-lbl').textContent = currentFC;
    function buildTypeButtons(presentTypes) {
        var wrap = panel.querySelector('#ttin-type-btns');
        wrap.innerHTML = '';
        var allBtn = document.createElement('button');
        allBtn.className = 'ttin-type-btn' + (selectedType === 'ALL' ? ' active' : '');
        allBtn.textContent = 'Tous';
        allBtn.onclick = function() { setType('ALL'); };
        wrap.appendChild(allBtn);
        TICKET_TYPES.forEach(function(t) {
            if (!presentTypes || presentTypes.indexOf(t.key) !== -1) {
                var btn = document.createElement('button');
                btn.className = 'ttin-type-btn' + (selectedType === t.key ? ' active' : '');
                btn.textContent = t.label;
                btn.dataset.type = t.key;
                btn.onclick = function() { setType(this.dataset.type); };
                wrap.appendChild(btn);
            }
        });
    }

    function setType(t) {
        selectedType = t;
        buildTypeButtons();
        // Montre/cache les cards selon le type
        var area = panel.querySelector('#ttin-area');
        area.querySelectorAll('.ttin-card').forEach(function(card) {
            var cardType = card.dataset.ticketType || 'OTHER';
            card.classList.toggle('hidden', t !== 'ALL' && cardType !== t);
        });
    }

    function buildFloorButtons() {
        const wrap = panel.querySelector('#ttin-floor-btns');
        wrap.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'ttin-fbtn tall' + (selectedFloor === 'ALL' ? ' active' : '');
        allBtn.textContent = 'Tous';
        allBtn.onclick = function() { setFloor('ALL'); };
        wrap.appendChild(allBtn);
        KNOWN_FLOORS.forEach(function(f) {
            const btn = document.createElement('button');
            btn.className = 'ttin-fbtn' + (selectedFloor === f ? ' active' : '');
            btn.textContent = f;
            btn.onclick = function() { setFloor(f); };
            wrap.appendChild(btn);
        });
        updateHint();
    }

    function setFloor(f) {
        selectedFloor = f;
        GM_setValue('ttin_floor', f);
        buildFloorButtons();
    }

    function updateHint() {
        const hint = panel.querySelector('#ttin-floor-hint');
        if (selectedFloor === 'ALL') {
            hint.textContent = 'Tous les \u00e9tages r\u00e9solus (plus lent si beaucoup de bins).';
        } else {
            hint.textContent = '\u00c9tage "' + selectedFloor + '" uniquement \u2014 Roboscout limit\u00e9.';
        }
    }

    buildFloorButtons();

    // Drag
    var drag = false, ox = 0, oy = 0;
    panel.querySelector('#ttin-header').addEventListener('mousedown', function(e) {
        if (e.target.closest('button')) return;
        drag = true;
        var r = panel.getBoundingClientRect();
        ox = e.clientX - r.left; oy = e.clientY - r.top;
        panel.style.transition = 'none';
    });
    document.addEventListener('mousemove', function(e) {
        if (!drag) return;
        var x = Math.max(0, Math.min(window.innerWidth  - panel.offsetWidth,  e.clientX - ox));
        var y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, e.clientY - oy));
        panel.style.right = 'auto'; panel.style.bottom = 'auto';
        panel.style.left = x + 'px'; panel.style.top = y + 'px';
    });
    document.addEventListener('mouseup', function() { drag = false; panel.style.transition = ''; });

    panel.querySelector('#ttin-min').onclick = function() {
        panel.classList.toggle('mini');
        panel.querySelector('#ttin-min').textContent = panel.classList.contains('mini') ? '\u25a1' : '\u2014';
    };
    panel.querySelector('#ttin-close').onclick = function() { panel.style.display = 'none'; };
    panel.querySelector('#ttin-fc-ok').onclick = function() {
        var v = panel.querySelector('#ttin-fc-inp').value.trim().toUpperCase();
        if (v) { currentFC = v; GM_setValue('ttin_fc', v); panel.querySelector('#ttin-fc-lbl').textContent = v; }
    };
    panel.querySelector('#ttin-debug-btn').onclick = function() {
        var bin = panel.querySelector('#ttin-asin-inp').value.trim().toUpperCase() || 'P-8-H662E907';
        alert('[TTIN DEBUG] Ouvre la console (F12) — test sur bin: ' + bin + ' / FC: ' + currentFC);
        debugBin(bin, currentFC);
    };
    panel.querySelector('#ttin-go').onclick = function() {
        var asin = panel.querySelector('#ttin-asin-inp').value.trim().toUpperCase();
        if (!asin) return;
        var area = panel.querySelector('#ttin-area');
        area.innerHTML = '';
        analyzeASIN(asin, asin, '', area);
    };
    panel.querySelector('#ttin-scan-btn').onclick = scanPage;

    function extractASIN(text) {
        var m = text.match(/\b((?:B0|X0|ZZ)[A-Z0-9]{8})\b/i);
        return m ? m[1].toUpperCase() : null;
    }

    function scanPage() {
        var area = panel.querySelector('#ttin-area');
        area.innerHTML = '';
        selectedType = 'ALL'; // reset filtre type à chaque scan
        var found = new Map();

        // Stratégie 1 : lignes de tableau — cherche le titre + lien ticket dans la même ligne
        document.querySelectorAll('table tbody tr').forEach(function(row) {
            var rowText = row.textContent;
            var asin = extractASIN(rowText);
            if (asin && !found.has(asin)) {
                var best = '', ticketId = '';
                row.querySelectorAll('td, a').forEach(function(el) {
                    var t = el.textContent.trim();
                    if (t.length > best.length && !extractASIN(t)) best = t;
                    // Cherche un lien ticket t.corp (V..., D..., P..., etc.)
                    if (el.tagName === 'A' && el.href) {
                        var m = el.href.match(/t\.corp\.amazon\.com\/([A-Z]\d+)/);
                        if (m) ticketId = m[1];
                    }
                });
                // Cherche aussi dans le texte brut de la ligne
                if (!ticketId) {
                    var m2 = rowText.match(/\b([A-Z]\d{7,})\b/);
                    if (m2) ticketId = m2[1];
                }
                var title = best || rowText.trim();
                found.set(asin, { title: title.length > 80 ? title.slice(0, 80) + '\u2026' : title, ticketId: ticketId });
            }
        });

        // Stratégie 2 : liens <a> hors tableau (titres de tickets)
        document.querySelectorAll('a').forEach(function(el) {
            var text = el.textContent.trim();
            var asin = extractASIN(text);
            if (asin && !found.has(asin)) {
                var ticketId = '';
                if (el.href) {
                    var m = el.href.match(/t\.corp\.amazon\.com\/([A-Z]\d+)/);
                    if (m) ticketId = m[1];
                }
                if (!ticketId) {
                    var m2 = text.match(/\b([A-Z]\d{7,})\b/);
                    if (m2) ticketId = m2[1];
                }
                found.set(asin, { title: text.length > 80 ? text.slice(0, 80) + '\u2026' : text, ticketId: ticketId });
            }
        });

        if (!found.size) {
            area.innerHTML = '<div class="ttin-warn">\u26a0\ufe0f Aucun ASIN trouv\u00e9 (B0\u2026, X0\u2026, ZZ\u2026) sur cette page.</div>';
            return;
        }
        var hint = document.createElement('div');
        hint.className = 'ttin-hint';
        hint.textContent = found.size + ' ASIN(s) \u2014 \u00e9tage\u00a0: ' + (selectedFloor === 'ALL' ? 'Tous' : selectedFloor);
        area.appendChild(hint);

        var asinQueue = [];
        var presentTypes = [];
        found.forEach(function(info, asin) {
            var title    = typeof info === 'string' ? info : info.title;
            var ticketId = typeof info === 'string' ? '' : (info.ticketId || '');
            asinQueue.push({ asin: asin, title: title, ticketId: ticketId });
            var t = getTicketType(title);
            if (presentTypes.indexOf(t) === -1) presentTypes.push(t);
        });
        buildTypeButtons(presentTypes);

        var asinActive = 0;
        var asinIdx = 0;
        var ASIN_CONCURRENCY = 2;
        function nextASIN() {
            while (asinActive < ASIN_CONCURRENCY && asinIdx < asinQueue.length) {
                var item = asinQueue[asinIdx++];
                asinActive++;
                analyzeASIN(item.asin, item.title, item.ticketId, area, function() {
                    asinActive--;
                    nextASIN();
                });
            }
        }
        nextASIN();
    }

    function analyzeASIN(asin, title, ticketId, container, onDone) {
        var card = document.createElement('div');
        card.className = 'ttin-card';
        card.dataset.ticketType = getTicketType(title);
        // Applique le filtre courant immédiatement
        if (selectedType !== 'ALL' && card.dataset.ticketType !== selectedType) {
            card.classList.add('hidden');
        }

        var head = document.createElement('div');
        head.className = 'ttin-card-head';

        var headLeft = document.createElement('div');
        headLeft.style.cssText = 'display:flex;align-items:center;min-width:0;gap:6px;';
        headLeft.innerHTML =
            '<span class="ttin-card-asin">' + esc(asin) + '</span>' +
            '<span class="ttin-card-sub">' + esc(title) + '</span>';

        // Bouton ticket t.corp
        if (ticketId) {
            var ticketBtn = document.createElement('a');
            ticketBtn.href = 'https://t.corp.amazon.com/' + ticketId;
            ticketBtn.target = '_blank';
            ticketBtn.rel = 'noopener noreferrer';
            ticketBtn.textContent = '🎫 ' + ticketId;
            ticketBtn.style.cssText = 'flex-shrink:0;padding:1px 7px;border-radius:4px;background:#1e3a5f;color:#93c5fd;font-size:10px;text-decoration:none;white-space:nowrap;';
            ticketBtn.onclick = function(e) { e.stopPropagation(); };
            headLeft.appendChild(ticketBtn);
        }

        var headTog = document.createElement('span');
        headTog.className = 'ttin-card-tog';
        headTog.textContent = '\u25bc';

        head.appendChild(headLeft);
        head.appendChild(headTog);

        var body = document.createElement('div');
        body.className = 'ttin-card-body open';
        body.innerHTML = '<div class="ttin-loading">Inventaire FCResearch (' + esc(currentFC) + ')\u2026</div>';

        card.appendChild(head);
        card.appendChild(body);
        container.appendChild(card);

        head.onclick = function() {
            body.classList.toggle('open');
            head.querySelector('.ttin-card-tog').textContent = body.classList.contains('open') ? '\u25bc' : '\u25b6';
        };

        fetchInventory(asin, currentFC, function(bins, totalQty, err) {
            body.innerHTML = '';
            if (err) { body.innerHTML = '<div class="ttin-err">\u274c ' + esc(err) + '</div>'; if (onDone) onDone(); return; }
            if (!bins.length) { body.innerHTML = '<div class="ttin-empty">Aucun bin SELLABLE sur ' + esc(currentFC) + '</div>'; if (onDone) onDone(); return; }

            var maxPerFloor = Math.max(1, Math.floor(totalQty * PCT_MAX));
            var safeAsin = asin.replace(/[^A-Z0-9]/g, '');

            var stockDiv = document.createElement('div');
            stockDiv.className = 'ttin-stock';
            stockDiv.innerHTML = 'Stock total\u00a0: <b>' + totalQty + '</b> \u00b7 Quota/\u00e9tage\u00a0: <b>' + maxPerFloor + '</b> (5%)' +
                (selectedFloor !== 'ALL' ? ' \u00b7 <b style="color:#f87171">\u00c9tage ' + esc(selectedFloor) + ' uniquement</b>' : '');

            var loaderDiv = document.createElement('div');
            loaderDiv.className = 'ttin-loading';
            loaderDiv.id = 'ttin-lbl-' + safeAsin;
            loaderDiv.textContent = 'Roboscout\u00a0: 0 / ' + bins.length + ' bins\u2026';

            var progressWrap = document.createElement('div');
            progressWrap.className = 'ttin-progress-wrap';
            var progressBar = document.createElement('div');
            progressBar.className = 'ttin-progress-bar';
            progressBar.id = 'ttin-pb-' + safeAsin;
            progressBar.style.width = '0%';
            progressWrap.appendChild(progressBar);

            body.appendChild(stockDiv);
            body.appendChild(loaderDiv);
            body.appendChild(progressWrap);

            resolveFloors(bins, currentFC, selectedFloor,
                function(done, total) {
                    var pct = Math.round((done / total) * 100);
                    var pb = document.getElementById('ttin-pb-' + safeAsin);
                    var lb = document.getElementById('ttin-lbl-' + safeAsin);
                    if (pb) pb.style.width = pct + '%';
                    if (lb) lb.textContent = 'Roboscout\u00a0: ' + done + ' / ' + total + ' bins\u2026';
                },
                function(binsOk) {
                    var lb2 = document.getElementById('ttin-lbl-' + safeAsin);
                    var pw2 = body.querySelector('.ttin-progress-wrap');
                    if (lb2) lb2.remove();
                    if (pw2) pw2.remove();
                    renderFloors(body, binsOk, maxPerFloor, selectedFloor);
                    if (onDone) onDone();
                }
            );
        });
    }

    // Normalise le floor renvoyé par Roboscout vers "2","3","4","Mezzanine"...
    function normalizeFloor(raw) {
        if (!raw) return 'Inconnu';
        if (/mezz/i.test(raw)) return 'Mezzanine';
        var m = raw.match(/(\d+)/);
        if (m) return String(parseInt(m[1], 10));
        return raw;
    }

    // ── DEBUG : log ce que FCResearch renvoie pour un bin donné ─────────────
    function debugBin(bin, fc) {
        var endpoints = [
            FCR_BASE + '/' + fc + '/api/container?id=' + encodeURIComponent(bin),
            FCR_BASE + '/' + fc + '/api/bin?id=' + encodeURIComponent(bin),
            FCR_BASE + '/' + fc + '/api/location?containerId=' + encodeURIComponent(bin),
            FCR_BASE + '/' + fc + '/results?s=' + encodeURIComponent(bin),
        ];
        console.group('[TTIN DEBUG] Bin: ' + bin + ' / FC: ' + fc);
        endpoints.forEach(function(url) {
            GM_xmlhttpRequest({
                method: 'GET', url: url, withCredentials: true,
                headers: { 'Accept': 'application/json, text/plain, */*' },
                onload: function(r) {
                    console.log('URL:', url);
                    console.log('Status:', r.status, '| Length:', r.responseText.length);
                    console.log('Début réponse:', r.responseText.slice(0, 500));
                    console.groupEnd();
                },
                onerror: function() { console.log('URL:', url, '→ ERREUR RÉSEAU'); }
            });
        });
    }

    function copyBin(binCode, btn) {
        navigator.clipboard.writeText(binCode).then(function() {
            btn.textContent = '\u2713 Copi\u00e9';
            btn.classList.add('copied');
            setTimeout(function() {
                btn.textContent = '\uD83D\uDCCB Copier';
                btn.classList.remove('copied');
            }, 1500);
        }).catch(function() {
            // Fallback si clipboard API indisponible
            var ta = document.createElement('textarea');
            ta.value = binCode;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            btn.textContent = '\u2713 Copi\u00e9';
            btn.classList.add('copied');
            setTimeout(function() {
                btn.textContent = '\uD83D\uDCCB Copier';
                btn.classList.remove('copied');
            }, 1500);
        });
    }

    // ── Résolution étage via FCResearch ──────────────────────────────────────
    // Endpoint confirmé : POST /ETZ2/results/container-hierarchy
    // Body : Form Data  s=P-8-H662E907
    // Règle étage : dz-P-A02 → 2 / dz-P-A03 → 3 / dz-P-A04 → 4
    function fetchFloorFromFCR(b, fc, done) {
        var url = FCR_BASE + '/' + fc + '/results/container-hierarchy';
        GM_xmlhttpRequest({
            method: 'POST',
            url: url,
            withCredentials: true,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: 's=' + encodeURIComponent(b.bin),
            onload: function(resp) {
                var floor = extractFloorFromText(resp.responseText);
                b.floor = floor || 'Inconnu';
                if (floor) {
                    var mFull = resp.responseText.replace(/\s+/g, ' ').match(/Lieu\s*:\s*\d[^<]{0,100}/i);
                    if (mFull) parseEmplacement(mFull[0], b);
                }
                done();
            },
            onerror: function() { b.floor = 'Inconnu'; done(); }
        });
    }

    // Extrait l'étage depuis le texte brut HTML
    // Priorité 1 : "Lieu: X"
    // Priorité 2 : "dz-P-A0X" → chiffre final
    function extractFloorFromText(text) {
        if (!text) return null;
        var t = text.replace(/\s+/g, ' ');
        var mLieu = t.match(/Lieu\s*:\s*(\d+)/i);
        if (mLieu) return String(parseInt(mLieu[1], 10));
        var mZone = t.match(/dz-[A-Z]-[A-Za-z]+?0*(\d+)/i);
        if (mZone) return String(parseInt(mZone[1], 10));
        return null;
    }

    // Extrait l'étage depuis "Lieu: 3, Allée: 1, Étagère: F, Emplacement: 88"
    // et remplit aussi aisle/shelf/slot sur l'objet bin
    function parseEmplacement(txt, b) {
        // Lieu → étage normalisé (trim + parseInt pour éviter " 2" != "2")
        var mLieu = txt.match(/Lieu\s*:\s*(\d+)/i);
        if (mLieu) b.floor = String(parseInt(mLieu[1].trim(), 10));
        else b.floor = 'Inconnu';

        // Allée
        var mAl = txt.match(/All[ée]e?\s*:\s*([^\s,]+)/i);
        if (mAl) b.aisle = mAl[1].trim();

        // Étagère
        var mEt = txt.match(/[ÉE]tag[eè]re?\s*:\s*([^\s,]+)/i);
        if (mEt) b.shelf = mEt[1].trim();

        // Emplacement (slot) — uniquement si valeur numérique pour éviter collision label
        var mSl = txt.match(/Emplacement\s*:\s*(\d+)/i);
        if (mSl) b.slot = mSl[1].trim();
    }

    function resolveFloors(bins, fc, floorFilter, onProgress, onDone) {
        var resolved = 0;
        var total = bins.length;

        function fetchOne(b, done) {
            fetchFloorFromFCR(b, fc, function() {
                resolved++;
                onProgress(resolved, total);
                done();
            });
        }

        function runQueue(queue, concurrency, taskFn, whenDone) {
            var active = 0, idx = 0;
            function next() {
                while (active < concurrency && idx < queue.length) {
                    var item = queue[idx++];
                    active++;
                    taskFn(item, function() {
                        active--;
                        next();
                    });
                }
                if (active === 0 && idx >= queue.length) whenDone();
            }
            if (!queue.length) { whenDone(); return; }
            next();
        }

        runQueue(bins, FCR_CONCURRENCY, fetchOne, function() {
            var filtered = floorFilter === 'ALL'
                ? bins
                : bins.filter(function(b) { return b.floor === floorFilter; });
            onDone(filtered);
        });
    }

    function fetchInventory(asin, fc, cb) {
        var url = FCR_BASE + '/' + fc + '/results/inventory?s=' + encodeURIComponent(asin);
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            withCredentials: true,
            onload: function(resp) {
                try {
                    var doc = new DOMParser().parseFromString(resp.responseText, 'text/html');
                    var rows = doc.querySelectorAll('#table-inventory tbody tr');
                    if (!rows.length) rows = doc.querySelectorAll('table tbody tr');
                    if (!rows.length) {
                        cb([], 0, resp.responseText.length < 500
                            ? 'R\u00e9ponse vide \u2014 acc\u00e8s FCResearch ?'
                            : 'Table inventaire introuvable');
                        return;
                    }
                    var DAMAGED = ['DEFECTIVE','CUST_DAMAGED','DIST_DAMAGED','WHSE_DAMAGED','CARRIER_DAMAGED','EXPIRED'];
                    var bins = [], totalQty = 0;
                    rows.forEach(function(row) {
                        var cells = row.querySelectorAll('td');
                        if (cells.length < 6) return;
                        var binEl = cells[0].querySelector('a') || cells[0];
                        var bin  = binEl.textContent.trim();
                        var qty  = parseInt((cells[5] || cells[4]).textContent.trim()) || 0;
                        var disp = cells[6] ? cells[6].textContent.trim() : '';
                        if (!bin || qty <= 0 || DAMAGED.indexOf(disp) !== -1) return;
                        bins.push({ bin: bin, qty: qty, disp: disp, floor: null, aisle: '', shelf: '', slot: '' });
                        totalQty += qty;
                    });
                    cb(bins, totalQty, null);
                } catch(e) { cb([], 0, 'Erreur parsing : ' + e.message); }
            },
            onerror: function() { cb([], 0, 'Erreur r\u00e9seau FCResearch'); }
        });
    }

    function renderFloors(container, bins, maxPerFloor, floorFilter) {
        if (!bins.length) {
            var msg = document.createElement('div');
            msg.className = 'ttin-empty';
            msg.textContent = floorFilter !== 'ALL'
                ? 'Aucun bin trouv\u00e9 \u00e0 l\'\u00e9tage ' + floorFilter + '.'
                : 'Aucun floor r\u00e9solu.';
            container.appendChild(msg);
            return;
        }

        var byFloor = {};
        bins.forEach(function(b) {
            var f = b.floor || 'Inconnu';
            if (!byFloor[f]) byFloor[f] = [];
            byFloor[f].push(b);
        });

        var floors = Object.keys(byFloor)
            .filter(function(f) { return f !== 'SKIP'; })
            .sort(function(a, b) { return a.localeCompare(b, undefined, { numeric: true }); });

        floors.forEach(function(floor) {
            var list = byFloor[floor];
            list.sort(function(a, b) {
                return (a.aisle + a.shelf + a.slot).localeCompare(b.aisle + b.shelf + b.slot, undefined, { numeric: true });
            });

            var quota = maxPerFloor;
            var sel = [];
            for (var i = 0; i < list.length; i++) {
                if (quota <= 0) break;
                var take = Math.min(list[i].qty, quota);
                sel.push({ bin: list[i].bin, qty: list[i].qty, take: take, aisle: list[i].aisle, shelf: list[i].shelf, slot: list[i].slot });
                quota -= take;
            }

            var totalFloor = list.reduce(function(s, b) { return s + b.qty; }, 0);
            var taken      = sel.reduce(function(s, b)  { return s + b.take; }, 0);

            var div = document.createElement('div');
            div.className = 'ttin-floor';

            var lbl = document.createElement('div');
            lbl.className = 'ttin-floor-lbl';
            lbl.style.cssText += ';display:flex;align-items:center;gap:6px;';
            lbl.innerHTML = '\uD83C\uDFE2 \u00c9tage ' + esc(floor) +
                ' <span class="ttin-floor-quota">' + taken + ' pris \u00b7 ' + totalFloor + ' dispo \u00b7 quota ' + maxPerFloor + '</span>';
            div.appendChild(lbl);

            if (!sel.length) {
                var emp = document.createElement('div');
                emp.className = 'ttin-empty';
                emp.textContent = 'Quota atteint.';
                div.appendChild(emp);
            } else {
                sel.forEach(function(b) {
                    var parts = [];
                    if (b.aisle) parts.push('All:' + b.aisle);
                    if (b.shelf) parts.push('R:' + b.shelf);
                    if (b.slot)  parts.push('S:' + b.slot);
                    var loc = parts.join(' ');

                    var row = document.createElement('div');
                    row.className = 'ttin-bin';

                    var qrTrigger = document.createElement('span');
                    qrTrigger.className = 'ttin-qr-trigger';
                    qrTrigger.textContent = '▦ CB';
                    (function(binCode) {
                        qrTrigger.addEventListener('mouseenter', function() { showQRBubble(qrTrigger, binCode); });
                        qrTrigger.addEventListener('mouseleave', hideQRBubble);
                    })(b.bin);

                    var infoSpan = document.createElement('span');
                    infoSpan.style.cssText = 'flex:1;min-width:0;';
                    infoSpan.innerHTML =
                        '<span class="ttin-bin-name">' + esc(b.bin) + '</span>' +
                        (loc ? '<span class="ttin-bin-loc">' + esc(loc) + '</span>' : '');

                    var actions = document.createElement('span');
                    actions.className = 'ttin-bin-actions';

                    var qtyBadge = document.createElement('span');
                    qtyBadge.className = 'ttin-bin-qty';
                    qtyBadge.textContent = '\u21a9 ' + b.take + '/' + b.qty;

                    var copyBtn = document.createElement('button');
                    copyBtn.className = 'ttin-copy-btn';
                    copyBtn.textContent = '\uD83D\uDCCB Copier';
                    (function(binCode, btn) {
                        btn.onclick = function(e) { e.stopPropagation(); copyBin(binCode, btn); };
                    })(b.bin, copyBtn);

                    actions.appendChild(qtyBadge);
                    actions.appendChild(copyBtn);
                    row.appendChild(qrTrigger);
                    row.appendChild(infoSpan);
                    row.appendChild(actions);
                    div.appendChild(row);
                });
            }
            container.appendChild(div);
        });
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

})();
