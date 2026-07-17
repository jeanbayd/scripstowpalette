// ==UserScript==
// @name         FCR Lite Ultra V4 — SWEEP
// @version      3.2.0
// @description  FCR Lite SWEEP — Thèmes, Prep, God Mode Print, Hazmat, Étiquettes, Couleurs, CSV, Weight (sans Bin Check, Floor Finder, Analyse Palette). v3.2.0 : le thème "🌃 Néon Bleu" est fusionné avec le thème cyberpunk "Neo-Tokyo" (Sideline Refonte JB Edition) — palette cyan/magenta, coins chanfreinés, titres façon tube néon scintillant. L'image de fond du thème reste inchangée.
// @author       @JEANBAYD
// @match        https://aft-sherlock.eu.aftx.amazonoperations.app/ETZ2*
// @match        https://aft-sherlock.eu.aftx.amazonoperations.app/ETZ2/*
// @match        https://fcresearch-eu.aka.amazon.com/ETZ2*
// @match        https://fcresearch-eu.aka.amazon.com/ETZ2/*
// @match        https://fcresearch-eu.aka.amazon.com/*
// @match        https://qi-fcresearch-eu.corp.amazon.com/ETZ2*
// @match        https://fcresearch-eu.aka.amazon.com/*/results?s=*
// @match        https://qifcr.eu.aftx.amazonoperations.app/*
// @match        https://*.aka.amazon.com/app/edititems*
// @match        https://*.aka.amazon.com/app/moveitems*
// @match        https://aft-poirot-website-dub.dub.proxy.amazon.com/?tool=V3
// @grant        GM_addStyle
// @grant        GM_openInTab
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @connect      pandash.amazon.com
// @connect      prepmanager-dub.amazon.com
// @connect      fcresearch-eu.aka.amazon.com
// @connect      fcresearch-na.aka.amazon.com
// @connect      aft-sherlock.eu.aftx.amazonoperations.app
// @connect      qi-fcresearch-eu.corp.amazon.com
// @connect      rodeo-dub.amazon.com
// @connect      localhost
// @connect      www.amazon.fr
// @connect      www.pokemon.com
// @connect      onrender.com
// @connect      up.railway.app
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-cookie/1.4.1/jquery.cookie.min.js
// @require      https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js
// ==/UserScript==

(function() {
    'use strict';

/* =========================================================================
 *  PATCH — FCRSWEEP__10__user.js
 *  Remplace ENTIÈREMENT le bloc "📡 FCR Activity Push (auto)" (dans le fichier
 *  original : de la ligne // ===================== 📡 FCR Activity Push (auto)
 *  jusqu'à /* ===================== FIN 📡 FCR Activity Push =====================
 *  soit environ les lignes 42 à 223).
 *
 *  CE QUI CHANGE :
 *  - Le comptage de "actions" n'écoute plus les clics de souris. Il interroge
 *    maintenant les VRAIES données FCResearch (table Inventory History) pour
 *    le login courant, exactement comme FCR Trace Sweeper / FCR Sweeper
 *    Comparator : mêmes fonctions de scraping, même seuil d'arrêt (15 min),
 *    mêmes pauses exclues (10h00-10h30).
 *  - `actionsCount` envoyé au dashboard = nombre de lignes de mouvement de
 *    tote sur la fenêtre horaire (identique à `totalActions` dans les 2 autres
 *    scripts).
 *  - `idleGaps` envoyé au dashboard = calculé avec la même fonction
 *    computeInactivityGaps (seuil 15 min, pauses déduites).
 *  - `impressionsCount` (labels imprimés) est INCHANGÉ — ça reste un compteur
 *    de clics sur les boutons Print, ce n'est pas un mouvement de conteneur,
 *    donc pas concerné par ce changement.
 *
 *  LIMITE IMPORTANTE À CONNAÎTRE :
 *  Le scraping ne peut fonctionner QUE quand l'onglet est sur une page
 *  fcresearch-eu.aka.amazon.com au moment où l'échéance horaire se déclenche
 *  (contrainte de sécurité du navigateur : on ne peut pas lire le contenu
 *  d'un iframe pointant vers un autre site que celui actuellement affiché).
 *  Si l'échéance tombe pendant que tu es sur Sherlock/edititems/etc., l'envoi
 *  est simplement reporté (pas perdu : la fenêtre s'accumule) et retenté à la
 *  prochaine vérification (toutes les 20s), jusqu'à ce que tu repasses sur
 *  FCResearch.
 * ========================================================================= */

/* ===================== 📡 FCR Activity Push (auto) — VRAIS MOUVEMENTS =====================
 *  Interroge périodiquement les vraies données FCResearch (comme FCR Trace
 *  Sweeper / FCR Sweeper Comparator) pour le login courant, et pousse le
 *  résultat vers le dashboard. Config séparée du reste du script (bouton 📡
 *  en bas à droite de l'écran).
 * ======================================================================= */
const FCR_ACT_KEYS = { url: 'fcr_act_backend_url', key: 'fcr_act_api_key', periodStart: 'fcr_act_period_start' };
const FCR_ACT_DEFAULT_URL = 'https://sweeper-dashboard-production.up.railway.app';
const FCR_ACT_DEFAULT_KEY = "bonjour je m'appel lavabo";

function fcrActGetConfig() {
    return {
        url: (GM_getValue(FCR_ACT_KEYS.url, '') || FCR_ACT_DEFAULT_URL).replace(/\/+$/, ''),
        key: GM_getValue(FCR_ACT_KEYS.key, '') || FCR_ACT_DEFAULT_KEY,
    };
}
function fcrActSetConfig(url, key) {
    GM_setValue(FCR_ACT_KEYS.url, url || '');
    GM_setValue(FCR_ACT_KEYS.key, key || '');
}

/* ---- Constantes reprises à l'identique de FCR Trace Sweeper / Comparator ----
 * Ordre de préférence : fcresearch-eu.aka.amazon.com d'abord, qifcr en repli.
 * IMPORTANT : le scraping ci-dessous se fait via un iframe SAME-ORIGIN — un
 * iframe pointant vers un domaine différent de la page actuelle est bloqué
 * par le navigateur (Same-Origin Policy), quel que soit l'ordre souhaité. Il
 * est donc impossible d'essayer "A puis B" en cours de route depuis une même
 * page : on utilise toujours le domaine sur lequel on se trouve RÉELLEMENT.
 * C'était justement le bug : FCR_ACT_BASE_URL était figé sur qifcr, donc le
 * heartbeat/backfill échouait silencieusement dès que vous étiez sur
 * fcresearch-eu.aka.amazon.com (les deux hosts sont dans @match, mais un
 * seul était géré ici). Les deux sont maintenant supportés de façon
 * dynamique. */
const FCR_ACT_HOSTS_PRIORITY = ['fcresearch-eu.aka.amazon.com', 'qifcr.eu.aftx.amazonoperations.app'];
const FCR_ACT_HOST_OK = FCR_ACT_HOSTS_PRIORITY.includes(location.hostname) ? location.hostname : null;
const FCR_ACT_BASE_URL = FCR_ACT_HOST_OK ? `https://${FCR_ACT_HOST_OK}/ETZ2/results?s=` : '';
const FCR_ACT_TOTE_REGEX = /^tsX/i;
const FCR_ACT_EXCLUDED_BREAKS = [{ start: '10:00', end: '10:30' }];

/* ---- Métronome (identique aux 2 scripts : Worker + repli setInterval) ---- */
let _fcrActHbTimer = null;
const _fcrActHbListeners = new Set();
function fcrActEnsureHeartbeat() {
    if (_fcrActHbTimer) return;
    try {
        const code = 'setInterval(() => postMessage(1), 100);';
        const blob = new Blob([code], { type: 'application/javascript' });
        const worker = new Worker(URL.createObjectURL(blob));
        worker.onmessage = () => { for (const fn of Array.from(_fcrActHbListeners)) fn(); };
        worker.onerror = () => {
            try { worker.terminate(); } catch (e) {}
            _fcrActHbTimer = null;
            _fcrActHbTimer = setInterval(() => { for (const fn of Array.from(_fcrActHbListeners)) fn(); }, 100);
        };
        _fcrActHbTimer = worker;
    } catch (e) {
        _fcrActHbTimer = setInterval(() => { for (const fn of Array.from(_fcrActHbListeners)) fn(); }, 100);
    }
}
function fcrActOnHeartbeat(fn) {
    fcrActEnsureHeartbeat();
    _fcrActHbListeners.add(fn);
    return () => _fcrActHbListeners.delete(fn);
}
function fcrActHeartbeatDelay(callback, ms) {
    const start = Date.now();
    const off = fcrActOnHeartbeat(() => { if (Date.now() - start >= ms) { off(); callback(); } });
    return off;
}

/* ---- Scraping (copie fidèle de FCR Sweeper Comparator, préfixée fcrAct pour éviter tout conflit) ---- */
function fcrActWaitFor(selectorFn, { timeout = 15000, interval = 250 } = {}) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        let lastCheck = 0;
        const off = fcrActOnHeartbeat(() => {
            const now = Date.now();
            if (now - lastCheck < interval) return;
            lastCheck = now;
            const el = selectorFn();
            if (el) { off(); return resolve(el); }
            if (now - start > timeout) { off(); return reject(new Error('fcrAct waitFor: timeout')); }
        });
    });
}
function fcrActCellText(v) {
    if (v == null) return '';
    if (typeof v !== 'string') return String(v);
    if (v.indexOf('<') === -1) return v.trim();
    const d = document.createElement('div');
    d.innerHTML = v;
    return (d.textContent || '').trim();
}
function fcrActHeaderSignature(th) {
    const text = th.textContent && th.textContent.trim();
    if (text) return text.toLowerCase();
    const aria = th.getAttribute('aria-label');
    if (aria) return aria.toLowerCase();
    return (th.id || '').replace(/-/g, ' ').toLowerCase();
}
function fcrActFindTableById(doc, id, headerNeedlesFallback) {
    const byId = doc.getElementById(id);
    if (byId && byId.querySelector('tbody tr td, tr td')) return byId;
    return headerNeedlesFallback ? fcrActFindTableByHeaders(doc, headerNeedlesFallback) : null;
}
function fcrActFindTableByHeaders(doc, headerNeedles) {
    const tables = Array.from(doc.querySelectorAll('table'));
    const candidates = [];
    for (const t of tables) {
        const headers = Array.from(t.querySelectorAll('thead th')).map(fcrActHeaderSignature);
        if (headerNeedles.every(h => headers.some(hd => hd.includes(h)))) candidates.push(t);
    }
    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];
    let best = candidates[0], bestCount = -1;
    for (const c of candidates) {
        const count = c.querySelectorAll('tbody tr, tr').length;
        if (count > bestCount) { bestCount = count; best = c; }
    }
    return best;
}
function fcrActGetDataTableInstance(table) {
    const win = table.ownerDocument.defaultView;
    if (win && win.jQuery && win.jQuery.fn && win.jQuery.fn.DataTable && win.jQuery.fn.DataTable.isDataTable && win.jQuery.fn.DataTable.isDataTable(table)) {
        return win.jQuery(table).DataTable();
    }
    return null;
}
function fcrActFindScrollableAncestor(el) {
    let node = el.parentElement;
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    while (node && node !== doc.body) {
        const style = win.getComputedStyle(node);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 5) return node;
        node = node.parentElement;
    }
    return doc.scrollingElement || doc.documentElement;
}
async function fcrActAutoScrollToLoadAllRows(table, log) {
    const doc = table.ownerDocument;
    const win = doc.defaultView;
    const scrollEl = fcrActFindScrollableAncestor(table);
    const isWindowScroll = scrollEl === doc.documentElement || scrollEl === doc.scrollingElement;
    const countRows = () => table.querySelectorAll('tbody tr, tr').length;
    const scrollableHeight = () => (isWindowScroll ? doc.documentElement.scrollHeight : scrollEl.scrollHeight);
    let stableRounds = 0, lastCount = countRows(), lastHeight = scrollableHeight();
    for (let round = 0; round < 80; round++) {
        if (isWindowScroll) win.scrollTo(0, doc.documentElement.scrollHeight);
        else { scrollEl.scrollTop = scrollEl.scrollHeight; scrollEl.dispatchEvent(new Event('scroll', { bubbles: true })); }
        await new Promise(resolve => fcrActHeartbeatDelay(resolve, 250));
        const newCount = countRows(), newHeight = scrollableHeight();
        if (newCount === lastCount && newHeight === lastHeight) {
            stableRounds++;
            if (stableRounds >= 2) break;
        } else {
            stableRounds = 0;
            if (newCount !== lastCount) log && log(`⏳ Chargement du tableau : ${newCount} ligne(s)...`);
            lastCount = newCount; lastHeight = newHeight;
        }
    }
    return countRows();
}
async function fcrActExpandAndScrapeTable(table, log) {
    const dt = fcrActGetDataTableInstance(table);
    if (dt) {
        const win = table.ownerDocument.defaultView;
        await new Promise(resolve => {
            let resolved = false;
            const done = () => { if (resolved) return; resolved = true; resolve(); };
            win.jQuery(table).one('draw.dt', done);
            try { dt.page.len(-1).draw(); } catch (e) { done(); }
            fcrActHeartbeatDelay(done, 10000);
        });
        const rows = dt.rows().data().toArray().map(row => (Array.isArray(row) ? row.map(fcrActCellText) : Object.values(row).map(fcrActCellText)));
        const settings = dt.settings()[0];
        const titles = (settings.aoColumns || []).map(c => fcrActCellText(c.sTitle || c.title || '').toLowerCase());
        const indexOf = name => titles.findIndex(t => t.includes(name));
        return { rows, indexOf };
    }
    await fcrActAutoScrollToLoadAllRows(table, log);
    const headers = Array.from(table.querySelectorAll('thead th')).map(fcrActHeaderSignature);
    let trEls = Array.from(table.querySelectorAll('tbody tr'));
    if (trEls.length === 0) trEls = Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td'));
    const rows = trEls.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()));
    const indexOf = name => headers.findIndex(h => h.includes(name));
    return { rows, indexOf };
}
function fcrActParseFcrDate(str) {
    if (!str) return null;
    const cleaned = str.replace(/\s+CEST$/i, '').trim();
    const d = new Date(cleaned.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
}
function fcrActIsoToDisplayDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    const [, y, mo, d] = m;
    return `${mo}/${d}/${y}`; // MM/DD/YYYY, comme Trace Sweeper / Comparator
}
function fcrActSetNativeInputValue(input, value) {
    const win = input.ownerDocument.defaultView || window;
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}
function fcrActFindDateSearchControls(doc) {
    const inputs = Array.from(doc.querySelectorAll('input'));
    const startInput = inputs.find(i => /start/i.test(i.name || '') || /start/i.test(i.id || '') || /start/i.test(i.getAttribute('aria-label') || ''));
    const endInput = inputs.find(i => /end/i.test(i.name || '') || /end/i.test(i.id || '') || /end/i.test(i.getAttribute('aria-label') || ''));
    const buttons = Array.from(doc.querySelectorAll('button, input[type="submit"]'));
    const searchBtn = buttons.find(b => /search/i.test(b.textContent || b.value || ''));
    return { startInput, endInput, searchBtn };
}
async function fcrActApplyDateRangeAndSearch(doc, startDateISO, endDateISO, log) {
    if (!startDateISO || !endDateISO) return;
    const displayStart = fcrActIsoToDisplayDate(startDateISO);
    const displayEnd = fcrActIsoToDisplayDate(endDateISO);
    if (!displayStart || !displayEnd) return;

    let startInput, endInput, searchBtn;
    try {
        await fcrActWaitFor(() => {
            const c = fcrActFindDateSearchControls(doc);
            startInput = c.startInput; endInput = c.endInput; searchBtn = c.searchBtn;
            return startInput && endInput && searchBtn ? true : null;
        }, { timeout: 10000, interval: 200 });
    } catch (e) {
        log && log('⚠️ Champs Start/End date introuvables : scraping de la période déjà affichée.');
        return;
    }

    const existingTable = fcrActFindTableById(doc, 'table-inventory-history', ['old bin', 'new bin']);
    const beforeSignature = existingTable ? (existingTable.querySelector('tbody') || existingTable).textContent.slice(0, 300) : '__none__';

    fcrActSetNativeInputValue(startInput, displayStart);
    fcrActSetNativeInputValue(endInput, displayEnd);
    searchBtn.click();

    try {
        await fcrActWaitFor(() => {
            const t = fcrActFindTableById(doc, 'table-inventory-history', ['old bin', 'new bin']);
            if (!t) return null;
            const sig = (t.querySelector('tbody') || t).textContent.slice(0, 300);
            return sig !== beforeSignature ? true : null;
        }, { timeout: 5000, interval: 200 });
    } catch (e) { /* peut vouloir dire "période déjà correcte" — pas bloquant */ }
}
function fcrActIsRowInDateTimeRange(rowDateStr, range) {
    if (!range || (!range.startDate && !range.endDate)) return true;
    const d = fcrActParseFcrDate(rowDateStr);
    if (!d) return false;
    if (range.startDate && d.getTime() < range.startDate.getTime()) return false;
    if (range.endDate && d.getTime() > range.endDate.getTime()) return false;
    return true;
}
async function fcrActScrapeInventoryTable(doc, range, log) {
    await fcrActApplyDateRangeAndSearch(doc, range && range.startDateISO, range && range.endDateISO, log);
    const table = await fcrActWaitFor(() => fcrActFindTableById(doc, 'table-inventory-history', ['old bin', 'new bin']), { timeout: 20000 });
    const { rows: rawRows, indexOf } = await fcrActExpandAndScrapeTable(table, log);
    const iDate = indexOf('date'), iOldBin = indexOf('old bin'), iNewBin = indexOf('new bin');
    if (iDate === -1 || iOldBin === -1 || iNewBin === -1) throw new Error('Colonnes Date/Old Bin/New Bin introuvables.');
    const mapped = rawRows.map(r => ({ date: r[iDate] || '', oldBin: r[iOldBin] || '', newBin: r[iNewBin] || '' }));
    const afterDate = mapped.filter(r => fcrActIsRowInDateTimeRange(r.date, range));
    const afterTote = afterDate.filter(r => FCR_ACT_TOTE_REGEX.test(r.oldBin) || FCR_ACT_TOTE_REGEX.test(r.newBin));
    log && log(`${rawRows.length} ligne(s) brute(s) → ${afterDate.length} après filtre période → ${afterTote.length} avec une tote.`);
    return afterTote;
}
function fcrActLoadInHiddenIframe(url) {
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-3000px;left:-3000px;width:1400px;height:900px;border:0;';
        iframe.src = url;
        document.body.appendChild(iframe);
        let settled = false, offReady = null;
        const settle = (fn, arg) => { if (settled) return; settled = true; if (offReady) offReady(); fn(arg); };
        offReady = fcrActOnHeartbeat(() => {
            let doc;
            try { doc = iframe.contentDocument; } catch (e) { return; }
            if (doc && doc.readyState !== 'loading' && doc.location.href !== 'about:blank') settle(resolve, iframe);
        });
        iframe.onerror = e => settle(reject, e);
        fcrActHeartbeatDelay(() => settle(reject, new Error('iframe timeout: ' + url)), 20000);
    });
}
async function fcrActGetInventoryRowsForLogin(login, range, log) {
    const iframe = await fcrActLoadInHiddenIframe(FCR_ACT_BASE_URL + encodeURIComponent(login));
    try {
        const idoc = iframe.contentDocument;
        return await fcrActScrapeInventoryTable(idoc, range, log);
    } finally {
        iframe.remove();
    }
}
function fcrActTimeOnSameDay(refDate, hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(refDate);
    d.setHours(h, m, 0, 0);
    return d;
}
function fcrActOverlapMs(aStart, aEnd, bStart, bEnd) {
    const start = Math.max(aStart.getTime(), bStart.getTime());
    const end = Math.min(aEnd.getTime(), bEnd.getTime());
    return Math.max(0, end - start);
}
function fcrActExcludedBreakOverlapMs(from, to) {
    let total = 0;
    const dayMs = 24 * 60 * 60 * 1000;
    let cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    while (cursor.getTime() <= to.getTime()) {
        for (const b of FCR_ACT_EXCLUDED_BREAKS) {
            total += fcrActOverlapMs(from, to, fcrActTimeOnSameDay(cursor, b.start), fcrActTimeOnSameDay(cursor, b.end));
        }
        cursor = new Date(cursor.getTime() + dayMs);
    }
    return total;
}
function fcrActComputeInactivityGaps(sortedInvRows, thresholdMin) {
    const thresholdMs = thresholdMin * 60000;
    const gaps = [];
    for (let i = 1; i < sortedInvRows.length; i++) {
        const prev = fcrActParseFcrDate(sortedInvRows[i - 1].date);
        const cur = fcrActParseFcrDate(sortedInvRows[i].date);
        if (!prev || !cur) continue;
        const rawDiffMs = cur.getTime() - prev.getTime();
        const excludedMs = fcrActExcludedBreakOverlapMs(prev, cur);
        const adjustedMs = rawDiffMs - excludedMs;
        if (adjustedMs >= thresholdMs) {
            gaps.push({ from: sortedInvRows[i - 1].date, to: sortedInvRows[i].date, durationMin: Math.round(adjustedMs / 60000) });
        }
    }
    return gaps;
}
function fcrActDateOnlyIso(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---- État : uniquement les impressions restent "accumulées" (les vrais
 *      mouvements, eux, sont recalculés à chaque envoi depuis FCResearch) ----
 *  IMPORTANT : periodStart est repris depuis GM_setValue (survit aux
 *  navigations/reloads, puisqu'un script Tampermonkey se réinjecte
 *  entièrement à chaque changement de page). Sans ça, periodStart repartait
 *  de "maintenant" à chaque navigation et une partie des mouvements réels
 *  n'était jamais interrogée -> trous silencieux dans la journée. */
const fcrActivityState = {
    periodStart: GM_getValue(FCR_ACT_KEYS.periodStart, '') || (() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString();
    })(),
    impressionsCount: 0,
};

// Conservé tel quel pour compatibilité avec les 5 appels existants
// `fcrActivityTrack('impression')` disséminés dans le script (God Mode Print...).
// Le paramètre 'action' n'est plus utilisé : plus aucun appel document-wide sur les clics.
function fcrActivityTrack(kind) {
    if (kind === 'impression') fcrActivityState.impressionsCount++;
}

async function fcrActivitySendHourly() {
    const { url, key } = fcrActGetConfig();
    if (!url || !key) {
        console.warn('FCR Activity: backend non configuré (bouton 📡) — envoi ignoré.');
        return;
    }

    // Le scraping ne peut fonctionner qu'en same-origin avec FCResearch (contrainte
    // navigateur sur la lecture d'un iframe cross-origin). Si on n'y est pas
    // actuellement, on reporte : periodStart n'est PAS avancé, donc rien n'est perdu.
    if (location.hostname !== FCR_ACT_HOST_OK) {
        console.log(`FCR Activity: page actuelle (${location.hostname}) — vérification des mouvements différée jusqu'au prochain passage sur FCResearch.`);
        return;
    }

    const login = (typeof getCookie === 'function' ? getCookie('fcmenu-employeeLogin') : '') || null;
    if (!login) {
        console.warn('FCR Activity: login introuvable (cookie fcmenu-employeeLogin) — envoi ignoré.');
        return;
    }

    const periodStartDate = new Date(fcrActivityState.periodStart);
    const periodEndDate = new Date();
    const range = {
        startDate: periodStartDate,
        endDate: periodEndDate,
        startDateISO: fcrActDateOnlyIso(periodStartDate),
        endDateISO: fcrActDateOnlyIso(periodEndDate),
    };

    let invRows;
    try {
        invRows = await fcrActGetInventoryRowsForLogin(login, range, m => console.log('FCR Activity:', m));
    } catch (e) {
        console.warn('FCR Activity: échec récupération des mouvements réels — envoi reporté.', e);
        return; // periodStart non avancé -> retenté à la prochaine vérification (20s)
    }

    const sorted = invRows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const gaps = fcrActComputeInactivityGaps(sorted, 15); // seuil identique à Trace/Comparator

    const payload = {
        login,
        periodStart: periodStartDate.toISOString(),
        periodEnd: periodEndDate.toISOString(),
        actionsCount: sorted.length, // même définition que "totalActions" dans Trace/Comparator
        impressionsCount: fcrActivityState.impressionsCount,
        idleGaps: gaps,
        page: location.href,
    };

    GM_xmlhttpRequest({
        method: 'POST',
        url: `${url}/api/ingest/activity`,
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        data: JSON.stringify(payload),
        timeout: 20000,
        onload: (res) => {
            console.log(`FCR Activity: envoyé au dashboard — ${payload.actionsCount} mouvement(s) réel(s).`, res.status);
            fcrActivityState.impressionsCount = 0;
            fcrActivityState.periodStart = payload.periodEnd; // avancé SEULEMENT après succès confirmé
            GM_setValue(FCR_ACT_KEYS.periodStart, payload.periodEnd); // <-- persiste : survit à la prochaine navigation
            GM_setValue(FCR_ACT_LAST_SEND_KEY, Date.now()); // <-- déplacé ici : la pendule des 60min n'avance QUE sur succès confirmé
        },
        onerror: (e) => console.warn('FCR Activity: erreur réseau vers le dashboard', e),
        ontimeout: () => console.warn('FCR Activity: timeout vers le dashboard'),
    });
}

/* ---- Anti reset-sur-navigation : identique à l'original ---- */
const FCR_ACT_LAST_SEND_KEY = 'fcr_act_last_send_at';
const FCR_ACT_INTERVAL_MS = 2 * 60 * 1000; // 60 min en production
const FCR_ACT_CHECK_MS = 20 * 1000;

function fcrActivityMaybeSend() {
    const last = GM_getValue(FCR_ACT_LAST_SEND_KEY, 0);
    const now = Date.now();
    if (now - last >= FCR_ACT_INTERVAL_MS) {
        // NE PAS avancer FCR_ACT_LAST_SEND_KEY ici : si l'envoi échoue (pas sur
        // FCResearch, réseau, etc.), on veut réessayer dans ~20s, pas dans 1h.
        // Il n'est avancé que dans le onload de succès de fcrActivitySendHourly().
        fcrActivitySendHourly();
    }
}
setInterval(fcrActivityMaybeSend, FCR_ACT_CHECK_MS);
fcrActivityMaybeSend();

/* ---- Bouton flottant de config : identique à l'original, inchangé ---- */
function fcrActivityBuildFloatingConfigUI() {
    const btn = document.createElement('div');
    btn.textContent = '📡';
    btn.title = 'Config dashboard (activité réelle)';
    btn.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:999999;background:#222;color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;opacity:.55;box-shadow:0 1px 4px #0006;';
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '.55'; });
    document.body.appendChild(btn);

    let panel = null;
    btn.addEventListener('click', () => {
        if (panel) { panel.remove(); panel = null; return; }
        const { url, key } = fcrActGetConfig();
        panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;bottom:42px;right:8px;z-index:999999;background:#1e1e1e;color:#eee;padding:10px;border-radius:8px;width:220px;font-size:11px;box-shadow:0 2px 10px #0008;font-family:sans-serif;';
        panel.innerHTML = `
      <div style="opacity:.7;margin-bottom:4px;">📡 Dashboard activité (mouvements réels)</div>
      <input type="text" class="fcr-act-url" placeholder="https://xxx.up.railway.app" style="width:100%;margin-bottom:4px;box-sizing:border-box;" value="${url}">
      <input type="password" class="fcr-act-key" placeholder="Clé API" style="width:100%;margin-bottom:4px;box-sizing:border-box;" value="${key}">
      <button type="button" class="fcr-act-save" style="width:100%;">💾 Enregistrer</button>
    `;
        document.body.appendChild(panel);
        panel.querySelector('.fcr-act-save').addEventListener('click', () => {
            fcrActSetConfig(
                panel.querySelector('.fcr-act-url').value.trim(),
                panel.querySelector('.fcr-act-key').value.trim()
            );
            const b = panel.querySelector('.fcr-act-save');
            const old = b.textContent;
            b.textContent = '✅ Enregistré';
            setTimeout(() => { b.textContent = old; }, 1500);
        });
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fcrActivityBuildFloatingConfigUI);
} else {
    fcrActivityBuildFloatingConfigUI();
}
/* ===================== FIN 📡 FCR Activity Push ===================== */

/* ===================== 🔎 FCR Activity Backfill (manuel, journée complète) =====================
 *  Bouton totalement séparé du bloc 📡 ci-dessus (lequel reste INCHANGÉ). But :
 *  charger à la demande l'historique complet d'une journée (aujourd'hui ou une
 *  date choisie) pour un login donné, et le pousser vers le dashboard — sans
 *  attendre que le sweeper concerné ait lui-même le script actif toute la
 *  journée. Réutilise la même config (URL + clé) que le bloc 📡, via
 *  fcrActGetConfig(), et la même technique de scraping (iframe same-origin)
 *  que fcrActGetInventoryRowsForLogin() ci-dessus.
 *
 *  L'historique récupéré est redécoupé heure par heure et envoyé comme autant
 *  de créneaux "activity" (même format que le heartbeat normal), pour rester
 *  cohérent avec le graphe horaire et la chronologie des envois du dashboard.
 *
 *  LIMITE : les "étiquettes imprimées" (impressionsCount) ne peuvent pas être
 *  reconstituées a posteriori — ce compteur vient des clics sur les boutons
 *  Print côté sweeper en direct, pas de l'historique FCResearch. Le backfill
 *  envoie donc 0 sur ce champ pour les créneaux reconstruits.
 * ============================================================================ */
function fcrActBackfillDayBounds(dateISO) {
    const dayStart = new Date(`${dateISO}T00:00:00`);
    const now = new Date();
    const isToday = fcrActDateOnlyIso(now) === dateISO;
    const dayEnd = isToday ? now : new Date(dayStart.getTime() + 86400000 - 1000);
    return { dayStart, dayEnd, isToday };
}

function fcrActBucketRowsByHour(sortedRows, gaps, dayStart, dayEnd) {
    const hourKey = d => {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}`;
    };
    const buckets = new Map(); // "YYYY-MM-DDTHH" -> { rows: [], gaps: [] }
    for (const r of sortedRows) {
        const d = fcrActParseFcrDate(r.date);
        if (!d) continue;
        const key = hourKey(d);
        if (!buckets.has(key)) buckets.set(key, { rows: [], gaps: [] });
        buckets.get(key).rows.push(r);
    }
    for (const g of gaps) {
        const d = fcrActParseFcrDate(g.from);
        if (!d) continue;
        const key = hourKey(d);
        if (!buckets.has(key)) buckets.set(key, { rows: [], gaps: [] });
        buckets.get(key).gaps.push(g);
    }
    return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([key, data]) => {
        const [y, mo, da, h] = key.split(/[-T]/).map(Number);
        const hourStart = new Date(y, mo - 1, da, h, 0, 0, 0);
        const hourEndRaw = new Date(hourStart.getTime() + 3600000);
        const periodEnd = hourEndRaw > dayEnd ? dayEnd : hourEndRaw;
        const periodStart = hourStart < dayStart ? dayStart : hourStart;
        return { periodStart, periodEnd, actionsCount: data.rows.length, idleGaps: data.gaps };
    });
}

function fcrActPushOneSlot(login, slot, log) {
    return new Promise((resolve) => {
        const { url, key } = fcrActGetConfig();
        if (!url || !key) { log && log('⚠️ Backend non configuré (bouton 📡).'); return resolve(false); }
        const payload = {
            login,
            periodStart: slot.periodStart.toISOString(),
            periodEnd: slot.periodEnd.toISOString(),
            actionsCount: slot.actionsCount,
            impressionsCount: 0, // non reconstituable a posteriori (voir note en tête de bloc)
            idleGaps: slot.idleGaps.map(g => ({ from: g.from, to: g.to, durationMin: g.durationMin })),
            page: location.href,
        };
        GM_xmlhttpRequest({
            method: 'POST',
            url: `${url}/api/ingest/activity`,
            headers: { 'Content-Type': 'application/json', 'x-api-key': key },
            data: JSON.stringify(payload),
            timeout: 20000,
            onload: (res) => {
                log && log(`✅ ${slot.periodStart.toTimeString().slice(0, 5)}–${slot.periodEnd.toTimeString().slice(0, 5)} : ${slot.actionsCount} action(s)`);
                resolve(res.status < 400);
            },
            onerror: () => { log && log('❌ erreur réseau sur un créneau'); resolve(false); },
            ontimeout: () => { log && log('❌ timeout sur un créneau'); resolve(false); },
        });
    });
}

async function fcrActBackfillDay(login, dateISO, log) {
    if (!FCR_ACT_HOST_OK) {
        log && log('⚠️ Cette page n\'est pas sur fcresearch-eu.aka.amazon.com ni sur qifcr.eu.aftx.amazonoperations.app — impossible de scraper (même origine requise).');
        return;
    }
    const { dayStart, dayEnd } = fcrActBackfillDayBounds(dateISO);
    const range = {
        startDate: dayStart, endDate: dayEnd,
        startDateISO: fcrActDateOnlyIso(dayStart), endDateISO: fcrActDateOnlyIso(dayEnd),
    };
    log && log(`⏳ Chargement des mouvements de ${login} pour le ${dateISO}...`);
    const invRows = await fcrActGetInventoryRowsForLogin(login, range, log);
    const sorted = invRows.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (!sorted.length) { log && log('Aucun mouvement trouvé sur cette journée.'); return; }
    const gaps = fcrActComputeInactivityGaps(sorted, 15); // seuil identique au reste du script
    const slots = fcrActBucketRowsByHour(sorted, gaps, dayStart, dayEnd);
    log && log(`${sorted.length} mouvement(s) répartis sur ${slots.length} créneau(x) horaire(s). Envoi en cours...`);
    let ok = 0;
    for (const slot of slots) {
        // Envois séquentiels (pas en parallèle) : plus simple à suivre dans le log,
        // et plus doux pour le backend qu'une rafale de requêtes simultanées.
        const success = await fcrActPushOneSlot(login, slot, log);
        if (success) ok++;
    }
    log && log(`Terminé : ${ok}/${slots.length} créneau(x) envoyé(s) pour ${login} (${dateISO}).`);
}

/* ---- Bouton flottant séparé, discret, indépendant du bouton 📡 (coin opposé) ---- */
function fcrActBackfillBuildUI() {
    const btn = document.createElement('div');
    btn.textContent = '🔎';
    btn.title = 'Charger l\'historique complet d\'une journée pour un sweeper';
    btn.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:999999;background:#222;color:#fff;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;opacity:.35;box-shadow:0 1px 4px #0006;';
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '.35'; });
    document.body.appendChild(btn);

    let panel = null;
    btn.addEventListener('click', () => {
        if (panel) { panel.remove(); panel = null; return; }
        const todayISO = fcrActDateOnlyIso(new Date());
        panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;bottom:38px;left:8px;z-index:999999;background:#1e1e1e;color:#eee;padding:10px;border-radius:8px;width:230px;font-size:11px;box-shadow:0 2px 10px #0008;font-family:sans-serif;';
        panel.innerHTML = `
      <div style="opacity:.7;margin-bottom:4px;">🔎 Charger une/plusieurs journée(s)</div>
      <textarea class="fcr-bf-logins" placeholder="login(s) sweeper — un par ligne ou séparés par une virgule" rows="3" style="width:100%;margin-bottom:4px;box-sizing:border-box;resize:vertical;font-family:inherit;"></textarea>
      <input type="date" class="fcr-bf-date" style="width:100%;margin-bottom:4px;box-sizing:border-box;" value="${todayISO}">
      <button type="button" class="fcr-bf-load" style="width:100%;">⬇️ Charger la/les journée(s)</button>
      <div class="fcr-bf-log" style="margin-top:6px;max-height:140px;overflow-y:auto;opacity:.75;line-height:1.4;"></div>
    `;
        document.body.appendChild(panel);
        const logEl = panel.querySelector('.fcr-bf-log');
        const log = (msg) => { const d = document.createElement('div'); d.textContent = msg; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };
        panel.querySelector('.fcr-bf-load').addEventListener('click', async () => {
            const logins = fcrActParseLoginsInput(panel.querySelector('.fcr-bf-logins').value);
            const dateISO = panel.querySelector('.fcr-bf-date').value;
            if (!logins.length || !dateISO) { log('⚠️ Au moins un login et une date sont requis.'); return; }
            const b = panel.querySelector('.fcr-bf-load');
            b.disabled = true;
            logEl.innerHTML = '';
            log(`${logins.length} sweeper(s) à traiter pour le ${dateISO}.`);
            // Séquentiel (pas en parallèle) : une seule iframe de scraping à la
            // fois, log lisible dans l'ordre, et pas de rafale sur le backend.
            for (let i = 0; i < logins.length; i++) {
                const login = logins[i];
                b.textContent = `⏳ ${i + 1}/${logins.length} — ${login}`;
                log(`— ${login} —`);
                try {
                    await fcrActBackfillDay(login, dateISO, log);
                } catch (e) {
                    log(`❌ ${login} : ` + (e && e.message ? e.message : 'erreur inconnue'));
                }
            }
            b.disabled = false;
            b.textContent = '⬇️ Charger la/les journée(s)';
            log('Terminé pour tous les sweepers.');
        });
    });
}
function fcrActParseLoginsInput(raw) {
    return Array.from(new Set(
        (raw || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    ));
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fcrActBackfillBuildUI);
} else {
    fcrActBackfillBuildUI();
}
/* ===================== FIN 🔎 FCR Activity Backfill ===================== */

/* ===================== 🎛️ Visibilité 📡 / 🔎 — thème Néon Bleu uniquement =====================
 *  Les deux boutons flottants (📡 config dashboard, 🔎 backfill) ne doivent
 *  être visibles QUE quand le thème "🌃 Néon Bleu" est actif — sur tout autre
 *  thème, ils restent masqués pour ne gêner personne. Ce bloc ne modifie
 *  AUCUNE ligne des deux fonctions ci-dessus : il retrouve les boutons déjà
 *  créés (par leur contenu texte) et bascule leur affichage. Le thème est lu
 *  directement via GM_getValue('colorTheme', ...) plutôt que via la variable
 *  interne du système de thèmes, pour rester totalement indépendant de son
 *  organisation interne. Sondage léger (même principe que l'auto-réparation
 *  du thème Néon Bleu déjà présente plus haut dans le script) pour suivre un
 *  changement de thème en direct, sans recharger la page.
 * ============================================================================ */
function fcrActFindFloatingBtn(emoji) {
    return Array.from(document.body.children).find(el =>
        el.tagName === 'DIV' && el.textContent === emoji && el.style.position === 'fixed'
    ) || null;
}
function fcrActApplyDiscreetVisibility() {
    const isNeon = GM_getValue('colorTheme', 'base') === 'neonbleu';
    const radarBtn = fcrActFindFloatingBtn('📡');
    const searchBtn = fcrActFindFloatingBtn('🔎');
    for (const btn of [radarBtn, searchBtn]) {
        if (btn) btn.style.display = isNeon ? 'flex' : 'none';
    }
    if (!isNeon) {
        // Referme aussi les panneaux s'ils étaient ouverts au moment du
        // changement de thème, pour ne rien laisser traîner à l'écran.
        const radarPanel = document.querySelector('.fcr-act-url')?.parentElement;
        const searchPanel = document.querySelector('.fcr-bf-logins')?.parentElement;
        if (radarPanel) radarPanel.remove();
        if (searchPanel) searchPanel.remove();
    }
}
setInterval(fcrActApplyDiscreetVisibility, 800);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(fcrActApplyDiscreetVisibility, 300));
} else {
    setTimeout(fcrActApplyDiscreetVisibility, 300);
}
/* ===================== FIN 🎛️ Visibilité 📡 / 🔎 ===================== */

    // ════════════════════════════════════════════════════════════════
    // ===== MODULE SYSTEM =====
    // ════════════════════════════════════════════════════════════════
    const MODULES = {
        productColors:  { label: '🎨 Couleurs attributs produit', default: true },
        godModePrint:   { label: '🖨️ God Mode (impression)',      default: true },
        hazmat:         { label: '☢️ Hazmat Level Display',       default: true },
        amazonFrPrice:  { label: '🛒 Prix Amazon.fr',             default: true },
        binFloor:       { label: '🗺️ Colonne Étage (Inventory)',  default: true },
        perfMode:       { label: '⚡ Mode performance (coupe glow/ombre)', default: false },
    };

    const MODULE_CACHE = {};
    Object.keys(MODULES).forEach(k => { MODULE_CACHE[k] = GM_getValue('module_' + k, MODULES[k].default); });

    function isModuleEnabled(key) {
        if (!MODULES[key]) return true;
        return key in MODULE_CACHE ? MODULE_CACHE[key] : GM_getValue('module_' + key, MODULES[key].default);
    }

    function setModuleEnabled(key, value) {
        GM_setValue('module_' + key, value);
        MODULE_CACHE[key] = value;
    }

    // ════════════════════════════════════════════════════════════════
    // ===== MODE PERFORMANCE (coupe les propriétés d'animation coûteuses) =====
    // ════════════════════════════════════════════════════════════════
    // Neutralise box-shadow / text-shadow / filter / background-position
    // animés injectés par les thèmes animés et le bandeau hazmat (les
    // propriétés les plus chères à repeindre), SANS toucher aux animations
    // transform/opacity (quasi gratuites côté GPU : chute des pétales,
    // flottement des fantômes, etc.), qui continuent de tourner normalement.
    // Ne cible que les éléments injectés par ce script (id/classe préfixés
    // "fcr-"/"hazmat-fcr-"), jamais les éléments natifs de la page.
    // Appliqué instantanément via un <style> dédié, sans reload nécessaire.
    let _fcrPerfStyleEl = null;
    function fcrUpdatePerfModeStyle() {
        if (!_fcrPerfStyleEl) {
            _fcrPerfStyleEl = document.createElement('style');
            _fcrPerfStyleEl.id = 'fcr-perfmode-style';
            (document.head || document.documentElement).appendChild(_fcrPerfStyleEl);
        }
        _fcrPerfStyleEl.textContent = isModuleEnabled('perfMode') ? `
            #fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel,
            [class^="fcr-"], [id^="fcr-"], [id^="hazmat-fcr-"], .hazmat-fixed-banner,
            [class^="fcr-"] *, [id^="fcr-"] *, [id^="hazmat-fcr-"] *, .hazmat-fixed-banner * {
                box-shadow: none !important;
                text-shadow: none !important;
                filter: none !important;
                -webkit-filter: none !important;
            }
            #fcr-theme-header, #fcr-module-header, #hazmat-fcr-header {
                background-position: 50% 50% !important;
            }
        ` : '';
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

            toggleTrack.addEventListener('click', function(e) {
                e.stopPropagation();
                const k = this.dataset.key;
                const nowEnabled = !isModuleEnabled(k);
                setModuleEnabled(k, nowEnabled);
                this.classList.toggle('on', nowEnabled);
                // Le mode performance s'applique instantanément (simple <style>
                // toggle), pas besoin de recharger la page pour celui-ci.
                if (k === 'perfMode') {
                    fcrUpdatePerfModeStyle();
                    return;
                }
                // Show reload notice
                if (!document.getElementById('fcr-reload-notice')) {
                    const notice = document.createElement('div');
                    notice.id = 'fcr-reload-notice';
                    notice.textContent = '⚠️ Rechargez la page pour appliquer';
                    body.appendChild(notice);
                }
            });
        });

        header.addEventListener('click', (e) => {
            e.stopPropagation();
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

    // Détection globale page EditItemsApp — utilisée pour adapter le thème (lisibilité)
    // sans jamais toucher au rendu de FC Research.
    const FCR_IS_EDITITEMS_PAGE = window.location.pathname.startsWith('/app/edititems');
    // Détection globale page MoveItemsApp — même traitement que EditItemsApp (lisibilité).
    const FCR_IS_MOVEITEMS_PAGE = window.location.pathname.startsWith('/app/moveitems');

    // Recherche contenant (?s=tsX17kw7csr…) vs recherche ASIN (?s=B0xxxxx, X0xxxxxx, Zzxxxxxx…)
    // Utilisé pour n'activer certaines fonctionnalités (impression stock) que sur les
    // pages de résultats de recherche par contenant.
    function getSearchParamS() {
        try { return new URLSearchParams(window.location.search).get('s') || ''; }
        catch (e) { return ''; }
    }
    function isContainerSearchPage() {
        return /^ts/i.test(getSearchParamS());
    }

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
    // Perf : toutes les instances de waitForKeyElements partagent UN SEUL
    // MutationObserver sur document.body au lieu d'en créer un par appel
    // (jusqu'à 8 observers redondants auparavant). Comportement identique :
    // chaque enregistrement garde son propre debounce (150ms) et sa propre
    // logique runOnce ; seul le "capteur" DOM sous-jacent est mutualisé.
    let _wfkeListeners = [];
    let _wfkeSharedObserver = null;

    function _wfkeEnsureSharedObserver() {
        if (_wfkeSharedObserver) return;
        _wfkeSharedObserver = new MutationObserver(() => {
            _wfkeListeners.forEach(entry => {
                if (entry.wfkePending) return; // ignore si déjà schedulé
                entry.wfkePending = true;
                clearTimeout(entry.wfkeTimer);
                entry.wfkeTimer = setTimeout(() => {
                    entry.wfkePending = false;
                    const found = entry.processMatches();
                    if (found && entry.runOnce) {
                        _wfkeListeners = _wfkeListeners.filter(e => e !== entry);
                    }
                }, 150); // debounce augmenté : 80ms → 150ms
            });
        });
        _wfkeSharedObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: false,  // on n'a pas besoin des attributs
            characterData: false // ni du texte
        });
    }

    function waitForKeyElements(selector, callback, runOnce = false) {
        const seen = new WeakSet();

        function processMatches() {
            const elements = document.querySelectorAll(selector);
            let matched = false;
            elements.forEach(el => {
                if (seen.has(el)) return;
                seen.add(el);
                matched = true;
                const jqLike = $(el);
                callback(jqLike);
            });
            return matched;
        }

        const foundImmediately = processMatches();
        if (foundImmediately && runOnce) return;

        _wfkeEnsureSharedObserver();
        _wfkeListeners.push({ processMatches, runOnce, wfkeTimer: null, wfkePending: false });
    }

    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    // ════════════════════════════════════════════════════════════════
    // ===== TROUVER UNE COLONNE DU TABLEAU INVENTORY PAR SON LIBELLÉ =====
    // ════════════════════════════════════════════════════════════════
    // Le tableau #table-inventory (DataTables en scrollX) sépare l'en-tête
    // (dataTables_scrollHead) du corps (tbody). Plutôt que de figer des
    // "td:nth-child(2)" un peu partout dans le script (fragile dès qu'une
    // colonne est ajoutée/retirée, comme la colonne Étage optionnelle),
    // on retrouve la position réelle de la colonne à partir du texte de
    // son en-tête, avec un petit cache invalidé si le nombre de colonnes change.
    const _fcrInvColCache = {};
    function fcrGetInventoryColIndex(labelStartsWith) {
        const headerRow = document.querySelector('#table-inventory_wrapper .dataTables_scrollHead thead tr');
        if (!headerRow) return -1;
        const ths = headerRow.querySelectorAll('th');
        const cacheKey = labelStartsWith.toLowerCase();
        const cached = _fcrInvColCache[cacheKey];
        if (cached && cached.colCount === ths.length) return cached.index;
        let index = -1;
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim().toLowerCase().startsWith(cacheKey)) { index = i; break; }
        }
        _fcrInvColCache[cacheKey] = { colCount: ths.length, index };
        return index;
    }
    // Renvoie la cellule <td> d'une ligne du tableau inventory correspondant
    // au libellé d'en-tête donné (ex: "asin", "quantity"). Retombe sur un
    // index par défaut si l'en-tête n'a pas pu être lue (sécurité).
    function fcrGetInventoryCell(row, labelStartsWith, fallbackIndex) {
        const idx = fcrGetInventoryColIndex(labelStartsWith);
        const cells = row.children;
        if (idx >= 0 && cells[idx]) return cells[idx];
        return (fallbackIndex != null && cells[fallbackIndex]) ? cells[fallbackIndex] : null;
    }

    // ════════════════════════════════════════════════════════════════
    // ===== OBSERVER RACINE PARTAGÉ (perf) =====
    // ════════════════════════════════════════════════════════════════
    // Avant : hazmatObserver, inventoryObserver, prepObserver, probObserver,
    // l'observer du prix Amazon.fr, l'observer hover images et l'observer
    // du statut inventaire (module Edit Item) créaient chacun leur PROPRE
    // MutationObserver sur main/#content (voire document.body pour ce
    // dernier). Résultat : jusqu'à 7 handlers indépendants réveillés à
    // CHAQUE mutation DOM (un survol, une tooltip, une animation de
    // thème...), même quand une seule fonctionnalité est concernée.
    // Ici : un seul MutationObserver réel observe main/#content, et chaque
    // fonctionnalité s'enregistre simplement avec son callback (qui garde
    // son propre debounce individuel comme avant). Comportement strictement
    // identique, mais un seul "capteur" DOM partagé au lieu de 7.
    let _fcrRootObserver = null;
    const _fcrRootCallbacks = [];

    function fcrGetRoot() {
        return document.querySelector('main') || document.querySelector('[role="main"]') || document.querySelector('#content') || document.body;
    }

    function fcrOnRootMutation(callback) {
        _fcrRootCallbacks.push(callback);
        if (!_fcrRootObserver) {
            _fcrRootObserver = new MutationObserver((mutations) => {
                _fcrRootCallbacks.forEach(cb => {
                    try { cb(mutations); } catch (e) { /* un callback en erreur ne doit pas bloquer les autres */ }
                });
            });
            _fcrRootObserver.observe(fcrGetRoot(), { childList: true, subtree: true, attributes: false, characterData: false });
        }
        return _fcrRootObserver;
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
        // ── THÈMES STATIQUES PREMIUM ───────────────────────────────────
        obsidian: {
            bg1:'#0c0c0e', bg2:'#111115', bg3:'#1a1a20',
            accent:'#c9a84c', accentDark:'#6b520e', label:'✦ Obsidian Gold',
            prepBg:'#111115', prepNoPrep:'#e05555', prepYes:'#e8c97a',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #1a1a20 0%, #2a2510 45%, #3a3018 100%)',
            gradPanel:'linear-gradient(160deg, #0c0c0e 0%, #111115 55%, #0c0c0e 100%)',
            gradAccent:'linear-gradient(90deg, #c9a84c 0%, #e8c97a 40%, #f5dfa0 60%, #c9a84c 100%)',
            gradBtn:'linear-gradient(135deg, #1a1a20 0%, #3a2e08 60%, #c9a84c 100%)'
        },
        crimson: {
            bg1:'#0f0608', bg2:'#180a0c', bg3:'#22080c',
            accent:'#e05555', accentDark:'#6b0f1a', label:'◈ Deep Crimson',
            prepBg:'#180a0c', prepNoPrep:'#ffd700', prepYes:'#ff8080',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #22080c 0%, #4a0f18 45%, #6b1a24 100%)',
            gradPanel:'linear-gradient(160deg, #0f0608 0%, #180a0c 55%, #0f0608 100%)',
            gradAccent:'linear-gradient(90deg, #e05555 0%, #ff7070 40%, #ff9090 60%, #e05555 100%)',
            gradBtn:'linear-gradient(135deg, #22080c 0%, #6b0f1a 60%, #e05555 100%)'
        },
        carbon: {
            bg1:'#080e0d', bg2:'#0d1a18', bg3:'#132420',
            accent:'#2dd4a0', accentDark:'#0a5a40', label:'◉ Carbon Teal',
            prepBg:'#0d1a18', prepNoPrep:'#ff7043', prepYes:'#80ffe8',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #132420 0%, #1a3d30 45%, #1e5040 100%)',
            gradPanel:'linear-gradient(160deg, #080e0d 0%, #0d1a18 55%, #080e0d 100%)',
            gradAccent:'linear-gradient(90deg, #2dd4a0 0%, #60e8c0 40%, #80ffe8 60%, #2dd4a0 100%)',
            gradBtn:'linear-gradient(135deg, #132420 0%, #0a5a40 60%, #2dd4a0 100%)'
        },
        ironblue: {
            bg1:'#07090f', bg2:'#0d1220', bg3:'#101828',
            accent:'#7aaaff', accentDark:'#1a3a7a', label:'⬡ Iron Blue',
            prepBg:'#0d1220', prepNoPrep:'#ff6b6b', prepYes:'#b0d0ff',
            isGradient:true,
            gradHeader:'linear-gradient(135deg, #101828 0%, #1a2a50 45%, #223060 100%)',
            gradPanel:'linear-gradient(160deg, #07090f 0%, #0d1220 55%, #07090f 100%)',
            gradAccent:'linear-gradient(90deg, #5b8fff 0%, #7aaaff 40%, #b0d0ff 60%, #5b8fff 100%)',
            gradBtn:'linear-gradient(135deg, #101828 0%, #1a3a7a 60%, #5b8fff 100%)'
        },
        // ── THÈMES ANIMÉS ──────────────────────────────────────────────
        sakura: {
            bg1:'#0d0510', bg2:'#170b1e', bg3:'#261530',
            accent:'#ffb7c5', accentDark:'#7a3050', label:'🌸 Sakura',
            prepBg:'#170b1e', prepNoPrep:'#ffd700', prepYes:'#ffb7c5',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #261530 0%, #5a1a3a 45%, #9e2d5a 100%)',
            gradPanel:'linear-gradient(160deg, #0d0510 0%, #170b1e 55%, #0d0510 100%)',
            gradAccent:'linear-gradient(90deg, #ffb7c5 0%, #ffd6e0 40%, #ffc8a0 70%, #ffb7c5 100%)',
            gradBtn:'linear-gradient(135deg, #261530 0%, #7a2550 100%)',
            animCSS:`
@keyframes fcr-sakura-fall {
    0%   { transform: translateY(-60px) rotate(0deg); opacity: 0; }
    10%  { opacity: 0.9; }
    90%  { opacity: 0.7; }
    100% { transform: translateY(110vh) rotate(360deg); opacity: 0; }
}
@keyframes fcr-sakura-sway {
    0%,100% { margin-left: 0px; }
    25%      { margin-left: 30px; }
    75%      { margin-left: -20px; }
}
@keyframes fcr-sakura-bg-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
@keyframes fcr-sakura-glow {
    0%,100% { box-shadow: 0 0 8px #ffb7c533, 0 0 18px #ff6b9511; }
    50%      { box-shadow: 0 0 20px #ffb7c577, 0 0 40px #ff6b9533; }
}
body, #side-bar {
    background:
        linear-gradient(160deg, rgba(13,5,16,0.55), rgba(26,8,32,0.4), rgba(13,5,16,0.55), rgba(18,6,21,0.45), rgba(13,5,16,0.55)),
        url('https://images.unsplash.com/photo-1516205651411-aef33a44f7c2?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '🌸';
    position: fixed;
    top: -60px;
    left: 10%;
    font-size: 16px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-sakura-fall 7s linear infinite, fcr-sakura-sway 3s ease-in-out infinite;
    opacity: 0.8;
}
body::after {
    content: '🌸';
    position: fixed;
    top: -60px;
    left: 65%;
    font-size: 12px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-sakura-fall 9s linear 3s infinite, fcr-sakura-sway 4s ease-in-out infinite;
    opacity: 0.6;
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-sakura-glow 5s ease-in-out infinite !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #261530, #5a1a3a, #9e2d5a, #5a1a3a, #261530) !important;
    background-size: 300% 300% !important;
    animation: fcr-sakura-bg-shift 8s ease infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    text-shadow: 0 0 8px #ffb7c5aa, 0 0 20px #ff6b9566 !important;
}`
        },
        ophe: {
            bg1:'#fff0f5', bg2:'#ffe4ee', bg3:'#ffd6e7',
            accent:'#e75480', accentDark:'#b03060', label:'🌸 Ophé',
            prepBg:'#ffe4ee', prepNoPrep:'#e75480', prepYes:'#c77dff',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #ffd6e7 0%, #ffadd6 45%, #f9a8d4 100%)',
            gradPanel:'linear-gradient(160deg, #fff0f5 0%, #ffe4ee 55%, #fff0f5 100%)',
            gradAccent:'linear-gradient(90deg, #f9a8d4 0%, #fcd5e8 40%, #e9b8d3 70%, #f9a8d4 100%)',
            gradBtn:'linear-gradient(135deg, #ffd6e7 0%, #f9a8d4 60%, #e75480 100%)',
            animCSS:`
@keyframes fcr-ophe-fall {
    0%   { transform: translateY(-60px) rotate(0deg) scale(0.8); opacity: 0; }
    8%   { opacity: 1; }
    90%  { opacity: 0.8; }
    100% { transform: translateY(110vh) rotate(300deg) scale(1.1); opacity: 0; }
}
@keyframes fcr-ophe-sway {
    0%,100% { margin-left: 0px; }
    30%      { margin-left: 28px; }
    70%      { margin-left: -18px; }
}
@keyframes fcr-ophe-float {
    0%,100% { transform: translateY(0px) rotate(-2deg); }
    50%      { transform: translateY(-12px) rotate(2deg); }
}
@keyframes fcr-ophe-bg-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
@keyframes fcr-ophe-glow {
    0%,100% { box-shadow: 0 0 10px #f9a8d444, 0 0 22px #ffd6e722; }
    50%      { box-shadow: 0 0 22px #f9a8d4aa, 0 0 44px #ffd6e766; }
}
.fcr-ophe-petal {
    position: fixed;
    pointer-events: none;
    z-index: 9996;
    line-height: 1;
}
body, #side-bar {
    background:
        linear-gradient(160deg, rgba(255,240,245,0.5), rgba(255,228,238,0.35), rgba(255,240,245,0.5), rgba(255,214,231,0.4), rgba(255,240,245,0.5)),
        url('https://images.unsplash.com/photo-1706125473025-0fe75e7b68ca?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '🌸';
    position: fixed;
    top: -60px;
    left: 8%;
    font-size: 14px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-ophe-fall 8s linear infinite, fcr-ophe-sway 3.5s ease-in-out infinite;
    opacity: 0.9;
    filter: drop-shadow(0 0 4px #f9a8d499);
}
body::after {
    content: '🌸';
    position: fixed;
    top: -60px;
    left: 62%;
    font-size: 10px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-ophe-fall 11s linear 4s infinite, fcr-ophe-sway 4.5s ease-in-out 1s infinite;
    opacity: 0.7;
    filter: drop-shadow(0 0 3px #fcd5e899);
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-ophe-glow 4s ease-in-out infinite !important;
    border-color: #f9a8d488 !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #ffd6e7, #ffadd6, #f9a8d4, #ffadd6, #ffd6e7) !important;
    background-size: 300% 300% !important;
    animation: fcr-ophe-bg-shift 9s ease infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    color: #b03060 !important;
    text-shadow: 0 0 8px #f9a8d4aa, 0 0 18px #ffd6e766 !important;
}
/* Override dark text for light theme */
#fcr-theme-panel, #fcr-module-panel {
    color: #6b2040 !important;
}
#fcr-theme-body .fcr-theme-btn {
    color: #6b2040 !important;
    border-color: #f9a8d4 !important;
}
#fcr-theme-body .fcr-theme-btn:hover {
    background: #ffd6e7 !important;
}
#fcr-module-panel .fcr-module-row-label { color: #6b2040 !important; }
table.a-bordered tr:first-child th {
    border-bottom: 2px solid #f9a8d477 !important;
    text-shadow: 0 0 8px #f9a8d499 !important;
}
.a-box { border-top-color: #f9a8d4 !important; }
/* Correction texte gris/blanc illisible sur fond pastel */
body, #side-bar, .p, .a-popover-inner, body a,
.a-box, .a-cal-na, #fcrp_cfg, table.a-keyvalue th,
.custom-context-menu, .custom-context-menu .menu-item,
.barcodes_panel, .barcodes_panel > p,
#disposition-filter, #consumer-filter, #container-filter, #bin-check-comment {
    color: #3a1a2e !important;
}
/* Titre "Stock" et titres de section (blanc codé en dur) */
.a-box-title .a-box-inner, .a-popover-header, .aui-nav-row {
    color: #3a1a2e !important;
}
/* Champ de recherche */
.a-search input {
    color: #3a1a2e !important;
    background-color: #fff0f5 !important;
    border: 1px solid #f9a8d4 !important;
}
.a-search input::placeholder {
    color: #b06080 !important;
    opacity: 1 !important;
}
#fcr-theme-panel, #fcr-module-panel {
    color: #3a1a2e !important;
}
#fcr-module-panel .fcr-module-row-label {
    color: #3a1a2e !important;
}
#fcr-theme-body .fcr-theme-btn {
    color: #3a1a2e !important;
}
`
        },
        fred: {
            bg1:'#0a1a00', bg2:'#122200', bg3:'#1e3800',
            accent:'#a8ff3e', accentDark:'#3a6600', label:'🦕 FRED',
            prepBg:'#122200', prepNoPrep:'#ff6b35', prepYes:'#a8ff3e',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #1e3800 0%, #3a6600 45%, #5a9a00 100%)',
            gradPanel:'linear-gradient(160deg, #0a1a00 0%, #122200 55%, #0a1a00 100%)',
            gradAccent:'linear-gradient(90deg, #a8ff3e 0%, #d4ff80 40%, #ffdd57 70%, #a8ff3e 100%)',
            gradBtn:'linear-gradient(135deg, #1e3800 0%, #3a6600 60%, #a8ff3e 100%)',
            animCSS:`
@keyframes fcr-fred-walk {
    0%   { transform: translateX(-120px) scaleX(1); }
    45%  { transform: translateX(calc(100vw + 120px)) scaleX(1); }
    46%  { transform: translateX(calc(100vw + 120px)) scaleX(-1); }
    95%  { transform: translateX(-120px) scaleX(-1); }
    96%  { transform: translateX(-120px) scaleX(1); }
    100% { transform: translateX(-120px) scaleX(1); }
}
@keyframes fcr-fred-walk2 {
    0%   { transform: translateX(-100px) scaleX(1); }
    45%  { transform: translateX(calc(100vw + 100px)) scaleX(1); }
    46%  { transform: translateX(calc(100vw + 100px)) scaleX(-1); }
    95%  { transform: translateX(-100px) scaleX(-1); }
    96%  { transform: translateX(-100px) scaleX(1); }
    100% { transform: translateX(-100px) scaleX(1); }
}
@keyframes fcr-fred-walk3 {
    0%   { transform: translateX(-80px) scaleX(-1); }
    45%  { transform: translateX(calc(100vw + 80px)) scaleX(-1); }
    46%  { transform: translateX(calc(100vw + 80px)) scaleX(1); }
    95%  { transform: translateX(-80px) scaleX(1); }
    96%  { transform: translateX(-80px) scaleX(-1); }
    100% { transform: translateX(-80px) scaleX(-1); }
}
@keyframes fcr-fred-fly {
    0%   { transform: translateX(-80px) translateY(0px) scaleX(1); }
    20%  { transform: translateX(25vw) translateY(-30px) scaleX(1); }
    45%  { transform: translateX(calc(100vw + 80px)) translateY(10px) scaleX(1); }
    46%  { transform: translateX(calc(100vw + 80px)) translateY(10px) scaleX(-1); }
    70%  { transform: translateX(60vw) translateY(-20px) scaleX(-1); }
    95%  { transform: translateX(-80px) translateY(0px) scaleX(-1); }
    96%  { transform: translateX(-80px) translateY(0px) scaleX(1); }
    100% { transform: translateX(-80px) translateY(0px) scaleX(1); }
}
@keyframes fcr-fred-bg-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
@keyframes fcr-fred-glow {
    0%,100% { box-shadow: 0 0 8px #a8ff3e33, 0 0 18px #5a9a0011; }
    50%      { box-shadow: 0 0 22px #a8ff3e77, 0 0 44px #ffdd5733; }
}
@keyframes fcr-fred-text-glow {
    0%,100% { text-shadow: 0 0 6px #a8ff3ecc, 0 0 16px #a8ff3e66; }
    50%      { text-shadow: 0 0 14px #ffdd57cc, 0 0 32px #ffdd5766; }
}
.fcr-fred-dino {
    position: fixed;
    pointer-events: none;
    z-index: 9997;
    line-height: 1;
    filter: drop-shadow(0 0 5px #a8ff3e66);
}
body, #side-bar {
    background:
        linear-gradient(160deg, rgba(10,26,0,0.55), rgba(22,40,0,0.4), rgba(10,26,0,0.55), rgba(15,34,0,0.45), rgba(10,26,0,0.55)),
        url('https://images.unsplash.com/photo-1560851691-ebb64b584d3d?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '🦕';
    position: fixed;
    bottom: 2px;
    left: 0;
    font-size: 42px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-fred-walk 26s linear infinite;
    line-height: 1;
    filter: drop-shadow(0 0 8px #a8ff3e99);
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-fred-glow 4s ease-in-out infinite !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #1e3800, #3a6600, #5a9a00, #3a6600, #1e3800) !important;
    background-size: 300% 300% !important;
    animation: fcr-fred-bg-shift 10s ease infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    animation: fcr-fred-text-glow 3s ease-in-out infinite !important;
}
table.a-bordered tr:first-child th {
    border-bottom: 2px solid #a8ff3e55 !important;
    text-shadow: 0 0 8px #a8ff3e88 !important;
}
.a-box { border-top-color: #a8ff3e !important; }
`
        },
        blizzard: {
            bg1:'#010a14', bg2:'#021828', bg3:'#032a44',
            accent:'#a8e4ff', accentDark:'#1a5577', label:'❄️ Blizzard',
            prepBg:'#021828', prepNoPrep:'#ff6b6b', prepYes:'#a8e4ff',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #032a44 0%, #1a5577 45%, #2a80aa 100%)',
            gradPanel:'linear-gradient(160deg, #010a14 0%, #021828 55%, #010a14 100%)',
            gradAccent:'linear-gradient(90deg, #a8e4ff 0%, #ffffff 40%, #c8f0ff 70%, #a8e4ff 100%)',
            gradBtn:'linear-gradient(135deg, #032a44 0%, #1a5577 60%, #a8e4ff 100%)',
            animCSS:`
@keyframes fcr-bliz-snow {
    0%   { transform: translateY(-30px) translateX(0px) rotate(0deg); opacity: 0; }
    5%   { opacity: 0.9; }
    90%  { opacity: 0.6; }
    100% { transform: translateY(110vh) translateX(40px) rotate(360deg); opacity: 0; }
}
@keyframes fcr-bliz-snow2 {
    0%   { transform: translateY(-30px) translateX(0px) rotate(0deg); opacity: 0; }
    5%   { opacity: 0.7; }
    90%  { opacity: 0.4; }
    100% { transform: translateY(110vh) translateX(-50px) rotate(-270deg); opacity: 0; }
}
@keyframes fcr-bliz-snow3 {
    0%   { transform: translateY(-30px) translateX(0px); opacity: 0; }
    8%   { opacity: 0.5; }
    85%  { opacity: 0.3; }
    100% { transform: translateY(110vh) translateX(25px); opacity: 0; }
}
@keyframes fcr-bliz-penguin {
    0%   { transform: translateX(-80px) scaleX(1); }
    48%  { transform: translateX(calc(100vw + 80px)) scaleX(1); }
    49%  { transform: translateX(calc(100vw + 80px)) scaleX(-1); }
    97%  { transform: translateX(-80px) scaleX(-1); }
    98%  { transform: translateX(-80px) scaleX(1); }
    100% { transform: translateX(-80px) scaleX(1); }
}
@keyframes fcr-bliz-bg {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
@keyframes fcr-bliz-glow {
    0%,100% { box-shadow: 0 0 8px #a8e4ff33, 0 0 18px #1a557711; }
    50%      { box-shadow: 0 0 22px #a8e4ff77, 0 0 44px #ffffff33; }
}
@keyframes fcr-bliz-text {
    0%,100% { text-shadow: 0 0 6px #a8e4ffcc, 0 0 16px #a8e4ff66; }
    50%      { text-shadow: 0 0 14px #ffffffcc, 0 0 32px #ffffff66; }
}
.fcr-bliz-flake {
    position: fixed;
    pointer-events: none;
    z-index: 9996;
}
body, #side-bar {
    background:
        linear-gradient(160deg, rgba(1,10,20,0.55), rgba(2,24,40,0.4), rgba(1,10,20,0.55), rgba(1,16,32,0.45), rgba(1,10,20,0.55)),
        url('https://images.unsplash.com/photo-1743376272672-c130603a3af2?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '🐻‍❄️';
    position: fixed;
    bottom: 2px;
    left: 0;
    font-size: 32px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-bliz-penguin 20s linear infinite;
    filter: drop-shadow(0 0 6px #a8e4ff88);
}
body::after {
    content: '❄️';
    position: fixed;
    top: -30px;
    left: 15%;
    font-size: 18px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-bliz-snow 8s linear infinite;
    opacity: 0.8;
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-bliz-glow 4s ease-in-out infinite !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #032a44, #1a5577, #2a80aa, #1a5577, #032a44) !important;
    background-size: 300% 300% !important;
    animation: fcr-bliz-bg 12s ease infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    animation: fcr-bliz-text 3s ease-in-out infinite !important;
}
table.a-bordered tr:first-child th {
    border-bottom: 2px solid #a8e4ff55 !important;
    text-shadow: 0 0 8px #a8e4ff88 !important;
}
.a-box { border-top-color: #a8e4ff !important; }
`
        },
        safari: {
            bg1:'#1a0e00', bg2:'#2a1800', bg3:'#3d2500',
            accent:'#ffbb44', accentDark:'#7a5500', label:'🌺 Safari',
            prepBg:'#2a1800', prepNoPrep:'#ff4444', prepYes:'#ffbb44',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #3d2500 0%, #7a4a00 45%, #b06a00 100%)',
            gradPanel:'linear-gradient(160deg, #1a0e00 0%, #2a1800 55%, #1a0e00 100%)',
            gradAccent:'linear-gradient(90deg, #ffbb44 0%, #ffdd88 40%, #ff8844 70%, #ffbb44 100%)',
            gradBtn:'linear-gradient(135deg, #3d2500 0%, #7a4a00 60%, #ffbb44 100%)',
            animCSS:`
@keyframes fcr-saf-walk {
    0%   { transform: translateX(-120px) scaleX(1); }
    48%  { transform: translateX(calc(100vw + 120px)) scaleX(1); }
    49%  { transform: translateX(calc(100vw + 120px)) scaleX(-1); }
    97%  { transform: translateX(-120px) scaleX(-1); }
    98%  { transform: translateX(-120px) scaleX(1); }
    100% { transform: translateX(-120px) scaleX(1); }
}
@keyframes fcr-saf-walk2 {
    0%   { transform: translateX(-100px) scaleX(-1); }
    48%  { transform: translateX(calc(100vw + 100px)) scaleX(-1); }
    49%  { transform: translateX(calc(100vw + 100px)) scaleX(1); }
    97%  { transform: translateX(-100px) scaleX(1); }
    98%  { transform: translateX(-100px) scaleX(-1); }
    100% { transform: translateX(-100px) scaleX(-1); }
}
@keyframes fcr-saf-fly {
    0%   { transform: translateX(-60px) translateY(0px) scaleX(1); }
    25%  { transform: translateX(30vw) translateY(-25px) scaleX(1); }
    48%  { transform: translateX(calc(100vw + 60px)) translateY(5px) scaleX(1); }
    49%  { transform: translateX(calc(100vw + 60px)) translateY(5px) scaleX(-1); }
    75%  { transform: translateX(55vw) translateY(-20px) scaleX(-1); }
    99%  { transform: translateX(-60px) translateY(0px) scaleX(-1); }
    100% { transform: translateX(-60px) translateY(0px) scaleX(1); }
}
@keyframes fcr-saf-bg {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
@keyframes fcr-saf-glow {
    0%,100% { box-shadow: 0 0 8px #ffbb4433, 0 0 18px #7a550011; }
    50%      { box-shadow: 0 0 22px #ffbb4477, 0 0 44px #ff884433; }
}
@keyframes fcr-saf-text {
    0%,100% { text-shadow: 0 0 6px #ffbb44cc, 0 0 16px #ffbb4466; }
    50%      { text-shadow: 0 0 14px #ffdd88cc, 0 0 32px #ffdd8866; }
}
.fcr-saf-animal {
    position: fixed;
    pointer-events: none;
    line-height: 1;
}
body, #side-bar {
    background:
        linear-gradient(160deg, rgba(26,14,0,0.55), rgba(42,24,0,0.4), rgba(26,14,0,0.55), rgba(34,18,0,0.45), rgba(26,14,0,0.55)),
        url('https://images.unsplash.com/photo-1756475471671-48813cf5ea5b?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '🦒';
    position: fixed;
    bottom: 2px;
    left: 0;
    font-size: 44px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-saf-walk 18s linear infinite;
    filter: drop-shadow(0 0 6px #ffbb4488);
}
body::after {
    content: '🦁';
    position: fixed;
    bottom: 2px;
    left: 0;
    font-size: 30px;
    pointer-events: none;
    z-index: 9996;
    opacity: 0.85;
    animation: fcr-saf-walk2 12s linear 5s infinite;
    filter: drop-shadow(0 0 5px #ff884466);
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-saf-glow 4s ease-in-out infinite !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #3d2500, #7a4a00, #b06a00, #7a4a00, #3d2500) !important;
    background-size: 300% 300% !important;
    animation: fcr-saf-bg 10s ease infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    animation: fcr-saf-text 3s ease-in-out infinite !important;
}
table.a-bordered tr:first-child th {
    border-bottom: 2px solid #ffbb4455 !important;
    text-shadow: 0 0 8px #ffbb4488 !important;
}
.a-box { border-top-color: #ffbb44 !important; }
`
        },
        phantominion: {
            bg1:'#0a0014', bg2:'#110022', bg3:'#1c0035',
            accent:'#c77dff', accentDark:'#5a1a8a', label:'👻 Phantominion',
            prepBg:'#110022', prepNoPrep:'#ffd700', prepYes:'#c77dff',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #1c0035 0%, #3d006b 45%, #5a1a8a 100%)',
            gradPanel:'linear-gradient(160deg, #0a0014 0%, #110022 55%, #0a0014 100%)',
            gradAccent:'linear-gradient(90deg, #c77dff 0%, #e0aaff 40%, #ffd700 70%, #c77dff 100%)',
            gradBtn:'linear-gradient(135deg, #1c0035 0%, #5a1a8a 60%, #c77dff 100%)',
            animCSS:`
@keyframes fcr-phan-bg-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
@keyframes fcr-phan-float {
    0%,100% { transform: translateX(-150px) translateY(0px) scaleX(1); opacity:0; }
    3%       { opacity:1; }
    46%      { transform: translateX(calc(100vw + 150px)) translateY(-18px) scaleX(1); opacity:0.9; }
    47%      { transform: translateX(calc(100vw + 150px)) translateY(-18px) scaleX(-1); opacity:0; }
    50%      { opacity:0; }
    53%      { opacity:0.7; }
    97%      { transform: translateX(-150px) translateY(8px) scaleX(-1); opacity:0.7; }
    98%      { opacity:0; }
}
@keyframes fcr-phan-float2 {
    0%,100% { transform: translateX(-100px) translateY(0px) scaleX(1); opacity:0; }
    5%       { opacity:0.6; }
    44%      { transform: translateX(calc(100vw + 100px)) translateY(22px) scaleX(1); opacity:0.55; }
    45%      { transform: translateX(calc(100vw + 100px)) translateY(22px) scaleX(-1); opacity:0; }
    55%      { opacity:0; }
    58%      { opacity:0.5; }
    96%      { transform: translateX(-100px) translateY(-10px) scaleX(-1); opacity:0.5; }
    97%      { opacity:0; }
}
@keyframes fcr-phan-bob {
    0%,100% { transform: translateY(0px) rotate(-3deg); }
    25%      { transform: translateY(-8px) rotate(2deg); }
    50%      { transform: translateY(-4px) rotate(-1deg); }
    75%      { transform: translateY(-10px) rotate(3deg); }
}
@keyframes fcr-phan-glow {
    0%,100% { box-shadow: 0 0 10px #c77dff44, 0 0 25px #5a1a8a22; }
    50%      { box-shadow: 0 0 28px #c77dff99, 0 0 55px #ffd70033; }
}
@keyframes fcr-phan-text-glow {
    0%,100% { text-shadow: 0 0 7px #c77dffcc, 0 0 18px #9b4dca66; }
    50%      { text-shadow: 0 0 16px #e0aaffcc, 0 0 36px #ffd70066; }
}
@keyframes fcr-phan-orb-float {
    0%,100% { transform: translateY(0px) scale(1); opacity:0.18; }
    50%      { transform: translateY(-16px) scale(1.08); opacity:0.32; }
}
@keyframes fcr-phan-orb-float2 {
    0%,100% { transform: translateY(0px) scale(1); opacity:0.12; }
    50%      { transform: translateY(-22px) scale(1.12); opacity:0.25; }
}
@keyframes fcr-phan-stars {
    0%,100% { opacity:0.08; }
    50%      { opacity:0.22; }
}
.fcr-phan-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 9997;
    line-height: 1;
}
.fcr-phan-orb {
    position: fixed;
    pointer-events: none;
    border-radius: 50%;
    filter: blur(32px);
}
body, #side-bar {
    background: linear-gradient(160deg, #0a0014, #110022, #1c0035, #0f0020, #0a0014) !important;
    background-size: 400% 400% !important;
    animation: fcr-phan-bg-shift 20s ease infinite !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '✦';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image:
        radial-gradient(circle, #c77dff22 1px, transparent 1px),
        radial-gradient(circle, #ffd70011 1px, transparent 1px);
    background-size: 80px 80px, 130px 130px;
    background-position: 0 0, 40px 40px;
    pointer-events: none;
    z-index: 9990;
    animation: fcr-phan-stars 6s ease-in-out infinite;
}
body::after { content: none !important; }
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-phan-glow 5s ease-in-out infinite !important;
    border-width: 1px !important;
    border-color: #c77dff55 !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #1c0035, #3d006b, #5a1a8a, #3d006b, #1c0035) !important;
    background-size: 300% 300% !important;
    animation: fcr-phan-bg-shift 12s ease infinite !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    animation: fcr-phan-text-glow 4s ease-in-out infinite !important;
}
table.a-bordered tr:first-child th {
    border-bottom: 2px solid #c77dff55 !important;
    text-shadow: 0 0 8px #c77dff88 !important;
}
.a-box { border-top-color: #c77dff !important; }
`
        },
        void_theme: {
            bg1:'#000005', bg2:'#080010', bg3:'#100018',
            accent:'#00ff88', accentDark:'#004433', label:'🌀 Void',
            prepBg:'#080010', prepNoPrep:'#ff4466', prepYes:'#00ff88',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #100018 0%, #200030 45%, #003322 100%)',
            gradPanel:'linear-gradient(160deg, #000005 0%, #080010 55%, #000005 100%)',
            gradAccent:'linear-gradient(90deg, #00ff88 0%, #00ccff 50%, #aa00ff 100%)',
            gradBtn:'linear-gradient(135deg, #100018 0%, #003322 60%, #00ff88 100%)',
            animCSS:`
@keyframes fcr-void-pulse {
    0%,100% { opacity:0.15; transform:scale(1); }
    50%      { opacity:0.35; transform:scale(1.08); }
}
@keyframes fcr-void-rotate {
    from { transform:translate(-50%,-50%) rotate(0deg); }
    to   { transform:translate(-50%,-50%) rotate(360deg); }
}
@keyframes fcr-void-flicker {
    0%,100% { text-shadow:0 0 6px #00ff88cc,0 0 18px #00ff8866; }
    20%     { text-shadow:0 0 2px #00ccffcc,0 0 8px #00ccff44; }
    40%     { text-shadow:0 0 10px #aa00ffcc,0 0 28px #aa00ff55; }
    60%     { text-shadow:0 0 4px #00ff88cc,0 0 12px #00ff8866; }
    80%     { text-shadow:0 0 8px #00ccffcc,0 0 22px #00ccff55; }
}
@keyframes fcr-void-border {
    0%,100% { box-shadow:0 0 6px #00ff8833,inset 0 0 6px #00ff8811; border-color:#00ff8844; }
    33%      { box-shadow:0 0 14px #00ccff55,inset 0 0 10px #00ccff22; border-color:#00ccff66; }
    66%      { box-shadow:0 0 10px #aa00ff44,inset 0 0 8px #aa00ff22; border-color:#aa00ff55; }
}
@keyframes fcr-void-scan {
    0%   { transform:translateY(-100%); }
    100% { transform:translateY(100vh); }
}
body, #side-bar {
    background:
        linear-gradient(160deg, rgba(10,0,20,0.55), rgba(17,0,34,0.4), rgba(10,0,20,0.6)),
        url('https://images.unsplash.com/photo-1754851539824-5a87c5c7cb86?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position:relative !important;
    overflow-x:hidden !important;
}
body::before {
    content:'';
    position:fixed;
    top:50%; left:50%;
    width:600px; height:600px;
    background:radial-gradient(ellipse at center, #00ff8808 0%, #aa00ff05 40%, transparent 70%);
    pointer-events:none;
    z-index:9995;
    animation:fcr-void-rotate 20s linear infinite, fcr-void-pulse 8s ease-in-out infinite;
    border-radius:50%;
}
body::after {
    content:'';
    position:fixed;
    top:0; left:0; right:0;
    height:2px;
    background:linear-gradient(90deg, transparent, #00ff88, #00ccff, #aa00ff, transparent);
    pointer-events:none;
    z-index:9999;
    animation:fcr-void-scan 6s linear infinite;
    opacity:0.4;
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation:fcr-void-border 4s ease-in-out infinite !important;
    border-width:1px !important;
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background:linear-gradient(135deg, #100018, #200030, #003322) !important;
    border-bottom:1px solid #00ff8833 !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    animation:fcr-void-flicker 7s ease-in-out infinite !important;
}
table.a-bordered tr:first-child th {
    border-bottom:2px solid #00ff8844 !important;
    text-shadow:0 0 8px #00ff8877 !important;
}
.a-box { border-top-color:#00ff88 !important; }
`
        },
        // ── THÈMES PHOTO (image de fond libre de droits, Unsplash License) ──
        foret: {
            bg1:'#060e08', bg2:'#0c1a0e', bg3:'#13260f',
            accent:'#9bd97a', accentDark:'#2f5a22', label:'🌲 Forêt',
            prepBg:'#0c1a0e', prepNoPrep:'#ffcc66', prepYes:'#b9e6a0',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #13260f 0%, #1f3a18 45%, #2f5a22 100%)',
            gradPanel:'linear-gradient(160deg, #060e08 0%, #0c1a0e 55%, #060e08 100%)',
            gradAccent:'linear-gradient(90deg, #9bd97a 0%, #c8f0a8 40%, #d8e8a0 70%, #9bd97a 100%)',
            gradBtn:'linear-gradient(135deg, #13260f 0%, #2f5a22 60%, #9bd97a 100%)',
            animCSS:`
@keyframes fcr-foret-leaf-fall {
    0%   { transform: translateY(-60px) rotate(0deg); opacity: 0; }
    10%  { opacity: 0.9; }
    90%  { opacity: 0.7; }
    100% { transform: translateY(110vh) rotate(280deg); opacity: 0; }
}
@keyframes fcr-foret-sway {
    0%,100% { margin-left: 0px; }
    25%      { margin-left: 26px; }
    75%      { margin-left: -22px; }
}
@keyframes fcr-foret-glow {
    0%,100% { box-shadow: 0 0 8px #9bd97a33, 0 0 18px #2f5a2222; }
    50%      { box-shadow: 0 0 18px #9bd97a77, 0 0 36px #2f5a2244; }
}
@keyframes fcr-foret-mist {
    0%,100% { opacity: 0.35; }
    50%      { opacity: 0.55; }
}
body, #side-bar {
    background:
        linear-gradient(180deg, rgba(4,12,6,0.42) 0%, rgba(4,14,8,0.28) 45%, rgba(4,12,6,0.48) 100%),
        url('https://images.unsplash.com/photo-1752334389871-ace84f0dd127?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse at 50% 30%, transparent 0%, rgba(3,10,5,0.55) 85%);
    pointer-events: none;
    z-index: 9994;
    animation: fcr-foret-mist 9s ease-in-out infinite;
}
body::after {
    content: '🍃';
    position: fixed;
    top: -60px;
    left: 12%;
    font-size: 16px;
    pointer-events: none;
    z-index: 9997;
    animation: fcr-foret-leaf-fall 8s linear infinite, fcr-foret-sway 4s ease-in-out infinite;
    opacity: 0.8;
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-foret-glow 5s ease-in-out infinite !important;
    background: rgba(6,14,8,0.82) !important;
    backdrop-filter: blur(2px);
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #13260f, #1f3a18, #2f5a22, #1f3a18, #13260f) !important;
    background-size: 300% 300% !important;
    animation: fcr-foret-bg-shift 10s ease infinite !important;
}
@keyframes fcr-foret-bg-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    text-shadow: 0 0 8px #9bd97aaa, 0 0 18px #2f5a2266 !important;
}`
        },
        neon: {
            bg1:'#06020c', bg2:'#0c0518', bg3:'#170a28',
            accent:'#ff4fd8', accentDark:'#5e1aa0', label:'🌆 Néon Urbain',
            prepBg:'#0c0518', prepNoPrep:'#ffe066', prepYes:'#7afcff',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #170a28 0%, #4a1466 45%, #a01a8c 100%)',
            gradPanel:'linear-gradient(160deg, #06020c 0%, #0c0518 55%, #06020c 100%)',
            gradAccent:'linear-gradient(90deg, #ff4fd8 0%, #7afcff 50%, #ffe066 100%)',
            gradBtn:'linear-gradient(135deg, #170a28 0%, #a01a8c 60%, #ff4fd8 100%)',
            animCSS:`
@keyframes fcr-neon-flicker {
    0%,100% { text-shadow:0 0 6px #ff4fd8cc,0 0 18px #ff4fd866; }
    20%     { text-shadow:0 0 2px #7afcffcc,0 0 8px #7afcff44; }
    40%     { text-shadow:0 0 10px #ffe066cc,0 0 26px #ffe06655; }
    60%     { text-shadow:0 0 4px #ff4fd8cc,0 0 12px #ff4fd866; }
    80%     { text-shadow:0 0 8px #7afcffcc,0 0 22px #7afcff55; }
}
@keyframes fcr-neon-border {
    0%,100% { box-shadow:0 0 6px #ff4fd833,inset 0 0 6px #ff4fd811; border-color:#ff4fd844; }
    33%      { box-shadow:0 0 14px #7afcff55,inset 0 0 10px #7afcff22; border-color:#7afcff66; }
    66%      { box-shadow:0 0 10px #ffe06644,inset 0 0 8px #ffe06622; border-color:#ffe06655; }
}
@keyframes fcr-neon-rain {
    0%   { transform: translateY(-40px); opacity: 0; }
    10%  { opacity: 0.7; }
    100% { transform: translateY(110vh); opacity: 0; }
}
@keyframes fcr-neon-glow-pulse {
    0%,100% { opacity: 0.5; }
    50%      { opacity: 0.8; }
}
body, #side-bar {
    background:
        linear-gradient(180deg, rgba(5,2,10,0.40) 0%, rgba(8,3,16,0.25) 45%, rgba(5,2,10,0.46) 100%),
        url('https://images.unsplash.com/photo-1759273621970-79e048b38cd2?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse at 50% 0%, rgba(255,79,216,0.08) 0%, transparent 60%);
    pointer-events: none;
    z-index: 9994;
    animation: fcr-neon-glow-pulse 6s ease-in-out infinite;
}
body::after {
    content: '';
    position: fixed;
    top: -40px;
    left: 22%;
    width: 1px;
    height: 30px;
    background: linear-gradient(180deg, transparent, #7afcffaa, transparent);
    pointer-events: none;
    z-index: 9997;
    animation: fcr-neon-rain 1.4s linear infinite;
}
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    animation: fcr-neon-border 4s ease-in-out infinite !important;
    background: rgba(8,3,16,0.82) !important;
    backdrop-filter: blur(2px);
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #170a28, #4a1466, #a01a8c, #4a1466, #170a28) !important;
    background-size: 300% 300% !important;
    animation: fcr-neon-bg-shift 9s ease infinite !important;
}
@keyframes fcr-neon-bg-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    animation: fcr-neon-flicker 6s ease-in-out infinite !important;
}`
        },
        neonbleu: {
            /* Fusionné avec le thème "Neo-Tokyo" (Sideline Refonte JB Edition) :
               cyberpunk néon bleu/magenta, coins chanfreinés, tubes-néon qui
               scintillent. L'image de fond reste STRICTEMENT celle d'origine
               du thème Néon Bleu (même URL Unsplash, non remplacée). */
            bg1:'#05040d', bg2:'#0a0a1a', bg3:'#0b0e22',
            accent:'#21e6ff', accentDark:'#1177a3', label:'🌃 Néon Bleu',
            prepBg:'#0a0a1a', prepNoPrep:'#ffb020', prepYes:'#21e6ff',
            isGradient:true, isAnimated:true,
            gradHeader:'linear-gradient(135deg, #0b0e22 0%, #7a1a5e 35%, #1177a3 70%, #21e6ff 100%)',
            gradPanel:'linear-gradient(160deg, #05040d 0%, #0b0e22 55%, #05040d 100%)',
            gradAccent:'linear-gradient(90deg, #21e6ff 0%, #ff2ea6 50%, #9df6ff 100%)',
            gradBtn:'linear-gradient(135deg, #0b0e22 0%, #1177a3 60%, #21e6ff 100%)',
            animCSS:`
/* ── image de fond d'origine "Néon Bleu", inchangée ── */
body, #side-bar {
    background:
        linear-gradient(180deg, rgba(5,4,13,0.42) 0%, rgba(10,10,26,0.26) 45%, rgba(5,4,13,0.48) 100%),
        url('https://images.unsplash.com/photo-1760016145562-aa96971749b0?fm=jpg&q=80&w=2000&auto=format&fit=crop')
        center / cover no-repeat fixed !important;
    position: relative !important;
    overflow-x: hidden !important;
}
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
        radial-gradient(ellipse 900px 500px at 12% -6%, rgba(33,230,255,0.10) 0%, transparent 60%),
        radial-gradient(ellipse 700px 460px at 104% 8%, rgba(255,46,166,0.09) 0%, transparent 55%);
    pointer-events: none;
    z-index: 9994;
    opacity: 0.85;
}
/* Coins chanfreinés cyberpunk sur les panneaux FCR (thème/module/hazmat) */
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel {
    box-shadow:0 0 10px #21e6ff44,inset 0 0 8px #21e6ff1f !important;
    border-color:#21e6ff55 !important;
    background: rgba(10,10,26,0.85) !important;
    backdrop-filter: blur(2px);
    clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
}
#hazmat-fcr-header, #fcr-theme-header, #fcr-module-header {
    background: linear-gradient(135deg, #0b0e22, #7a1a5e, #1177a3, #21e6ff, #1177a3, #7a1a5e, #0b0e22) !important;
    background-size: 400% 400% !important;
    animation: fcr-neonbleu-bg-shift 10s ease infinite !important;
}
@keyframes fcr-neonbleu-bg-shift {
    0%,100% { background-position: 0% 50%; }
    50%      { background-position: 100% 50%; }
}
/* Typographie "Sideline Neo-Tokyo" reprise à l'identique pour TOUT le thème
   Néon Bleu (pas seulement les panneaux FCR) : police monospace partout. */
body, body * {
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace !important;
}
#hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label {
    color: #eafcff !important;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-shadow:
        0 0 2px #eafcff,
        0 0 6px #eafcff,
        0 0 14px #21e6ff,
        0 0 26px #21e6ff,
        0 0 48px rgba(33,230,255,0.55),
        0 0 90px rgba(33,230,255,0.25) !important;
    animation: fcr-neonbleu-sign 6s infinite !important;
}
/* scintillement de tube néon identique à Sideline : reste allumé, deux courtes
   baisses d'intensité imprévisibles (pas de clignotement on/off franc) */
@keyframes fcr-neonbleu-sign {
    0%, 100% { opacity: 1; }
    41% { opacity: 1; }
    42% { opacity: 0.4; }
    43% { opacity: 1; }
    44% { opacity: 0.7; }
    45% { opacity: 1; }
    78% { opacity: 1; }
    79% { opacity: 0.5; }
    80% { opacity: 1; }
}
/* ================= SCINTILLEMENT — réservé au GROS TITRE + à l'enseigne =================
   Sur demande : plus aucun autre élément du thème (boutons, tableaux, tags,
   liens…) ne scintille. Seuls le gros titre des panneaux et l'enseigne
   lumineuse "FC Research" gardent l'animation de tube néon. */
@media (prefers-reduced-motion: reduce) {
    #hazmat-fcr-header-title, #fcr-theme-label, #fcr-module-label,
    #fcr-neon-logo-sign { animation: none !important; }
    body::after { animation: none !important; }
    #hazmat-fcr-header-title:hover, #fcr-theme-label:hover, #fcr-module-label:hover { animation: none !important; }
    #hazmat-fcr-header-title::before, #fcr-theme-label::before, #fcr-module-label::before { animation: none !important; }
    #fcr-neonbleu-clock { animation: none !important; }
    #fcr-neonbleu-clock .fcr-clock-colon { animation: none !important; }
}

/* ================= ENSEIGNE NÉON DU LOGO "FCResearch ETZ2" =================
   Style enseigne de ruelle tokyoïte : caisson à double tube (cyan + magenta),
   sous-titre en katakana, petit tampon "hanko" en kanji au coin — et TOUTE
   l'enseigne clignote D'UN SEUL BLOC (une seule animation posée sur le
   conteneur, qui fait varier l'opacité de l'ensemble en même temps).
   Remplace visuellement le logo noir d'origine, posé PAR-DESSUS l'élément
   d'origine (celui-ci est juste rendu invisible via visibility:hidden — il
   garde sa taille/sa place et reste cliquable si c'était un lien). */
#fcr-neon-logo-sign {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    visibility: visible !important;
    pointer-events: none;
    white-space: nowrap;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace !important;
    z-index: 5;
    animation: fcr-neonbleu-sign 6s infinite; /* toute l'enseigne scintille en bloc */
}
/* Caisson de l'enseigne : cadre chanfreiné à double tube (cyan extérieur + magenta intérieur), fond vitrine nocturne */
#fcr-neon-logo-sign .fcr-neon-logo-frame {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.1;
    padding: 6px 18px 6px 13px;
    background: linear-gradient(160deg, rgba(6,5,16,0.78) 0%, rgba(11,14,34,0.64) 100%);
    border: 1.5px solid #21e6ff;
    box-shadow:
        0 0 6px #21e6ffaa, 0 0 16px #21e6ff55, 0 0 34px #21e6ff33,
        inset 0 0 10px #21e6ff22;
    clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
}
/* Tube intérieur magenta, en retrait — effet "double néon" des vraies enseignes en verre */
#fcr-neon-logo-sign .fcr-neon-logo-frame::before {
    content: '';
    position: absolute;
    inset: 3px;
    border: 1px solid #ff2ea6;
    opacity: 0.5;
    clip-path: polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px);
    pointer-events: none;
}
/* Tampon "hanko" en kanji au coin du caisson : 研 (recherche / étude) */
#fcr-neon-logo-sign .fcr-neon-logo-frame::after {
    content: '研';
    position: absolute;
    top: -8px; right: -8px;
    width: 16px; height: 16px;
    display: flex; align-items: center; justify-content: center;
    font-size: 9px; font-weight: 900;
    color: #fff0f2;
    background: #c81e4d;
    border-radius: 50%;
    box-shadow: 0 0 4px #ff2ea6aa, 0 0 10px #ff2ea666;
    transform: rotate(8deg);
}
#fcr-neon-logo-sign .fcr-neon-logo-main {
    font-weight: 800;
    font-size: 21px;
    letter-spacing: 0.5px;
}
/* "FC" — tube cyan */
#fcr-neon-logo-sign .fcr-neon-logo-fc {
    color: #eafcff;
    text-shadow:
        0 0 2px #eafcff, 0 0 6px #eafcff,
        0 0 14px #21e6ff, 0 0 26px #21e6ff,
        0 0 48px rgba(33,230,255,0.55);
}
/* "Research" — tube magenta, légèrement plus fin */
#fcr-neon-logo-sign .fcr-neon-logo-research {
    font-weight: 600;
    color: #ffd6f0;
    text-shadow:
        0 0 2px #ffe9f6, 0 0 6px #ff6fc4,
        0 0 14px #ff2ea6, 0 0 28px rgba(255,46,166,0.5);
}
/* Séparateur pointillé avant le sous-titre, façon nameplate d'enseigne */
#fcr-neon-logo-sign .fcr-neon-logo-kana {
    margin-top: 3px;
    padding-top: 2px;
    border-top: 1px dashed rgba(255,176,32,0.4);
    width: 100%;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #ffe4b0;
    text-shadow: 0 0 2px #ffe4b0, 0 0 8px #ffb020, 0 0 18px rgba(255,176,32,0.5);
}
/* Badge "ETZ2" — petit panonceau incliné accroché au caisson, façon étiquette suspendue */
#fcr-neon-logo-sign .fcr-neon-logo-tag {
    align-self: flex-start;
    margin-top: -2px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #21e6ff;
    border: 1px solid #21e6ff88;
    border-radius: 2px;
    transform: rotate(-6deg);
    background: rgba(33,230,255,0.06);
    text-shadow: 0 0 3px #21e6ff, 0 0 10px #21e6ff88;
}
/* Boutons God Mode / Weight / CSV / LoadPrep : coins chanfreinés + liseré magenta au survol */
#manualAsinProfilerButton, #rnoSizeProfilerButton,
#hazmatLevelButton, #weightButton, #csvExportButton,
#csvHistoryButton, .LoadPrep-button, .fcr-print-btn,
.fcr-theme-btn, #fcr-freeprint-print, .barcode-close {
    clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px) !important;
}
#weightButton:hover, .LoadPrep-button:hover, #csvExportButton:hover, #csvHistoryButton:hover,
.fcr-print-btn:hover {
    box-shadow: 0 0 6px #ff2ea666, 0 0 14px #21e6ff88 !important;
}
/* Coins de visée HUD façon Neo-Tokyo, sur les 3 panneaux FCR (thème/module/hazmat) */
#fcr-theme-panel, #fcr-module-panel, #hazmat-fcr-panel { position: relative; }
#fcr-theme-panel::before, #fcr-theme-panel::after,
#fcr-module-panel::before, #fcr-module-panel::after,
#hazmat-fcr-panel::before, #hazmat-fcr-panel::after {
    content: '';
    position: absolute; width: 12px; height: 12px;
    pointer-events: none; opacity: 0.85;
}
#fcr-theme-panel::before, #fcr-module-panel::before, #hazmat-fcr-panel::before { top: -1px; left: -1px; border-top: 2px solid #ff2ea6; border-left: 2px solid #ff2ea6; }
#fcr-theme-panel::after,  #fcr-module-panel::after,  #hazmat-fcr-panel::after  { bottom: -1px; right: -1px; border-bottom: 2px solid #21e6ff; border-right: 2px solid #21e6ff; }
/* ================= SCANLINES CRT =================
   Fin voile de lignes horizontales façon écran cathodique, très subtil,
   qui dérive lentement vers le bas. N'intercepte aucun clic (pointer-events:none). */
body::after {
    content: '';
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
        0deg,
        rgba(0,0,0,0) 0px,
        rgba(0,0,0,0) 2px,
        rgba(33,230,255,0.035) 3px,
        rgba(0,0,0,0) 4px
    );
    background-size: 100% 4px;
    pointer-events: none;
    z-index: 9995;
    mix-blend-mode: overlay;
    animation: fcr-neonbleu-scanline-drift 8s linear infinite;
}
@keyframes fcr-neonbleu-scanline-drift {
    0%   { background-position: 0 0; }
    100% { background-position: 0 40px; }
}
/* ================= SCROLLBAR NÉON =================
   Ascenseur fin avec tube cyan lumineux, plus intense au survol. */
::-webkit-scrollbar { width: 12px; height: 12px; }
::-webkit-scrollbar-track { background: #05040d; }
::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, #21e6ff, #1177a3);
    border-radius: 6px;
    border: 2px solid #05040d;
    box-shadow: 0 0 6px #21e6ffaa, 0 0 14px #21e6ff55;
}
::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(180deg, #7afcff, #21e6ff);
    box-shadow: 0 0 10px #21e6ffdd, 0 0 20px #ff2ea655;
}
::-webkit-scrollbar-corner { background: #05040d; }
/* Firefox */
* { scrollbar-color: #21e6ff #05040d; scrollbar-width: thin; }
/* ================= SÉLECTION DE TEXTE =================
   Surlignage cyan translucide au lieu du bleu par défaut du navigateur. */
::selection {
    background: rgba(33,230,255,0.35);
    color: #eafcff;
    text-shadow: 0 0 6px #21e6ff;
}
::-moz-selection {
    background: rgba(33,230,255,0.35);
    color: #eafcff;
    text-shadow: 0 0 6px #21e6ff;
}
/* ================= FOCUS DES CHAMPS =================
   Halo cyan net au focus clavier/souris sur inputs, textarea, select. */
input:focus, textarea:focus, select:focus {
    outline: none !important;
    border-color: #21e6ff !important;
    box-shadow: 0 0 6px #21e6ffaa, 0 0 14px #21e6ff55, inset 0 0 6px #21e6ff22 !important;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
/* ================= SURVOL DES LIGNES DE TABLEAU =================
   Léger glow cyan sur la ligne survolée pour un meilleur feedback visuel. */
table tr:hover td, table tr:hover th {
    background: rgba(33,230,255,0.06) !important;
    box-shadow: inset 0 0 8px rgba(33,230,255,0.15);
    transition: background 0.15s ease;
}
/* ================= GLITCH AU SURVOL DU GROS TITRE =================
   Bref décalage chromatique cyan/magenta façon glitch cyberpunk quand on
   passe la souris sur le titre du panneau ou l'enseigne — reste discret
   (0.4s) pour ne pas fatiguer l'œil sur un outil de travail. */
#hazmat-fcr-header-title:hover, #fcr-theme-label:hover, #fcr-module-label:hover {
    animation: fcr-neonbleu-glitch 0.4s steps(2, end) !important;
}
@keyframes fcr-neonbleu-glitch {
    0%   { text-shadow:0 0 2px #eafcff,0 0 6px #eafcff,0 0 14px #21e6ff,0 0 26px #21e6ff; transform: translate(0,0); }
    20%  { text-shadow:-2px 0 #ff2ea6, 2px 0 #21e6ff, 0 0 14px #21e6ff; transform: translate(-1px,0); }
    40%  { text-shadow:2px 0 #ff2ea6, -2px 0 #21e6ff, 0 0 14px #21e6ff; transform: translate(1px,0); }
    60%  { text-shadow:-1px 0 #ff2ea6, 1px 0 #21e6ff, 0 0 14px #21e6ff; transform: translate(-1px,0); }
    80%  { text-shadow:1px 0 #ff2ea6, -1px 0 #21e6ff, 0 0 14px #21e6ff; transform: translate(1px,0); }
    100% { text-shadow:0 0 2px #eafcff,0 0 6px #eafcff,0 0 14px #21e6ff,0 0 26px #21e6ff; transform: translate(0,0); }
}
/* ================= BADGE DE STATUT LUMINEUX =================
   Petit voyant rond pulsant devant les gros titres, façon "système en
   ligne" d'un panneau de contrôle. Purement décoratif (pas lié à un état
   réel du script). */
#hazmat-fcr-header-title::before, #fcr-theme-label::before, #fcr-module-label::before {
    content: '';
    display: inline-block;
    width: 7px; height: 7px;
    margin-right: 6px;
    border-radius: 50%;
    background: #3dffb0;
    box-shadow: 0 0 4px #3dffb0, 0 0 10px #3dffb0aa, 0 0 18px #3dffb066;
    vertical-align: middle;
    animation: fcr-neonbleu-status-pulse 2.4s ease-in-out infinite;
}
@keyframes fcr-neonbleu-status-pulse {
    0%, 100% { opacity: 1;    transform: scale(1); }
    50%      { opacity: 0.55; transform: scale(0.82); }
}
/* ================= ICÔNES EN NÉON =================
   Halo cyan/magenta sur les boutons (englobe tout leur contenu, y compris
   les glyphes/emoji utilisés comme icônes), plus intense au survol. */
#manualAsinProfilerButton, #rnoSizeProfilerButton,
#hazmatLevelButton, #weightButton, #csvExportButton,
#csvHistoryButton, .LoadPrep-button, .fcr-print-btn,
.fcr-theme-btn, #fcr-freeprint-print, .barcode-close {
    filter: drop-shadow(0 0 3px #21e6ffaa) drop-shadow(0 0 7px #21e6ff55);
    transition: filter 0.2s ease;
}
#manualAsinProfilerButton:hover, #rnoSizeProfilerButton:hover,
#hazmatLevelButton:hover, #weightButton:hover, #csvExportButton:hover,
#csvHistoryButton:hover, .LoadPrep-button:hover, .fcr-print-btn:hover,
.fcr-theme-btn:hover, #fcr-freeprint-print:hover, .barcode-close:hover {
    filter: drop-shadow(0 0 5px #21e6ffdd) drop-shadow(0 0 12px #ff2ea688);
}
/* Même halo néon sur les FAB (pastilles rondes Problems/Edit/Move/Étiquettes)
   et sur leur petite pastille de verrouillage. */
.fcr-fab-draggable {
    filter: drop-shadow(0 0 4px #21e6ffcc) drop-shadow(0 0 10px rgba(33,230,255,0.6));
}
.fcr-fab-draggable:hover {
    filter: drop-shadow(0 0 6px #21e6ffee) drop-shadow(0 0 16px rgba(255,46,166,0.55));
}
.fcr-fab-lock {
    box-shadow: 0 0 4px #21e6ffaa, 0 0 8px rgba(33,230,255,0.6);
    border-color: #21e6ff88 !important;
}
/* ================= HORLOGE LED CYAN =================
   Petit afficheur façon LED, coin haut-droit (sous la barre d'en-tête),
   discret et non cliquable, qui montre l'heure en direct — deux-points
   clignotants + halo néon multicouche façon enseigne. */
#fcr-neonbleu-clock {
    position: fixed;
    top: 42px;
    right: 10px;
    z-index: 9992;
    padding: 4px 16px;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 2px;
    color: #ffffff;
    background: rgba(5,4,13,0.62);
    border: 1px solid rgba(120,245,255,0.85);
    border-radius: 4px;
    text-shadow:
        0 0 2px #ffffff, 0 0 5px #ffffff, 0 0 9px #baf6ff,
        0 0 16px #21e6ff, 0 0 30px #21e6ff, 0 0 48px rgba(33,230,255,0.8),
        0 0 64px rgba(255,46,166,0.35);
    box-shadow:
        0 0 6px rgba(255,255,255,0.6), 0 0 14px rgba(33,230,255,0.8),
        0 0 26px rgba(33,230,255,0.5), 0 0 42px rgba(255,46,166,0.25),
        inset 0 0 8px rgba(120,245,255,0.3);
    pointer-events: none;
    user-select: none;
    animation:
        fcr-neonbleu-clock-breathe 3s ease-in-out infinite,
        fcr-neonbleu-sign 6s infinite;
}
@keyframes fcr-neonbleu-clock-breathe {
    0%, 100% {
        box-shadow: 0 0 6px rgba(255,255,255,0.6), 0 0 14px rgba(33,230,255,0.8), 0 0 26px rgba(33,230,255,0.5), 0 0 42px rgba(255,46,166,0.25), inset 0 0 8px rgba(120,245,255,0.3);
        border-color: rgba(120,245,255,0.85);
    }
    50% {
        box-shadow: 0 0 10px rgba(255,255,255,0.85), 0 0 22px rgba(33,230,255,1), 0 0 40px rgba(255,46,166,0.5), 0 0 60px rgba(33,230,255,0.4), inset 0 0 10px rgba(120,245,255,0.45);
        border-color: rgba(255,46,166,0.7);
    }
}
#fcr-neonbleu-clock .fcr-clock-colon {
    animation: fcr-neonbleu-clock-blink 1s steps(1) infinite;
}
@keyframes fcr-neonbleu-clock-blink {
    0%, 49%  { opacity: 1; }
    50%, 100% { opacity: 0.25; }
}`
        },
    };

    let currentTheme = GM_getValue('colorTheme', 'base');

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

    function hexToRgba(hex, alpha) {
        if (!hex || hex[0] !== '#') return hex;
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // ════════════════════════════════════════════════════════════════
    //  FAB DÉPLAÇABLES (Problems, Edit Item, Move Item, Étiquettes)
    // ════════════════════════════════════════════════════════════════
    // Chaque FAB garde sa position actuelle (bottom/right codés en dur
    // dans le script) comme emplacement PAR DÉFAUT. On peut ensuite le
    // faire glisser n'importe où à l'écran ; sa nouvelle position est
    // mémorisée (par FAB) et restaurée aux prochains chargements. Un
    // simple clic (sans déplacement) continue d'ouvrir/fermer son panneau.
    function makeFcrFabDraggable(fab, storageKey) {
        fab.classList.add('fcr-fab-draggable');
        fab.style.touchAction = 'none';

        // Position "initiale" telle que définie par le script (bottom/right
        // codés en dur), capturée AVANT toute position sauvegardée par
        // l'utilisateur — sert de référence pour le verrouillage/reset.
        const defaultPos = {
            top: fab.style.top || '',
            left: fab.style.left || '',
            bottom: fab.style.bottom || '',
            right: fab.style.right || '',
        };

        const isLocked = () => !!GM_getValue('fcrFabLocked_' + storageKey, false);

        function applyDefaultPosition() {
            fab.style.top = defaultPos.top;
            fab.style.left = defaultPos.left;
            fab.style.bottom = defaultPos.bottom;
            fab.style.right = defaultPos.right;
        }

        function applySavedOrDefaultPosition() {
            const saved = GM_getValue('fcrFabPos_' + storageKey, null);
            if (saved && typeof saved.top === 'number' && typeof saved.left === 'number') {
                fab.style.top = saved.top + 'px';
                fab.style.left = saved.left + 'px';
                fab.style.bottom = '';
                fab.style.right = '';
            } else {
                applyDefaultPosition();
            }
        }

        // ── Pastille de verrouillage (🔒 position fixe / 🔓 déplaçable) ──
        const lockBtn = document.createElement('div');
        lockBtn.className = 'fcr-fab-lock';
        function refreshLockUI() {
            const locked = isLocked();
            fab.classList.toggle('fcr-fab-locked', locked);
            lockBtn.textContent = locked ? '🔒' : '🔓';
            lockBtn.title = locked
                ? 'Position verrouillée en position initiale — cliquer pour autoriser le déplacement'
                : 'Position libre (déplaçable) — cliquer pour verrouiller en position initiale';
        }
        refreshLockUI();
        fab.appendChild(lockBtn);

        if (isLocked()) {
            applyDefaultPosition();
        } else {
            applySavedOrDefaultPosition();
        }

        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });
        lockBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
        lockBtn.addEventListener('pointerup', (e) => {
            e.stopPropagation();
            const nowLocked = !isLocked();
            GM_setValue('fcrFabLocked_' + storageKey, nowLocked);
            if (nowLocked) {
                GM_setValue('fcrFabPos_' + storageKey, null);
                applyDefaultPosition();
            }
            refreshLockUI();
        });

        let dragging = false, moved = false, startX = 0, startY = 0, startTop = 0, startLeft = 0;

        fab.addEventListener('pointerdown', (e) => {
            if (isLocked() || e.target.closest('.fcr-fab-lock')) return;
            if (e.button !== undefined && e.button !== 0) return;
            dragging = true;
            moved = false;
            const rect = fab.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY;
            startTop = rect.top; startLeft = rect.left;
            try { fab.setPointerCapture(e.pointerId); } catch (err) {}
        });

        fab.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) moved = true;
            if (!moved) return;
            const maxTop  = window.innerHeight - fab.offsetHeight - 4;
            const maxLeft = window.innerWidth  - fab.offsetWidth  - 4;
            const newTop  = Math.max(4, Math.min(startTop + dy, maxTop));
            const newLeft = Math.max(4, Math.min(startLeft + dx, maxLeft));
            fab.style.top = newTop + 'px';
            fab.style.left = newLeft + 'px';
            fab.style.bottom = '';
            fab.style.right = '';
        });

        function endDrag(e) {
            if (!dragging) return;
            dragging = false;
            if (moved) {
                const rect = fab.getBoundingClientRect();
                GM_setValue('fcrFabPos_' + storageKey, { top: rect.top, left: rect.left });
                fab._fcrJustDragged = true; // évite que le clic qui suit rouvre/ferme le panneau
            }
        }
        fab.addEventListener('pointerup', endDrag);
        fab.addEventListener('pointercancel', endDrag);
    }

    // Style général de la pastille de verrouillage des FAB — indépendant du
    // thème, toujours actif quel que soit le thème de couleur choisi.
    GM_addStyle(`
        .fcr-fab-lock {
            position: absolute;
            top: -4px;
            right: -4px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: rgba(20,20,20,0.9);
            border: 1px solid rgba(255,255,255,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 9px;
            line-height: 1;
            cursor: pointer;
            z-index: 3;
            user-select: none;
            touch-action: none;
        }
        .fcr-fab-draggable:not(.fcr-fab-locked) { cursor: grab; }
        .fcr-fab-draggable:not(.fcr-fab-locked):active { cursor: grabbing; }
        .fcr-fab-draggable.fcr-fab-locked { cursor: default; }
    `);

    // Un seul écouteur global, posé en phase de capture : il s'exécute avant
    // le handler "click" (toggle panneau) attaché sur chaque FAB, quel que
    // soit l'ordre d'attache, et avale le clic qui suit un vrai déplacement.
    document.addEventListener('click', (e) => {
        const fab = e.target.closest && e.target.closest('.fcr-fab-draggable');
        if (fab && fab._fcrJustDragged) {
            fab._fcrJustDragged = false;
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);


    // ════════════════════════════════════════════════════════════════
    //  ENSEIGNE NÉON DU LOGO "FCResearch ETZ2" — thème Néon Bleu
    // ════════════════════════════════════════════════════════════════
    // Le logo noir "FCResearch" (+ "ETZ2" en exposant) appartient à la
    // page d'origine, pas au script : sa structure exacte peut varier
    // d'un environnement à l'autre (FCResearch EU/NA, Sherlock, etc.).
    // Pour rester robuste, on tente d'abord un sélecteur connu, puis on
    // retombe sur une recherche par contenu texte limitée au coin
    // supérieur gauche de la page (là où vit toujours ce logo).
    //
    // Si l'auto-détection ne trouve rien sur votre page, ouvrez la
    // console (F12) : un message "[FCR Neon Logo] ..." indique l'échec.
    // Dans ce cas, faites un clic droit → Inspecter sur le logo noir,
    // et renseignez ici le sélecteur exact (id ou classe) pour le
    // forcer manuellement :
    const FCR_LOGO_SELECTOR = ''; // ex: '#fc-research-logo' — laissez vide pour l'auto-détection

    function findFcrLogoTarget() {
        if (FCR_LOGO_SELECTOR) {
            const forced = document.querySelector(FCR_LOGO_SELECTOR);
            if (forced) return forced;
            console.warn('[FCR Neon Logo] FCR_LOGO_SELECTOR défini mais introuvable sur cette page :', FCR_LOGO_SELECTOR);
        }

        const known = document.getElementById('fc-research-logo');
        if (known) return known;

        // Recherche par texte, restreinte au coin supérieur gauche (bandeau du haut)
        let best = null;
        const all = document.querySelectorAll('body *');
        for (const el of all) {
            if (el.id === 'fcr-neon-logo-sign' || el.closest('#fcr-neon-logo-sign')) continue;
            if (!el.textContent) continue;
            const txt = el.textContent.replace(/\s+/g, '');
            if (!/^FCResearch/i.test(txt)) continue;
            if (txt.length > 20) continue; // évite un conteneur trop large (toute la page, etc.)
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            if (rect.top > 140 || rect.left > 600) continue; // le logo vit en haut à gauche
            if (!best || el.children.length < best.children.length) best = el;
        }
        if (!best) console.warn('[FCR Neon Logo] Logo "FCResearch" introuvable automatiquement. Renseignez FCR_LOGO_SELECTOR dans le script.');
        return best;
    }

    function injectFcrNeonLogo() {
        let sign = document.getElementById('fcr-neon-logo-sign');
        const currentTarget = sign ? sign.parentElement : null;
        if (sign && currentTarget && currentTarget.isConnected) return; // déjà posée et toujours dans le DOM

        if (sign) sign.remove(); // l'ancien parent a disparu (re-render de page) : on nettoie

        const target = findFcrLogoTarget();
        if (!target) return;

        if (target.dataset.fcrNeonOrigPosition === undefined) {
            target.dataset.fcrNeonOrigPosition = target.style.position || '';
        }
        if (getComputedStyle(target).position === 'static') {
            target.style.position = 'relative';
        }
        if (target.dataset.fcrNeonOrigOverflow === undefined) {
            target.dataset.fcrNeonOrigOverflow = target.style.overflow || '';
        }
        target.style.overflow = 'visible';

        // On masque le texte d'origine (garde la place, garde un éventuel lien cliquable)
        target.style.setProperty('visibility', 'hidden', 'important');

        sign = document.createElement('div');
        sign.id = 'fcr-neon-logo-sign';
        sign.innerHTML =
            '<div class="fcr-neon-logo-frame">' +
                '<span class="fcr-neon-logo-main"><span class="fcr-neon-logo-fc">FC</span><span class="fcr-neon-logo-research">Research</span></span>' +
                '<span class="fcr-neon-logo-kana">エフシー・リサーチ</span>' +
            '</div>' +
            '<span class="fcr-neon-logo-tag">ETZ2</span>';
        target.appendChild(sign);
    }

    function removeFcrNeonLogo() {
        const sign = document.getElementById('fcr-neon-logo-sign');
        if (!sign) return;
        const target = sign.parentElement;
        sign.remove();
        if (!target) return;
        target.style.removeProperty('visibility');
        if (target.dataset.fcrNeonOrigPosition !== undefined) {
            target.style.position = target.dataset.fcrNeonOrigPosition;
            delete target.dataset.fcrNeonOrigPosition;
        }
        if (target.dataset.fcrNeonOrigOverflow !== undefined) {
            target.style.overflow = target.dataset.fcrNeonOrigOverflow;
            delete target.dataset.fcrNeonOrigOverflow;
        }
    }

    // ── Horloge LED cyan (barre du haut, entre "Search" et le login, thème Néon Bleu uniquement) ──
    function fcrFormatClockHTML(d) {
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getHours())}<span class="fcr-clock-colon">:</span>${pad(d.getMinutes())}<span class="fcr-clock-colon">:</span>${pad(d.getSeconds())}`;
    }
    // Repère dynamiquement le bouton "Search" et le login employé affichés
    // dans la barre de navigation tout en haut de la page, puis recentre
    // l'horloge pile entre les deux. Si l'un des deux repères est introuvable
    // (page pas encore chargée, changement de layout…), on retombe sur un
    // positionnement par défaut en haut-droit.
    function fcrLocateHeaderLandmarks() {
        const login = (typeof getCookie === 'function' ? getCookie('fcmenu-employeeLogin') : '') || '';
        const candidates = Array.from(document.querySelectorAll('a, button, span, div, input[type="submit"]'))
            .filter(el => el.offsetParent !== null);

        const searchEl = candidates.find(el => {
            const txt = (el.value || el.textContent || '').trim().toLowerCase();
            if (txt !== 'search') return false;
            const r = el.getBoundingClientRect();
            return r.top >= 0 && r.top < 90 && r.width > 0;
        });

        let userEl = null;
        if (login) {
            userEl = candidates.find(el => {
                if (el.children.length > 0) return false;
                const txt = (el.textContent || '').trim().toLowerCase();
                if (txt !== login.toLowerCase()) return false;
                const r = el.getBoundingClientRect();
                return r.top >= 0 && r.top < 90 && r.width > 0;
            });
        }
        return { searchEl, userEl };
    }
    function fcrPositionNeonClock(clock) {
        try {
            const { searchEl, userEl } = fcrLocateHeaderLandmarks();
            if (searchEl && userEl) {
                const sRect = searchEl.getBoundingClientRect();
                const uRect = userEl.getBoundingClientRect();
                const gapLeft = sRect.right;
                const gapRight = uRect.left;
                if (gapRight - gapLeft > 40) {
                    const centerY = Math.min(sRect.top, uRect.top) + Math.max(sRect.height, uRect.height) / 2;
                    clock.style.position = 'fixed';
                    clock.style.left = Math.round(gapLeft + (gapRight - gapLeft) / 2) + 'px';
                    clock.style.top = Math.round(centerY) + 'px';
                    clock.style.right = 'auto';
                    clock.style.transform = 'translate(-50%, -50%)';
                    return;
                }
            }
        } catch (e) { /* on retombe sur le défaut ci-dessous */ }
        // Défaut : coin haut-droit, sous la barre d'en-tête.
        clock.style.position = 'fixed';
        clock.style.top = '42px';
        clock.style.right = '10px';
        clock.style.left = 'auto';
        clock.style.transform = 'none';
    }
    function injectFcrNeonClock() {
        let clock = document.getElementById('fcr-neonbleu-clock');
        if (clock) { fcrPositionNeonClock(clock); return; }
        clock = document.createElement('div');
        clock.id = 'fcr-neonbleu-clock';
        clock.innerHTML = fcrFormatClockHTML(new Date());
        document.body.appendChild(clock);
        fcrPositionNeonClock(clock);
        clock._fcrInterval = setInterval(() => {
            clock.innerHTML = fcrFormatClockHTML(new Date());
        }, 1000);
        clock._fcrResizeHandler = () => fcrPositionNeonClock(clock);
        window.addEventListener('resize', clock._fcrResizeHandler);
    }
    function removeFcrNeonClock() {
        const clock = document.getElementById('fcr-neonbleu-clock');
        if (!clock) return;
        if (clock._fcrInterval) clearInterval(clock._fcrInterval);
        if (clock._fcrResizeHandler) window.removeEventListener('resize', clock._fcrResizeHandler);
        clock.remove();
    }

    // Auto-réparation légère : si la page re-rend son bandeau (SPA), on
    // repose l'enseigne et les effets tant que le thème Néon Bleu est actif,
    // et on recale l'horloge au cas où le header aurait bougé.
    setInterval(() => {
        if (currentTheme === 'neonbleu') {
            injectFcrNeonLogo();
            injectFcrNeonClock();
            const clock = document.getElementById('fcr-neonbleu-clock');
            if (clock) fcrPositionNeonClock(clock);
        }
    }, 2000);

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
            #fcr-theme-header { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; cursor:pointer; border-bottom:1px solid #ccc; user-select:none; transition:background 0.2s; }
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
            #fcr-theme-btn-aurora { background:${THEMES.aurora.gradBtn}; color:#eafff5; border-color:${THEMES.aurora.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
            #fcr-theme-btn-magma  { background:${THEMES.magma.gradBtn}; color:#fff0e8; border-color:${THEMES.magma.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
            #fcr-theme-btn-nebula { background:${THEMES.nebula.gradBtn}; color:#f6ecff; border-color:${THEMES.nebula.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
            #fcr-theme-btn-glacier { background:${THEMES.glacier.gradBtn}; color:#e0faff; border-color:${THEMES.glacier.accent}; text-shadow:0 1px 4px rgba(0,200,255,0.5); box-shadow:0 0 8px rgba(0,229,255,0.3); }
            #fcr-theme-btn-obsidian { background:${THEMES.obsidian.gradBtn}; color:#e8c97a; border-color:${THEMES.obsidian.accent}; text-shadow:0 1px 3px rgba(0,0,0,0.6); }
            #fcr-theme-btn-crimson  { background:${THEMES.crimson.gradBtn}; color:#ffaaaa; border-color:${THEMES.crimson.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
            #fcr-theme-btn-carbon   { background:${THEMES.carbon.gradBtn}; color:#80ffe8; border-color:${THEMES.carbon.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
            #fcr-theme-btn-ironblue { background:${THEMES.ironblue.gradBtn}; color:#b0d0ff; border-color:${THEMES.ironblue.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
            #fcr-theme-btn-sakura   { background:${THEMES.sakura.gradBtn}; color:#ffe4ec; border-color:${THEMES.sakura.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
        #fcr-theme-btn-void_theme { background:${THEMES.void_theme.gradBtn}; color:#00ff88; border-color:${THEMES.void_theme.accent}; text-shadow:0 0 6px #00ff88aa; }
            #fcr-theme-btn-phantominion { background:${THEMES.phantominion.gradBtn}; color:#e0aaff; border-color:${THEMES.phantominion.accent}; text-shadow:0 0 6px #c77dffaa; }
            #fcr-theme-btn-neonbleu { background:${THEMES.neonbleu.gradBtn}; color:#eafcff; border-color:${THEMES.neonbleu.accent}; text-shadow:0 0 4px #eafcffcc, 0 0 10px #ff2ea699; }
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
            /* Boutons impression God Mode — thème Base */
            .fcr-print-btn { padding:2px 7px; margin-left:5px; cursor:pointer; border:1px solid #999; border-radius:4px; background:#f0f0f0; color:#333; font-size:12px; transition:background 0.15s, border-color 0.15s; display:inline-block; vertical-align:middle; }
            .fcr-print-btn:hover { background:#e0e0e0; border-color:#666; }
            .fcr-print-btn:active { transform:scale(0.94); }
            /* Prep rows — thème Base */
            .prep-instructions-row td { background-color:#fff8e1 !important; color:#7a4f00 !important; border-left:4px solid #e67e22 !important; }
            .prep-instructions-row.prep-noprep td { background-color:#f0fff0 !important; color:#276621 !important; border-left:4px solid #27ae60 !important; }
            .prep-instructions-row.prep-unknown td { background-color:#fffde7 !important; color:#7a6000 !important; border-left:4px solid #f1c40f !important; }
            /* Sidebar scrollbar — thème Base */
            #side-bar { overflow-y: auto !important; overflow-x: hidden !important; max-height: calc(100vh - var(--fcr-sidebar-offset, 0px)) !important; position: sticky !important; top: var(--fcr-sidebar-offset, 0px) !important; }
            #side-bar::-webkit-scrollbar { width: 6px; }
            #side-bar::-webkit-scrollbar-track { background: #e0e0e0; border-radius: 3px; }
            #side-bar::-webkit-scrollbar-thumb { background: #999; border-radius: 3px; }
            #side-bar::-webkit-scrollbar-thumb:hover { background: #666; }
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
        /* Tables DataTables.js (Inventory / Inventory History) — non couvertes par
           table.a-bordered car DataTables génère son propre markup (dataTable,
           dataTables_scrollHead/Body, dataTables_wrapper) au lieu du composant AUI. */
        table.dataTable                     { background: transparent; border-collapse: collapse !important; }
        table.dataTable tbody tr.odd        { background-color: ${t.bg2} !important; }
        table.dataTable tbody tr.even       { background-color: ${t.bg1} !important; }
        table.dataTable tbody td            { color: #d1d5db !important; border-bottom: 1px solid ${t.accentDark}; }
        table.dataTable thead th,
        .dataTables_scrollHead thead th     { background: ${t.bg3} !important; color: ${t.accent} !important; border-color: ${t.accentDark} !important; }
        .dataTables_wrapper                 { color: #d1d5db; }
        .dataTables_wrapper .dataTables_info,
        .dataTables_wrapper .dataTables_length,
        .dataTables_wrapper .dataTables_filter,
        .dataTables_wrapper .dataTables_paginate { color: #d1d5db !important; }
        .dataTables_wrapper .dataTables_filter input,
        .dataTables_wrapper .dataTables_length select { background: ${t.bg1} !important; color: #d1d5db !important; border: 1px solid ${t.accentDark} !important; }
        .dataTables_wrapper .dataTables_paginate .paginate_button {
            color: ${t.accent} !important; border: 1px solid transparent;
        }
        .dataTables_wrapper .dataTables_paginate .paginate_button.current {
            background: ${t.isGradient ? t.gradBtn : t.bg3} !important; color: ${t.accent} !important; border-color: ${t.accentDark} !important;
        }
        .dataTables_wrapper .dataTables_paginate .paginate_button:hover {
            background: ${t.bg3} !important; color: ${t.accent} !important; border-color: ${t.accentDark} !important;
        }
        .dataTables_wrapper .dataTables_paginate .paginate_button.disabled { opacity: 0.4; }
        .dataTables_scrollBody::-webkit-scrollbar, .dataTables_scrollHead::-webkit-scrollbar { height: 8px; width: 6px; }
        .dataTables_scrollBody::-webkit-scrollbar-track { background: ${t.bg2}; }
        .dataTables_scrollBody::-webkit-scrollbar-thumb { background: ${t.accentDark}; border-radius: 3px; }
        .dataTables_scrollBody::-webkit-scrollbar-thumb:hover { background: ${t.accent}; }
        table.a-keyvalue td, table.a-keyvalue th { border-top: 1px solid ${t.accentDark}; }
        table.a-keyvalue                    { border-bottom: 1px solid ${t.accentDark}; }
        .a-keyvalue th                      { background-color: ${t.bg3} !important; color: ${t.accent} !important; }
        .a-box, .a-cal-na, #fcrp_cfg, table.a-keyvalue th { background-color: ${t.bg2}; border: 1px ${t.accentDark} solid; color: #d1d5db; }
        .a-box                              { border-top-color: ${t.accent} !important; }
        .a-box-title .a-box-inner, .a-popover-header, .aui-nav-row { color: ${t.accent}; background: ${t.bg2}; background: ${t.isGradient ? t.gradHeader : `linear-gradient(to bottom, ${t.bg3}, ${t.bg1})`}; }
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
        #fcr-theme-header { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; border-bottom:1px solid ${t.accentDark}; user-select:none; cursor:pointer; transition:background 0.2s; }
        #fcr-theme-header:hover { background:${t.bg3}; }
        #fcr-theme-label { color:${t.accent}; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
        #fcr-theme-arrow { color:${t.accent}; font-size:9px; font-weight:700; }
        .fcr-theme-section-header { display:flex; align-items:center; justify-content:space-between; padding:5px 10px; cursor:pointer; border-bottom:1px solid ${t.accentDark}44; user-select:none; transition:background 0.2s; }
        .fcr-theme-section-header:hover { background:${t.bg3}; }
        .fcr-theme-section-header span:first-child { color:${t.accent}; font-size:10px; font-weight:700; opacity:0.8; }
        .fcr-theme-section-header span:last-child { color:${t.accent}; font-size:9px; font-weight:700; }
        #fcr-theme-panel .fcr-theme-btn { display:inline-block; margin:2px 3px 2px 0; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; cursor:pointer; border:1px solid; transition:0.2s; white-space:nowrap; }
        #fcr-theme-panel .fcr-theme-btn.active { opacity:1; box-shadow:0 0 6px currentColor; transform:scale(1.08); }
        #fcr-theme-panel .fcr-theme-btn:not(.active) { opacity:0.5; }
        #fcr-theme-panel .fcr-theme-btn:not(.active):hover { opacity:0.85; }
        #fcr-theme-btn-base   { background:#e8e8e8; color:#333; border-color:#999; }
        #fcr-theme-btn-bleu   { background:#1c2b5a; color:#cfb53b; border-color:#cfb53b; }
        #fcr-theme-btn-rouge  { background:#4a1010; color:#e07b3b; border-color:#e07b3b; }
        #fcr-theme-btn-vert   { background:#104a1e; color:#4ecb71; border-color:#4ecb71; }
        #fcr-theme-btn-aurora { background:${THEMES.aurora.gradBtn}; color:#eafff5; border-color:${THEMES.aurora.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        #fcr-theme-btn-magma  { background:${THEMES.magma.gradBtn}; color:#fff0e8; border-color:${THEMES.magma.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        #fcr-theme-btn-nebula { background:${THEMES.nebula.gradBtn}; color:#f6ecff; border-color:${THEMES.nebula.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.4); }
        #fcr-theme-btn-glacier { background:${THEMES.glacier.gradBtn}; color:#e0faff; border-color:${THEMES.glacier.accent}; text-shadow:0 1px 4px rgba(0,200,255,0.5); box-shadow:0 0 8px rgba(0,229,255,0.3); }
        #fcr-theme-btn-obsidian { background:${THEMES.obsidian.gradBtn}; color:#e8c97a; border-color:${THEMES.obsidian.accent}; text-shadow:0 1px 3px rgba(0,0,0,0.6); }
        #fcr-theme-btn-crimson  { background:${THEMES.crimson.gradBtn}; color:#ffaaaa; border-color:${THEMES.crimson.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
        #fcr-theme-btn-carbon   { background:${THEMES.carbon.gradBtn}; color:#80ffe8; border-color:${THEMES.carbon.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
        #fcr-theme-btn-ironblue { background:${THEMES.ironblue.gradBtn}; color:#b0d0ff; border-color:${THEMES.ironblue.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
        #fcr-theme-btn-sakura   { background:${THEMES.sakura.gradBtn}; color:#ffe4ec; border-color:${THEMES.sakura.accent}; text-shadow:0 1px 2px rgba(0,0,0,0.5); }
        #fcr-theme-btn-void_theme { background:${THEMES.void_theme.gradBtn}; color:#00ff88; border-color:${THEMES.void_theme.accent}; text-shadow:0 0 6px #00ff88aa; }
        #fcr-theme-btn-fred { background:${THEMES.fred.gradBtn}; color:#a8ff3e; border-color:${THEMES.fred.accent}; text-shadow:0 0 6px #a8ff3eaa; }
        #fcr-theme-btn-blizzard { background:${THEMES.blizzard.gradBtn}; color:#a8e4ff; border-color:${THEMES.blizzard.accent}; text-shadow:0 0 6px #a8e4ffaa; }
        #fcr-theme-btn-ophe { background:${THEMES.ophe.gradBtn}; color:#f9a8d4; border-color:${THEMES.ophe.accent}; text-shadow:0 0 6px #f9a8d4aa; }
        #fcr-theme-btn-safari { background:${THEMES.safari.gradBtn}; color:#ffbb44; border-color:${THEMES.safari.accent}; text-shadow:0 0 6px #ffbb44aa; }
        #fcr-theme-btn-phantominion { background:${THEMES.phantominion.gradBtn}; color:#e0aaff; border-color:${THEMES.phantominion.accent}; text-shadow:0 0 6px #c77dffaa; }
        #fcr-theme-btn-neonbleu { background:${THEMES.neonbleu.gradBtn}; color:#eafcff; border-color:${THEMES.neonbleu.accent}; text-shadow:0 0 4px #eafcffcc, 0 0 10px #ff2ea699; }
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
        /* Boutons impression God Mode — suit le thème actif */
        .fcr-print-btn {
            padding:2px 7px; margin-left:5px; cursor:pointer;
            border:1px solid ${t.accentDark}; border-radius:4px;
            background:${t.isGradient ? t.gradBtn : t.bg3};
            color:${t.accent}; font-size:12px;
            transition:background 0.15s, border-color 0.15s, color 0.15s;
            display:inline-block; vertical-align:middle;
        }
        .fcr-print-btn:hover {
            background:${t.isGradient ? t.gradAccent : t.accent};
            color:${t.bg1}; border-color:${t.accent};
            box-shadow:0 0 6px ${t.accent}66;
        }
        .fcr-print-btn:active { transform:scale(0.94); }
        /* Prep rows dans processPurchaseOrderItems — suit le thème */
        .prep-instructions-row td {
            background-color:${t.prepBg} !important;
            border-left:4px solid ${t.prepYes} !important;
            font-weight:bold;
        }
        .prep-instructions-row.prep-yes td  { color:${t.prepYes} !important; border-left-color:${t.prepYes} !important; }
        .prep-instructions-row.prep-noprep td { color:${t.prepNoPrep} !important; border-left-color:${t.prepNoPrep} !important; }
        .prep-instructions-row.prep-unknown td { color:#f1c40f !important; border-left-color:#f1c40f !important; background-color:${t.bg3} !important; }
        /* Sidebar scrollbar — suit le thème */
        #side-bar { overflow-y: auto !important; overflow-x: hidden !important; max-height: calc(100vh - var(--fcr-sidebar-offset, 0px)) !important; position: sticky !important; top: var(--fcr-sidebar-offset, 0px) !important; }
        #side-bar::-webkit-scrollbar { width: 6px; }
        #side-bar::-webkit-scrollbar-track { background: ${t.bg2}; border-radius: 3px; }
        #side-bar::-webkit-scrollbar-thumb { background: ${t.accentDark}; border-radius: 3px; }
        #side-bar::-webkit-scrollbar-thumb:hover { background: ${t.accent}; box-shadow: 0 0 6px ${t.accent}88; }
        ${t.isAnimated ? `
        /* Transparence pour laisser apparaître la photo de fond (image produit non affectée) */
        table.a-bordered tr:nth-child(2n+1) { background-color: ${hexToRgba(t.bg2, 0.38)} !important; }
        table.a-bordered tr:nth-child(2n)   { background-color: ${hexToRgba(t.bg1, 0.28)} !important; }
        table.a-bordered tr.odd td          { background-color: ${hexToRgba(t.bg2, 0.38)} !important; }
        table.a-bordered tr.even td         { background-color: ${hexToRgba(t.bg1, 0.28)} !important; }
        table.a-bordered tr:first-child th  { background: ${hexToRgba(t.bg3, 0.55)} !important; }
        table.a-bordered                    { background: transparent !important; }
        /* Idem pour les tables DataTables.js (Inventory / Inventory History) */
        table.dataTable tbody tr.odd        { background-color: ${hexToRgba(t.bg2, 0.38)} !important; }
        table.dataTable tbody tr.even       { background-color: ${hexToRgba(t.bg1, 0.28)} !important; }
        table.dataTable thead th,
        .dataTables_scrollHead thead th     { background: ${hexToRgba(t.bg3, 0.55)} !important; }
        table.dataTable                     { background: transparent !important; }
        .dataTables_wrapper .dataTables_paginate .paginate_button.current {
            background: ${hexToRgba(t.bg3, 0.55)} !important;
        }
        .a-box, .a-cal-na, #fcrp_cfg, table.a-keyvalue th { background-color: ${hexToRgba(t.bg2, 0.42)} !important; }
        .a-keyvalue th                      { background-color: ${hexToRgba(t.bg3, 0.5)} !important; }
        .a-box-title .a-box-inner, .a-popover-header, .aui-nav-row {
            background: ${hexToRgba(t.bg3, 0.45)} !important;
            backdrop-filter: blur(3px);
        }
        .a-section, .a-spacing-base, .a-row, #a-page, .a-container,
        #dpx-product-detail, .product-info-container {
            background: transparent !important;
        }
        ` : ''}
        ${t.isAnimated && t.animCSS ? t.animCSS : ''}
        ${(FCR_IS_EDITITEMS_PAGE || FCR_IS_MOVEITEMS_PAGE) ? `
        /* EditItemsApp / MoveItemsApp uniquement : enlève la transparence des zones de saisie et boutons cliquables */
        input, select, textarea, button, [role="button"],
        [class*="button" i], [class*="btn" i], [class*="clickable" i],
        div[onclick], div[tabindex], a[role], [aria-pressed], [aria-selected] {
            background-color: ${t.bg2} !important;
            color: #f3f5fa !important;
        }
        input::placeholder, textarea::placeholder { color: #9aa3b5 !important; opacity: 1 !important; }
        /* EditItemsApp uniquement : couleur d'écriture lisible quel que soit le thème.
           Texte clair + léger contour sombre pour rester lisible même sur les zones
           plus claires d'une photo de fond, sans toucher aux fonds/panneaux eux-mêmes. */
        body, body *:not(input):not(select):not(textarea):not(button):not(svg):not(path):not(img) {
            color: #f5f7fb !important;
            text-shadow: 0 1px 2px rgba(0,0,0,0.75);
        }
        ` : ''}
        `;
        }

        document.querySelectorAll('.fcr-theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === themeName);
        });

        // Nettoie l'ancien élément séparé d'animation s'il existe (legacy)
        const oldAnimEl = document.getElementById('fcr-anim-style');
        if (oldAnimEl) oldAnimEl.remove();

        // Les prep rows dans les tables PO sont stylées via classes CSS (.prep-yes/.prep-noprep/.prep-unknown)
        // et suivent automatiquement le thème via les règles injectées dans applyTheme().
        // Les prep rows dans nopoPrepInstructions (a-keyvalue) restent gérées par inline style dans nopoPrepInstructions().

        const hazmatPanel = document.getElementById('hazmat-fcr-panel');
        if (hazmatPanel) injectHazmatPanel_restyle(t);

        // Restyle du panneau étiquettes si présent
        const etiqPanel = document.getElementById('etiq2-panel');
        if (etiqPanel) etiq2_restyle(t);

        // Restyle du widget Problem si présent
        if (typeof window._fcrProblemRestyle === 'function') window._fcrProblemRestyle();

        // Restyle du badge Prix Amazon.fr si présent
        if (typeof window._fcrAmzFrPriceBadgeRestyle === 'function') window._fcrAmzFrPriceBadgeRestyle();

        // ── Dinos supplémentaires FRED ──────────────────────────────
        document.querySelectorAll('.fcr-fred-dino').forEach(el => el.remove());
        if (themeName === 'fred') {
            const ptero = document.createElement('div');
            ptero.className = 'fcr-fred-dino';
            ptero.textContent = '🦅';
            ptero.style.cssText = 'top:60px; left:0; font-size:26px; animation: fcr-fred-fly 38s linear 2s infinite;';
            document.body.appendChild(ptero);
        }




        // ── Flocons BLIZZARD ─────────────────────────────────────────
        document.querySelectorAll('.fcr-bliz-flake').forEach(el => el.remove());
        if (themeName === 'blizzard') {
            const flakeData = [
                { left:'30%', size:14, delay:'2s', dur:'10s', anim:'fcr-bliz-snow2' },
                { left:'55%', size:10, delay:'5s', dur:'7s',  anim:'fcr-bliz-snow3' },
                { left:'75%', size:16, delay:'0s', dur:'9s',  anim:'fcr-bliz-snow'  },
                { left:'88%', size:10, delay:'3s', dur:'12s', anim:'fcr-bliz-snow2' },
            ];
            flakeData.forEach(f => {
                const el = document.createElement('div');
                el.className = 'fcr-bliz-flake';
                el.textContent = '❄️';
                el.style.cssText = `top:-30px; left:${f.left}; font-size:${f.size}px; animation: ${f.anim} ${f.dur} linear ${f.delay} infinite;`;
                document.body.appendChild(el);
            });
        }


        // ── Animaux SAFARI ───────────────────────────────────────────
        document.querySelectorAll('.fcr-saf-animal').forEach(el => el.remove());
        if (themeName === 'safari') {
            const eagle = document.createElement('div');
            eagle.className = 'fcr-saf-animal';
            eagle.textContent = '🦅';
            eagle.style.cssText = 'top:15%; left:0; font-size:26px; z-index:9997; animation: fcr-saf-fly 16s linear 2s infinite; filter: drop-shadow(0 0 6px #ffbb4488);';
            document.body.appendChild(eagle);

            const elephant = document.createElement('div');
            elephant.className = 'fcr-saf-animal';
            elephant.textContent = '🐘';
            elephant.style.cssText = 'bottom:2px; left:0; font-size:38px; z-index:9995; opacity:0.3; animation: fcr-saf-walk 28s linear 10s infinite;';
            document.body.appendChild(elephant);

            const zebra = document.createElement('div');
            zebra.className = 'fcr-saf-animal';
            zebra.textContent = '🦓';
            zebra.style.cssText = 'bottom:2px; left:0; font-size:22px; z-index:9996; opacity:0.75; animation: fcr-saf-walk2 9s linear 3s infinite; filter: drop-shadow(0 0 4px #ffbb4466);';
            document.body.appendChild(zebra);
        }

        // ── Fantômes PHANTOMINION ────────────────────────────────────
        document.querySelectorAll('.fcr-phan-ghost, .fcr-phan-orb').forEach(el => el.remove());
        if (themeName === 'phantominion') {
            const PHAN_IMG = 'https://www.pokemon.com/static-assets/content-assets/cms2/img/pokedex/full/092.png';

            function makePhan(cssText) {
                const div = document.createElement('div');
                div.className = 'fcr-phan-ghost';
                const img = document.createElement('img');
                img.src = PHAN_IMG;
                img.alt = 'Fantominus';
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
                div.appendChild(img);
                div.style.cssText = cssText;
                document.body.appendChild(div);
            }

            // Fantominus principal — traverse l'écran lentement
            makePhan('bottom:50px;left:0;width:90px;height:90px;animation:fcr-phan-float 18s linear infinite;filter:drop-shadow(0 0 14px #c77dffcc);');
            // Fantominus secondaire — plus haut, plus petit, délai décalé
            makePhan('bottom:160px;left:0;width:55px;height:55px;animation:fcr-phan-float2 27s linear 7s infinite;opacity:0.7;filter:drop-shadow(0 0 9px #9b59b6bb);');
            // Petit Fantominus fixe — flotte dans le coin haut droit
            makePhan('top:72px;right:18px;width:38px;height:38px;animation:fcr-phan-bob 5s ease-in-out 1s infinite;opacity:0.5;filter:drop-shadow(0 0 8px #e0aaff99);z-index:9996;');

            // Orbes violettes en arrière-plan
            const orb1 = document.createElement('div');
            orb1.className = 'fcr-phan-orb';
            orb1.style.cssText = 'width:260px;height:260px;background:radial-gradient(circle,#c77dff 0%,transparent 70%);top:5%;left:5%;z-index:9989;animation:fcr-phan-orb-float 9s ease-in-out infinite;';
            document.body.appendChild(orb1);

            const orb2 = document.createElement('div');
            orb2.className = 'fcr-phan-orb';
            orb2.style.cssText = 'width:200px;height:200px;background:radial-gradient(circle,#ffd700 0%,transparent 70%);bottom:10%;right:8%;z-index:9989;animation:fcr-phan-orb-float2 12s ease-in-out 3s infinite;';
            document.body.appendChild(orb2);

            const orb3 = document.createElement('div');
            orb3.className = 'fcr-phan-orb';
            orb3.style.cssText = 'width:150px;height:150px;background:radial-gradient(circle,#9b59b6 0%,transparent 70%);top:45%;right:25%;z-index:9989;animation:fcr-phan-orb-float 15s ease-in-out 7s infinite;';
            document.body.appendChild(orb3);
        }

        // ── Pétales OPHÉ ─────────────────────────────────────────────
        document.querySelectorAll('.fcr-ophe-petal').forEach(el => el.remove());
        if (themeName === 'ophe') {
            const petalData = [
                { left:'22%', size:12, delay:'0s',  dur:'9s',  sway:'3s' },
                { left:'40%', size: 9, delay:'2s',  dur:'7s',  sway:'4s' },
                { left:'58%', size:14, delay:'5s',  dur:'10s', sway:'3.5s' },
                { left:'78%', size:10, delay:'1.5s',dur:'8s',  sway:'4.5s' },
                { left:'90%', size: 8, delay:'3.5s',dur:'11s', sway:'3s' },
            ];
            petalData.forEach(p => {
                const el = document.createElement('div');
                el.className = 'fcr-ophe-petal';
                el.textContent = '🌸';
                el.style.cssText = `top:-60px; left:${p.left}; font-size:${p.size}px; animation: fcr-ophe-fall ${p.dur} linear ${p.delay} infinite, fcr-ophe-sway ${p.sway} ease-in-out ${p.delay} infinite; filter: drop-shadow(0 0 3px #f9a8d488);`;
                document.body.appendChild(el);
            });

            const butterfly = document.createElement('div');
            butterfly.className = 'fcr-ophe-petal';
            butterfly.textContent = '🦋';
            butterfly.style.cssText = 'top:30%; left:15%; font-size:22px; z-index:9997; animation: fcr-ophe-float 4s ease-in-out infinite; filter: drop-shadow(0 0 6px #f9a8d499); opacity:0.8;';
            document.body.appendChild(butterfly);

            const butterfly2 = document.createElement('div');
            butterfly2.className = 'fcr-ophe-petal';
            butterfly2.textContent = '🦋';
            butterfly2.style.cssText = 'top:65%; left:75%; font-size:16px; z-index:9996; animation: fcr-ophe-float 5.5s ease-in-out 2s infinite; filter: drop-shadow(0 0 4px #fcd5e888); opacity:0.65;';
            document.body.appendChild(butterfly2);
        }

        // ── Enseigne néon et horloge LED (thème NÉON BLEU uniquement) ──
        if (themeName === 'neonbleu') {
            injectFcrNeonLogo();
            injectFcrNeonClock();
        } else {
            removeFcrNeonLogo();
            removeFcrNeonClock();
        }
    }

    applyTheme(currentTheme);
    fcrUpdatePerfModeStyle();

    function injectThemePanel() {
        const sidebar = document.querySelector('#side-bar') || document.querySelector('.sidebar') || document.querySelector('[id*="side"]');
        if (!sidebar || document.getElementById('fcr-theme-panel')) return;

        const isMasterOpen  = GM_getValue('themePanelMasterOpen', true);
        const isStaticOpen  = GM_getValue('themePanelStaticOpen', true);
        const isAnimOpen    = GM_getValue('themePanelAnimOpen', true);

        const staticKeys = Object.keys(THEMES).filter(k => !THEMES[k].isAnimated);
        const animKeys   = Object.keys(THEMES).filter(k =>  THEMES[k].isAnimated);

        const panel = document.createElement('div');
        panel.id = 'fcr-theme-panel';

        panel.innerHTML = `
            <div id="fcr-theme-header" style="cursor:pointer;">
                <span id="fcr-theme-label">🎨 THÈME COULEUR</span>
                <span id="fcr-theme-arrow">${isMasterOpen ? '▲' : '▼'}</span>
            </div>
            <div id="fcr-theme-content" style="display:${isMasterOpen ? 'block' : 'none'};">
                <div id="fcr-theme-static-section">
                    <div id="fcr-theme-static-header" class="fcr-theme-section-header">
                        <span>⬛ Statiques</span>
                        <span id="fcr-theme-static-arrow">${isStaticOpen ? '▲' : '▼'}</span>
                    </div>
                    <div id="fcr-theme-static-body" style="display:${isStaticOpen ? 'block' : 'none'}; padding:5px 8px 6px 8px;">
                        ${staticKeys.map(k => `<span class="fcr-theme-btn${currentTheme===k?' active':''}" id="fcr-theme-btn-${k}" data-theme="${k}">${THEMES[k].label}</span>`).join('\n                        ')}
                    </div>
                </div>
                <div id="fcr-theme-anim-section">
                    <div id="fcr-theme-anim-header" class="fcr-theme-section-header">
                        <span>✨ Animés</span>
                        <span id="fcr-theme-anim-arrow">${isAnimOpen ? '▲' : '▼'}</span>
                    </div>
                    <div id="fcr-theme-anim-body" style="display:${isAnimOpen ? 'block' : 'none'}; padding:5px 8px 6px 8px;">
                        ${animKeys.map(k => `<span class="fcr-theme-btn${currentTheme===k?' active':''}" id="fcr-theme-btn-${k}" data-theme="${k}">${THEMES[k].label}</span>`).join('\n                        ')}
                    </div>
                </div>
            </div>
        `;

        sidebar.insertBefore(panel, sidebar.firstChild);

        document.getElementById('fcr-theme-header').addEventListener('click', (e) => {
            e.stopPropagation();
            const content = document.getElementById('fcr-theme-content');
            const arrow   = document.getElementById('fcr-theme-arrow');
            const opening = content.style.display === 'none';
            content.style.display = opening ? 'block' : 'none';
            arrow.textContent = opening ? '▲' : '▼';
            GM_setValue('themePanelMasterOpen', opening);
        });

        document.getElementById('fcr-theme-static-header').addEventListener('click', (e) => {
            e.stopPropagation();
            const body  = document.getElementById('fcr-theme-static-body');
            const arrow = document.getElementById('fcr-theme-static-arrow');
            const opening = body.style.display === 'none';
            body.style.display = opening ? 'block' : 'none';
            arrow.textContent = opening ? '▲' : '▼';
            GM_setValue('themePanelStaticOpen', opening);
        });

        document.getElementById('fcr-theme-anim-header').addEventListener('click', (e) => {
            e.stopPropagation();
            const body  = document.getElementById('fcr-theme-anim-body');
            const arrow = document.getElementById('fcr-theme-anim-arrow');
            const opening = body.style.display === 'none';
            body.style.display = opening ? 'block' : 'none';
            arrow.textContent = opening ? '▲' : '▼';
            GM_setValue('themePanelAnimOpen', opening);
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
    // ===== PRIX AMAZON.FR =====
    // ════════════════════════════════════════════════════════════════
    // Cache + fetch hissés hors du "if" pour rester utilisables par d'autres
    // fonctionnalités (ex: Prix Total Inventaire) même si le badge par-produit
    // est désactivé — seul le fetch réel est gardé par isModuleEnabled().
    const amazonFrPriceCache = {};

    function fetchAmazonFrPrice(asin, callback) {
            if (amazonFrPriceCache[asin] !== undefined) {
                callback(amazonFrPriceCache[asin]);
                return;
            }
            const url = `https://www.amazon.fr/gp/product/${asin}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                headers: {
                    'Accept-Language': 'fr-FR,fr;q=0.9',
                    'User-Agent': navigator.userAgent
                },
                onload: function(resp) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(resp.responseText, 'text/html');

                        // Essaye plusieurs sélecteurs de prix courants sur Amazon
                        let price = null;
                        const selectors = [
                            '#apex_desktop .a-price .a-offscreen',
                            '#corePrice_desktop_feature_div .a-offscreen',
                            '#corePrice_feature_div .a-offscreen',
                            '#price_inside_buybox',
                            '#priceblock_ourprice',
                            '#priceblock_dealprice',
                            '.priceToPay .a-offscreen',
                            '#corePriceDisplay_desktop_feature_div .a-offscreen',
                            '#twister-plus-price-data-price .a-offscreen',
                            '#sns-base-price .a-offscreen',
                            '.a-price[data-a-size="xl"] .a-offscreen',
                            '.a-price[data-a-size="medium"] .a-offscreen',
                            '.a-price .a-offscreen',
                        ];

                        for (const sel of selectors) {
                            const el = doc.querySelector(sel);
                            if (el) {
                                price = el.textContent.trim();
                                // Normalise : "36,59 €" ou "36.59€"
                                if (price) break;
                            }
                        }

                        // Fallback 1 : reconstruit le prix depuis les spans a-price-whole / a-price-fraction
                        // (certains templates n'ont pas de .a-offscreen avec le texte complet)
                        if (!price) {
                            const priceEl = doc.querySelector('.a-price:not(.a-text-price)');
                            if (priceEl) {
                                const whole = priceEl.querySelector('.a-price-whole');
                                const frac  = priceEl.querySelector('.a-price-fraction');
                                const symbol = priceEl.querySelector('.a-price-symbol');
                                if (whole) {
                                    const w = whole.textContent.replace(/[^\d]/g, '');
                                    const f = frac ? frac.textContent.replace(/[^\d]/g, '') : '00';
                                    const sym = symbol ? symbol.textContent.trim() : '€';
                                    price = `${w},${f} ${sym}`;
                                }
                            }
                        }

                        // Fallback 2 : cherche un prix directement dans le HTML brut (JSON embarqué,
                        // utile quand la page est servie côté serveur sans les conteneurs habituels)
                        if (!price) {
                            const raw = resp.responseText;
                            let m = raw.match(/"priceAmount"\s*:\s*"?(\d+[.,]\d{2})"?/);
                            if (!m) m = raw.match(/class="a-offscreen"[^>]*>\s*([\d.,]+\s?€)\s*</);
                            if (m) {
                                price = m[1].includes('€') ? m[1] : m[1].replace('.', ',') + ' €';
                            }
                        }

                        // Prix barré (prix conseillé / List Price), affiché à côté du prix actuel
                        let listPrice = null;
                        const listPriceSelectors = [
                            '.basisPrice .a-text-price .a-offscreen',
                            '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
                            '.a-text-price[data-a-strike="true"] .a-offscreen',
                            '#priceblock_strikeprice',
                            '#listPrice',
                            '.a-text-strike',
                        ];
                        for (const sel of listPriceSelectors) {
                            const el = doc.querySelector(sel);
                            if (el) {
                                const txt = el.textContent.trim();
                                if (txt && txt !== price) { listPrice = txt; break; }
                            }
                        }

                        const result = { price: price || null, listPrice: listPrice || null };
                        amazonFrPriceCache[asin] = result;
                        callback(result);
                    } catch(e) {
                        amazonFrPriceCache[asin] = { price: null, listPrice: null };
                        callback({ price: null, listPrice: null });
                    }
                },
                onerror: function() {
                    amazonFrPriceCache[asin] = { price: null, listPrice: null };
                    callback({ price: null, listPrice: null });
                }
            });
        }

    if (isModuleEnabled('amazonFrPrice')) {
        function injectAmazonFrPrice() {
            // Cherche l'ASIN dans la table produit
            const asinTh = Array.from(document.querySelectorAll('[data-section-type="product"] table.a-keyvalue th'))
                .find(th => th.textContent.trim() === 'ASIN');
            if (!asinTh) return;

            const asinTd = asinTh.closest('tr')?.querySelector('td');
            const asin = asinTd?.textContent.trim();
            if (!asin || !/^[A-Z0-9]{10}$/.test(asin)) return;

            // Cherche "List Price" dans la table pour injecter juste à côté
            const allTh = document.querySelectorAll('[data-section-type="product"] table.a-keyvalue th');
            let targetTd = null;
            for (const th of allTh) {
                const txt = th.textContent.trim().toLowerCase();
                if (txt.includes('list price') || txt.includes('prix catalogue') || txt.includes('prix de liste')) {
                    targetTd = th.closest('tr')?.querySelector('td');
                    break;
                }
            }

            // Si pas de "List Price", prend la première ligne après ASIN (souvent le titre)
            // Fallback : on ajoute une nouvelle ligne dans la table
            const keyvalueTable = document.querySelector('[data-section-type="product"] table.a-keyvalue');
            if (!keyvalueTable) return;

            // Badge déjà injecté ?
            if (document.getElementById('fcr-amzfr-price-badge')) return;

            // Crée le badge "Prix Amazon.fr"
            const badge = document.createElement('span');
            badge.id = 'fcr-amzfr-price-badge';
            badge.style.cssText = `
                display: inline-flex; align-items: center; gap: 4px;
                margin-left: 12px; padding: 2px 8px; border-radius: 4px;
                font-size: 12px; font-weight: 700; vertical-align: middle;
                white-space: nowrap; cursor: default; transition: background 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s;
            `;
            badge.title = 'Prix actuel sur Amazon.fr';
            badge.textContent = '🛒 Amazon.fr : …';
            badge.dataset.priceState = 'loading';

            // Fonction de restyle du badge selon le thème courant
            // (fond plein + texte clair fixe pour rester lisible quel que soit le thème,
            // au lieu d'un dégradé qui rendait le texte illisible par endroits)
            function styleBadgeForTheme() {
                const t = THEMES[currentTheme] || THEMES.bleu;
                const state = badge.dataset.priceState;
                if (state === 'ok') {
                    badge.style.background   = t.isBase ? '#ff9900' : t.bg3;
                    badge.style.color        = t.isBase ? '#111'    : '#f5f7fb';
                    badge.style.borderColor  = t.isBase ? '#e47911' : t.accent;
                    badge.style.boxShadow    = t.isBase ? 'none'    : `0 0 6px ${t.accent}55`;
                } else if (state === 'nd') {
                    badge.style.background   = t.isBase ? '#888' : t.bg3;
                    badge.style.color        = t.isBase ? '#fff' : '#cdd3e0';
                    badge.style.borderColor  = t.isBase ? '#666' : t.accentDark;
                    badge.style.boxShadow    = 'none';
                } else {
                    // loading
                    badge.style.background   = t.isBase ? '#eee' : t.bg2;
                    badge.style.color        = t.isBase ? '#888' : '#cdd3e0';
                    badge.style.borderColor  = t.isBase ? '#ccc' : t.accentDark;
                    badge.style.boxShadow    = 'none';
                }
            }

            // Hook restyle appelé par applyTheme()
            window._fcrAmzFrPriceBadgeRestyle = styleBadgeForTheme;
            styleBadgeForTheme();

            // Insère le badge dans la ligne List Price (ou crée une nouvelle ligne)
            if (targetTd) {
                targetTd.appendChild(badge);
            } else {
                // Crée une ligne dédiée à la fin de la table produit
                const newRow = keyvalueTable.querySelector('tbody')?.insertRow() || keyvalueTable.insertRow();
                const newTh = document.createElement('th');
                newTh.style.cssText = 'width:30%; padding:4px 8px; white-space:nowrap;';
                newTh.textContent = 'Amazon.fr';
                const newTd = document.createElement('td');
                newTd.style.cssText = 'padding:4px 8px;';
                newTd.appendChild(badge);
                newRow.appendChild(newTh);
                newRow.appendChild(newTd);
            }

            // Fetch le prix
            fetchAmazonFrPrice(asin, function(result) {
                const price = result && result.price;
                const listPrice = result && result.listPrice;
                if (price) {
                    badge.dataset.priceState = 'ok';
                    badge.innerHTML = `🛒 Amazon.fr : <strong>${price}</strong>` +
                        (listPrice ? ` <span style="text-decoration:line-through;opacity:0.65;font-weight:400;margin-left:4px;">${listPrice}</span>` : '');
                    badge.title = `Prix affiché sur amazon.fr (ASIN: ${asin})`;
                } else {
                    badge.dataset.priceState = 'nd';
                    badge.textContent = '🛒 Amazon.fr : N/D';
                    badge.title = `Prix non disponible sur amazon.fr (ASIN: ${asin})`;
                }
                styleBadgeForTheme();
            });
        }

        // Lance l'injection dès que la table produit est présente
        waitForElement('[data-section-type="product"] table.a-keyvalue')
            .then(() => {
                injectAmazonFrPrice();
                // Re-observe les mutations de page (navigation SPA)
                // Perf : mutualisé sur l'observer racine partagé (fcrOnRootMutation)
                // au lieu d'un MutationObserver dédié.
                fcrOnRootMutation(debounce(() => {
                    if (!document.getElementById('fcr-amzfr-price-badge')) {
                        injectAmazonFrPrice();
                    }
                }, 400));
            })
            .catch(() => {});
    }
    if (isModuleEnabled('imageHover')) {
        function addImageHoverToASINs() {
            const imageContainer = document.createElement('div');
            imageContainer.className = 'asin-image-container';
            imageContainer.style.cssText = `
                display: none;
                position: fixed;
                z-index: 1000;
                background-color: white;
                padding: 5px;
                border: 1px solid #ccc;
                border-radius: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                max-width: 350px;
                max-height: 350px;
            `;
            document.body.appendChild(imageContainer);

            function positionContainer(element) {
                const rect = element.getBoundingClientRect();
                const containerRect = imageContainer.getBoundingClientRect();
                const padding = 10;
                let top = rect.top;
                let left = rect.right + padding;
                if (left + containerRect.width > window.innerWidth) left = rect.left - containerRect.width - padding;
                if (left < padding) left = padding;
                if (top + containerRect.height > window.innerHeight) top = window.innerHeight - containerRect.height - padding;
                if (top < padding) top = padding;
                imageContainer.style.top = `${top}px`;
                imageContainer.style.left = `${left}px`;
            }

            function handleMouseEnter(anchorEl, asin) {
                const rect = anchorEl.getBoundingClientRect();
                imageContainer.style.cssText = `
                    display: block;
                    position: fixed;
                    top: ${rect.top}px;
                    left: ${rect.right + 10}px;
                    z-index: 1000;
                    background-color: white;
                    padding: 5px;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    max-width: 350px;
                    max-height: 350px;
                `;
                imageContainer.innerHTML = 'Loading...';
                setTimeout(() => positionContainer(anchorEl), 10);
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
                        const img = doc.querySelector('img') ||
                                    doc.querySelector('.product-image') ||
                                    doc.querySelector('[data-image]');
                        if (img && img.src) {
                            let imageSrc = img.src;
                            imageSrc = imageSrc.replace(/^http:/, 'https:');
                            imageSrc = imageSrc.replace(/https?:\/\/ecx\.images-amazon\.com/, 'https://images-na.ssl-images-amazon.com');
                            imageSrc = imageSrc.replace(/https?:\/\/m\.media-amazon\.com/, 'https://m.media-amazon.com');
                            const productImg = document.createElement('img');
                            productImg.src = imageSrc;
                            productImg.style.maxWidth = '340px';
                            productImg.style.maxHeight = '340px';
                            productImg.style.display = 'block';
                            productImg.onload = function() { positionContainer(anchorEl); };
                            productImg.onerror = function() { imageContainer.innerHTML = 'Image unavailable'; positionContainer(anchorEl); };
                            imageContainer.innerHTML = '';
                            imageContainer.appendChild(productImg);
                            setTimeout(() => positionContainer(anchorEl), 50);
                        } else {
                            imageContainer.innerHTML = 'No image available';
                            positionContainer(anchorEl);
                        }
                    },
                    onerror: function() { imageContainer.innerHTML = 'Error loading image'; positionContainer(anchorEl); }
                });
            }

            function handleMouseLeave() {
                imageContainer.style.display = 'none';
            }

            // Perf : délégation d'événement — UN SEUL listener sur hoverRoot au lieu
            // d'un mouseenter/mouseleave par lien ASIN (jusqu'à ~1500 listeners/reload
            // mesurés en usage intensif via le profiler). Plus besoin de re-scanner
            // hoverRoot.querySelectorAll('a') à chaque mutation du DOM non plus — ça
            // couvrait potentiellement des centaines de liens à chaque ligne ajoutée
            // au tableau, c'était le vrai coût CPU, pas juste le nombre de listeners.
            // Les liens ajoutés dynamiquement plus tard sont couverts automatiquement
            // par la délégation, sans rien à recalculer.
            const hoverRoot = fcrGetRoot();
            const ASIN_LINK_RE = /^(B[A-Z0-9]{9}|X0[A-Z0-9]{8})$/;
            let hoveredLink = null;

            function matchAsinLink(target) {
                const link = target && target.closest ? target.closest('a') : null;
                if (!link || !hoverRoot.contains(link)) return null;
                const text = link.textContent.trim();
                return ASIN_LINK_RE.test(text) ? { link, text } : null;
            }

            hoverRoot.addEventListener('mouseover', (e) => {
                const match = matchAsinLink(e.target);
                if (!match || match.link === hoveredLink) return;
                hoveredLink = match.link;
                handleMouseEnter(match.link, match.text);
            });

            hoverRoot.addEventListener('mouseout', (e) => {
                if (!hoveredLink) return;
                if (e.relatedTarget && hoveredLink.contains(e.relatedTarget)) return; // toujours dans le même lien
                hoveredLink = null;
                handleMouseLeave();
            });
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
                method: 'GET',
                        withCredentials: true, url: url,
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
                method: 'GET',
                        withCredentials: true, url: url,
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
    const PREP_TITLE_LABELS = ['Title', 'Titre'];
    const PREP_ASIN_LABELS  = ['ASIN'];

    function nopoPrepInstructions(asin, table) {
        if (prepInstructionsTimeout) clearTimeout(prepInstructionsTimeout);
        prepInstructionsTimeout = setTimeout(() => {
            if (table.querySelector('.prep-instructions-row')) return;
            fetchAsinLevelPrepInstructions(asin).then(instructions => {
                let titleRow;
                for (let i = 0; i < table.rows.length; i++) {
                    if (PREP_TITLE_LABELS.includes(table.rows[i].cells[0].textContent.trim())) { titleRow = table.rows[i]; break; }
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
                    const prepThBg  = t.isAnimated ? hexToRgba(t.bg3, 0.5)  : t.bg3;
                    const prepTdBg  = t.isAnimated ? hexToRgba(t.prepBg, 0.4) : t.prepBg;
                    th.style.cssText = `background-color:${prepThBg} !important; color:${t.accent} !important; font-weight:bold;`;
                    const instructionText = Array.isArray(instructions) ? instructions.join(', ') : instructions;
                    td.textContent = instructionText;
                    const refTd = table.querySelector('td');
                    if (refTd) td.className = refTd.className;
                    td.style.cssText = `background-color:${prepTdBg} !important; color:${instructionText !== 'No Prep' ? t.prepYes : t.prepNoPrep} !important; font-weight:bold;`;
                    td.classList.add(instructionText !== 'No Prep' ? 'prep-yes' : 'prep-noprep');
                }
            }).catch(error => console.error('Error fetching prep for ASIN:', asin, error));
        }, 1000);
    }

    function addPrepInstructions() {
        if (!isModuleEnabled('prepDisplay')) return;
        // Fallback chain: try a-span7 first (EN), then data-section-type (FR + EN)
        const tryTables = (tables) => {
            tables.forEach(table => {
                if (!table.querySelector('.prep-instructions-row')) {
                    const asinRow = Array.from(table.rows).find(row =>
                        row.cells.length > 0 &&
                        PREP_ASIN_LABELS.includes(row.cells[0].textContent.trim())
                    );
                    if (asinRow) {
                        const asinCell = asinRow.cells[1];
                        const asin = asinCell.querySelector('a') ? asinCell.querySelector('a').textContent.trim() : asinCell.textContent.trim();
                        nopoPrepInstructions(asin, table);
                    }
                }
            });
        };

        const span7 = document.querySelector('div.a-column.a-span7');
        if (span7) {
            const tables = span7.querySelectorAll('table.a-keyvalue');
            if (tables.length > 0) { tryTables(tables); return; }
        }
        // Fallback: product section (works in FR and when a-span7 is absent)
        waitForElement('[data-section-type="product"] table.a-keyvalue').then(() => {
            tryTables(document.querySelectorAll('[data-section-type="product"] table.a-keyvalue'));
        }).catch(() => {
            // Last resort: any a-keyvalue table on page
            tryTables(document.querySelectorAll('table.a-keyvalue'));
        });
    }

    function createPrepButton(text) {
        const button = document.createElement('button');
        button.type = 'button';
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
                prepCell.style.padding = '6px 10px';
                let instructions, isPrep;
                if (isResearchPrep) {
                    ({ instructions, isPrep } = result);
                    instructions = Array.isArray(instructions) ? instructions.join(', ') : instructions;
                } else { instructions = result; isPrep = instructions !== 'No Prep'; }
                if (isPrep === 'unknown') {
                    prepRow.classList.add('prep-unknown');
                    unknownCount++;
                } else if (isPrep) {
                    prepRow.classList.add('prep-yes');
                    prepCount++;
                } else {
                    prepRow.classList.add('prep-noprep');
                    noPrepCount++;
                }
                const icon = isPrep === 'unknown' ? '⚠️' : isPrep ? '📦' : '✅';
                prepCell.innerHTML = `<b>${icon} Prep:</b> ${instructions}`;
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

    // Perf : mutualisé sur l'observer racine partagé (fcrOnRootMutation)
    // au lieu d'un MutationObserver dédié sur main/#content.
    fcrOnRootMutation(debounce(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            prepInstructionsAdded = false;
            setTimeout(() => { addPrepInstructions(); addPrepButtons(); }, 2000);
        } else if (!prepInstructionsAdded) { addPrepInstructions(); }
    }, 800)); // debounce augmenté 500→800ms
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

        waitForElement('[data-section-type="product"] table.a-keyvalue')
            .then(() => calculateAndDisplayItemCapacities())
            .catch(() => {});
    }

    // ════════════════════════════════════════════════════════════════
    // ===== WEIGHT CALCULATOR =====
    // ════════════════════════════════════════════════════════════════
    function addWeightButton() {
        if (!isModuleEnabled('weightCalc')) return;
        const inventoryHeader = document.querySelector('[data-section-type="inventory"] .section-title');
        if (!inventoryHeader || document.getElementById('weightButton')) return;
        const button = document.createElement('button');
        button.type = 'button';
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
                const asinCellParent = fcrGetInventoryCell(row, 'asin', 1);
                const asinCell = asinCellParent ? asinCellParent.querySelector('a') : null;
                const quantityCell = fcrGetInventoryCell(row, 'quantity', 5);
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
                        withCredentials: true,
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
    // ===== PRIX TOTAL INVENTAIRE (priorité au prix barré Amazon.fr) =====
    // ════════════════════════════════════════════════════════════════
    function addTotalPriceButton() {
        if (!isModuleEnabled('amazonFrPrice')) return;
        const inventoryHeader = document.querySelector('[data-section-type="inventory"] .section-title');
        if (!inventoryHeader || document.getElementById('totalPriceButton')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'totalPriceButton';
        button.className = 'LoadPrep-button';
        button.textContent = '💰 Prix Total';
        button.title = "Valeur totale de l'inventaire (priorité au prix barré Amazon.fr)";
        button.addEventListener('click', calculateInventoryTotalPrice);
        inventoryHeader.appendChild(button);
    }

    // Parse "36,59 €", "1 234,56 €", "36.59€"... → 36.59 (Number), ou null si illisible.
    // Gère virgule ET point comme séparateur décimal selon lequel apparaît en dernier,
    // et retire les espaces (normaux + insécables) utilisés comme séparateurs de milliers.
    function parseAmzFrPriceToNumber(str) {
        if (!str) return null;
        const cleaned = str.replace(/[^\d.,\s\u00A0]/g, '').trim();
        if (!cleaned) return null;
        let normalized = cleaned.replace(/[\s\u00A0]/g, '');
        const lastComma = normalized.lastIndexOf(',');
        const lastDot = normalized.lastIndexOf('.');
        if (lastComma > -1 && lastDot > -1) {
            if (lastComma > lastDot) normalized = normalized.replace(/\./g, '').replace(',', '.');
            else normalized = normalized.replace(/,/g, '');
        } else if (lastComma > -1) {
            normalized = normalized.replace(',', '.');
        }
        const num = parseFloat(normalized);
        return isNaN(num) ? null : num;
    }

    async function calculateInventoryTotalPrice() {
        const button = document.getElementById('totalPriceButton');
        if (!button) return;
        const originalText = '💰 Prix Total';
        button.disabled = true;
        button.textContent = 'Calcul...';
        button.style.color = '';
        try {
            const rows = document.querySelectorAll('#table-inventory tbody tr');
            const asinQuantities = {}, asins = [];
            rows.forEach(row => {
                const asinCellParent = fcrGetInventoryCell(row, 'asin', 1);
                const asinCell = asinCellParent ? asinCellParent.querySelector('a') : null;
                const quantityCell = fcrGetInventoryCell(row, 'quantity', 5);
                const quantity = quantityCell ? (parseInt(quantityCell.innerText) || 0) : 0;
                const asin = asinCell ? asinCell.innerText.trim() : '';
                if (!asin || quantity <= 0) return;
                if (!asinQuantities[asin]) { asinQuantities[asin] = quantity; asins.push(asin); }
                else asinQuantities[asin] += quantity;
            });

            if (asins.length === 0) {
                button.textContent = 'Aucun item';
                setTimeout(() => { button.textContent = originalText; button.disabled = false; }, 2000);
                return;
            }

            const results = await Promise.all(asins.map(asin => new Promise(resolve => {
                fetchAmazonFrPrice(asin, (result) => resolve({ asin, result }));
            })));

            let total = 0, missingCount = 0, usedListPriceCount = 0;
            results.forEach(({ asin, result }) => {
                const listPriceNum = parseAmzFrPriceToNumber(result && result.listPrice);
                const priceNum     = parseAmzFrPriceToNumber(result && result.price);
                // Priorité au prix barré (List Price) s'il est lisible, sinon on retombe sur le prix courant
                const unitPrice = listPriceNum !== null ? listPriceNum : priceNum;
                if (listPriceNum !== null) usedListPriceCount++;
                if (unitPrice === null) { missingCount++; return; }
                total += unitPrice * asinQuantities[asin];
            });

            const totalFormatted = total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            if (missingCount > 0) {
                button.textContent = `💰 ~${totalFormatted} € (${missingCount}/${asins.length} ASIN sans prix)`;
                button.style.color = '#d3731e';
                button.title = `Total incomplet : ${missingCount} ASIN sans prix trouvé sur amazon.fr. Prix barré utilisé pour ${usedListPriceCount} ASIN.`;
            } else {
                button.textContent = `💰 ${totalFormatted} €`;
                button.style.color = '#3df70a';
                button.title = `Valeur totale sur ${asins.length} ASIN distincts. Prix barré (List Price) utilisé pour ${usedListPriceCount} d'entre eux.`;
            }
        } catch (error) {
            button.textContent = 'Erreur calcul prix';
            button.style.color = 'red';
            console.error('Erreur calcul prix total inventaire:', error);
        } finally {
            button.disabled = false;
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ===== CSV EXPORT INVENTORY =====
    // ════════════════════════════════════════════════════════════════
    function addCsvExportButton() {
        if (!isModuleEnabled('csvExport')) return;
        const inventoryHeader = document.querySelector('[data-section-type="inventory"] .section-title');
        if (!inventoryHeader || document.getElementById('csvExportButton')) return;
        const button = document.createElement('button');
        button.type = 'button';
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
        button.type = 'button';
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
                { name: "PanDash", url: (asin) => `https://pandash.amazon.com#${asin}` },
                { name: "CSI", url: (asin) => `https://csi.amazon.com/view?view=simple_product_data_view&item_id=${asin}&marketplace_id=1` }
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
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).catch(() => {
                        const temp = $("<input>"); $("body").append(temp); temp.val(text).select();
                        document.execCommand("copy"); temp.remove();
                    });
                } else {
                    const temp = $("<input>"); $("body").append(temp); temp.val(text).select();
                    document.execCommand("copy"); temp.remove();
                }
            }

            function printBarcode(text, quantity) {
                if (typeof fcrActivityTrack === 'function') fcrActivityTrack('impression');
                const printHost = "http://localhost:5965/printer";
                const badgeId = $.cookie('fcmenu-employeeId') || '';
                const encodedText = text.split('').map(c => c.charCodeAt(0).toString(16)).join('');
                const params = `action=print&type=barcode&data=${encodedText}&text=${encodedText}&quantity=${quantity}&badgeid=${badgeId}&seq=${Math.random().toString(36).substring(2,12)}`;
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
                ensureCtxMenuCloseHandler();
            }

            // Handler de fermeture unique, lié une seule fois (pas de re-binding à chaque
            // ouverture, donc pas de course/délai). Se ferme uniquement sur un clic GAUCHE
            // réel en dehors du menu — ignore le clic droit lui-même (event.button === 2)
            // et tout clic à l'intérieur du menu (géré par les handlers des items).
            let fcrCtxMenuHandlerBound = false;
            function ensureCtxMenuCloseHandler() {
                if (fcrCtxMenuHandlerBound) return;
                fcrCtxMenuHandlerBound = true;
                document.addEventListener('mousedown', function(ev) {
                    if (ev.button === 2) return;
                    const menuEl = document.querySelector('.custom-context-menu');
                    if (!menuEl) return;
                    if (menuEl.contains(ev.target)) return;
                    menuEl.remove();
                }, true);
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
                if (match = textToUse.match(/\b(B[A-Z0-9]{9}|X0[A-Z0-9]{8})\b/)) { createContextMenu(e, match[0], 'ASIN'); return false; }
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

    // ===== GOD MODE — PRINT BUTTONS & FLOOR FINDER =====
    // ════════════════════════════════════════════════════════════════
    if (isModuleEnabled('godModePrint')) {
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
                // ── Observer unique pour les lignes inventory (print + transshipment) ──
                waitForKeyElements("#table-inventory tbody tr", function(row) {
                    row.each(function() {
                        var tr = this;
                        var cells = $(tr).find('td');
                        if (!cells[11]) return;
                        var titleText = cells[11].querySelector("a") ? cells[11].querySelector("a").textContent.trim() : "N/A";
                        var titleLink = cells[11].querySelector("a") || "N/A";

                        // ── Badge quantité > 1 ───────────────────────────────────
                        var qtyCell = cells[5]; // colonne Quantité (index 5)
                        if (qtyCell && !$(qtyCell).find('.fcr-qty-badge').length) {
                            var qtyRaw  = qtyCell.textContent.trim();
                            var qtyVal  = parseInt(qtyRaw);
                            if (!isNaN(qtyVal) && qtyVal > 1) {
                                var badge = document.createElement('span');
                                badge.className  = 'fcr-qty-badge';
                                badge.textContent = qtyVal;
                                badge.title      = `Quantité : ${qtyVal}`;
                                qtyCell.dataset.qtyOrig = qtyVal; // fallback si CSS ne charge pas
                                qtyCell.textContent = '';
                                qtyCell.appendChild(badge);
                            }
                        }
                        cells.each(function(index) {
                            var cell = $(this);
                            if (cell.hasClass('print-processed')) return;
                            // Uniquement les colonnes Container (0) et FNSku (2)…
                            if (index !== 0 && index !== 2) return;
                            // …uniquement sur les pages de recherche contenant (?s=tsXXXXXXXXX), pas ASIN…
                            if (!isContainerSearchPage()) return;
                            // …et uniquement sur les 10 premières lignes du tableau.
                            var rowIndex = $(tr).index();
                            if (rowIndex >= 10) return;
                            var link = cell.find('a');
                            if (link.length > 0) {
                                var type = index === 0 ? "Container" : "FNSku";
                                var button = document.createElement("button");
                                button.innerHTML = "🖶";
                                button.title = `Print ${type}`;
                                button.className = 'fcr-print-btn';
                                button.onclick = function() {
                                    var barcode = link.text().trim();
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

                        // Transshipment tooltip sur la même ligne
                        if (typeof window.attachTransshipmentHover === 'function') {
                            window.attachTransshipmentHover(tr);
                        }
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
                                var cleanBarcode = barcode.split(/\s+/)[0];

                                // Sélecteur de quantité
                                var qtySelect = document.createElement("select");
                                qtySelect.title = "Quantité à imprimer";
                                qtySelect.style.cssText = "margin-left:6px;padding:1px 3px;border:1px solid #aaa;border-radius:3px;background:#f0f0f0;font-size:12px;cursor:pointer;width:44px;";
                                [1,2,3,4,5,10,15,20,25,50].forEach(function(n) {
                                    var opt = document.createElement("option");
                                    opt.value = n; opt.textContent = n;
                                    if (n === 1) opt.selected = true;
                                    qtySelect.appendChild(opt);
                                });

                                var button = document.createElement("button");
                                button.innerHTML = "🖶";
                                button.className = 'fcr-print-btn';
                                button.title = "Print " + type;
                                button.onclick = function(e) {
                                    e.preventDefault();
                                    var qty = parseInt(qtySelect.value) || 1;
                                    quickPrint(cleanBarcode, qty, titleText, type, titleLink);
                                };
                                var container = $("<span class='print-button-container'></span>").append(qtySelect).append(button);
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
                    button.className = 'fcr-print-btn';
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
                        button.innerHTML = "🖶"; button.className = 'fcr-print-btn'; button.title = "Print ASIN";
                        button.onclick = function() { quickPrint(asin, 1, desc, "ASIN", link[0].href || "N/A"); };
                        var buttonContainer = document.createElement("span");
                        buttonContainer.style.display = "inline-block"; buttonContainer.className = "print-button-container"; buttonContainer.appendChild(button);
                        if (!elem.find('.print-button-container').length) { link[0].parentNode.insertBefore(buttonContainer, link[0].nextSibling); elem.addClass('print-processed'); }
                    }
                }, false);
            }


            function quickPrint(asin, quantity, desc, type, link) {
                if (typeof fcrActivityTrack === 'function') fcrActivityTrack('impression');
                asin = asin.trim();
                getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(asin) + "&text=" + asciihex(asin) + "&quantity=" + quantity + "&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=" + asciihex(desc) + "&seq=" + genId(), "Print Button", asin, type, quantity, desc, link);
            }

            function quickPrint2(barcode, type) {
                if (typeof fcrActivityTrack === 'function') fcrActivityTrack('impression');
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

            // ── Toast de feedback impression (remplace les alert bloquants) ──
            function showPrintToast(msg, isSuccess) {
                const existing = document.getElementById('fcr-print-toast');
                if (existing) existing.remove();
                const t = THEMES[currentTheme] || THEMES.bleu;
                const toast = document.createElement('div');
                toast.id = 'fcr-print-toast';
                const bg = isSuccess === true  ? '#27ae60'
                         : isSuccess === false ? '#e74c3c'
                         : '#e67e22'; // warning (duplicate)
                toast.style.cssText = `
                    position:fixed; bottom:82px; left:50%; transform:translateX(-50%);
                    background:${bg}; color:#fff;
                    padding:10px 22px; border-radius:8px;
                    font-family:Arial,sans-serif; font-size:13px; font-weight:700;
                    box-shadow:0 4px 18px rgba(0,0,0,0.4);
                    z-index:999999; pointer-events:none;
                    opacity:1; transition:opacity 0.4s ease;
                    white-space:nowrap;
                `;
                toast.textContent = msg;
                document.body.appendChild(toast);
                setTimeout(() => { toast.style.opacity = '0'; }, 2600);
                setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3100);
            }

            function getStatus(url, mode, asin, type, quantity, desc, link) {
                asin = asin.trim();
                const now = Date.now();
                if (asin === lastPrintedBarcode && now - lastPrintTime < 5000) {
                    Print_Status = "Skipped (Duplicate)";
                    showPrintToast('⚠️ Doublon ignoré : ' + asin, null);
                    sendMessageNew(mode, asin, type, quantity, desc, link);
                    return;
                }
                var xmlhttp = new XMLHttpRequest();
                xmlhttp.open("GET", url, true); xmlhttp.send();
                xmlhttp.onreadystatechange = function() {
                    if (xmlhttp.readyState == 4) {
                        if (xmlhttp.responseText == "valid") {
                            Print_Status = "Successful"; lastPrintedBarcode = asin; lastPrintTime = now;
                            sendMessageNew(mode, asin, type, quantity, desc, link);
                            showPrintToast('✅ Imprimé : ' + asin + (quantity > 1 ? ' ×' + quantity : ''), true);
                            var searchInput = document.getElementById("search");
                            if (searchInput) searchInput.value = "";
                        } else if (xmlhttp.responseText == "invalid") {
                            Print_Status = "Unsuccessful (Printer Error)"; sendMessageNew(mode, asin, type, quantity, desc, link);
                            showPrintToast('❌ Erreur imprimante — vérifier branchement', false);
                        } else {
                            Print_Status = "Unsuccessful (Printmon Error)"; sendMessageNew(mode, asin, type, quantity, desc, link);
                            showPrintToast('❌ Printmon non installé', false);
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
                    .barcodes_cover { display:none;position:fixed;top:0;bottom:0;left:0;right:0;z-index:9998;align-items:center;justify-content:center; }
                    .barcodes_panel { min-width:320px;border-radius:10px;padding:20px 24px;box-shadow:0 8px 32px rgba(0,0,0,0.45); }
                    .barcodes_panel > p { display:block;margin:0 0 4px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px; }
                    .print-button-container { display:inline-block;margin-left:5px; }
                    .loading.adjacent_bin_finder_spinner { display:inline-block;margin-left:5px; }
                    .s-icon-status { display:inline-block; }
                    #fcr-freeprint-title { font-size:13px;font-weight:800;text-align:center;margin-bottom:16px;letter-spacing:0.5px; }
                    #fcr-freeprint-barcode { width:100%;padding:8px 10px;border-radius:6px;border:1px solid;font-size:13px;box-sizing:border-box;margin-bottom:12px;outline:none; }
                    #fcr-freeprint-barcode:focus { box-shadow:0 0 0 2px; }
                    .fcr-freeprint-qty-row { display:flex;align-items:center;gap:8px;margin-bottom:16px; }
                    .fcr-freeprint-qty-label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0; }
                    .fcr-freeprint-qty-btn { width:30px;height:30px;border-radius:5px;border:1px solid;cursor:pointer;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all 0.15s; }
                    #fcr-freeprint-qty { width:52px;height:30px;text-align:center;border-radius:5px;border:1px solid;font-size:14px;font-weight:700;box-sizing:border-box; }
                    .fcr-freeprint-btn-row { display:flex;gap:10px;margin-top:4px; }
                    #fcr-freeprint-print { flex:1;padding:9px 0;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:0.3px;transition:all 0.18s; }
                    #fcr-freeprint-print:hover { transform:scale(1.03); }
                    #fcr-freeprint-close { padding:9px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.15s; }
                `;

                var barcodeText     = document.createElement("input");
                barcodeText.id      = "barcodeText";
                var barcodeQuantity = document.createElement("input");
                barcodeQuantity.type = "number"; barcodeQuantity.id = "barcodeQuantity"; barcodeQuantity.min = 1; barcodeQuantity.value = 1;

                // Panel structure
                var bar_cover = document.createElement("div");
                bar_cover.classList.add("barcodes_cover");
                let bar_panel = document.createElement("div");
                bar_panel.classList.add("barcodes_panel");

                // Titre
                const fpTitle = document.createElement('div');
                fpTitle.id = 'fcr-freeprint-title';
                fpTitle.textContent = '🖶 Print Barcode';

                // Label + champ barcode
                const fpBarcodeLabel = document.createElement('p');
                barcodeText.id = 'fcr-freeprint-barcode';
                barcodeText.placeholder = 'Entrer le barcode…';
                barcodeText.autocomplete = 'off';

                // Sélecteur quantité +/-
                const fpQtyRow = document.createElement('div');
                fpQtyRow.className = 'fcr-freeprint-qty-row';
                const fpQtyLabel = document.createElement('span');
                fpQtyLabel.className = 'fcr-freeprint-qty-label';
                fpQtyLabel.textContent = 'Quantité :';
                const fpQtyMinus = document.createElement('button');
                fpQtyMinus.type = 'button';
                fpQtyMinus.className = 'fcr-freeprint-qty-btn';
                fpQtyMinus.textContent = '−';
                fpQtyMinus.onclick = () => { const v = parseInt(fpQtyInput.value)||1; if (v > 1) fpQtyInput.value = v - 1; };
                const fpQtyInput = document.createElement('input');
                fpQtyInput.id = 'fcr-freeprint-qty';
                fpQtyInput.type = 'number';
                fpQtyInput.min = 1;
                fpQtyInput.value = 1;
                const fpQtyPlus = document.createElement('button');
                fpQtyPlus.type = 'button';
                fpQtyPlus.className = 'fcr-freeprint-qty-btn';
                fpQtyPlus.textContent = '+';
                fpQtyPlus.onclick = () => { fpQtyInput.value = (parseInt(fpQtyInput.value)||1) + 1; };
                fpQtyRow.appendChild(fpQtyLabel);
                fpQtyRow.appendChild(fpQtyMinus);
                fpQtyRow.appendChild(fpQtyInput);
                fpQtyRow.appendChild(fpQtyPlus);

                // Boutons Print / Close
                const fpBtnRow = document.createElement('div');
                fpBtnRow.className = 'fcr-freeprint-btn-row';
                var buttonFPrint = document.createElement("button");
                buttonFPrint.id = 'fcr-freeprint-print';
                buttonFPrint.innerHTML = "🖶 Print";
                buttonFPrint.onclick = function() {
                    const qty = Math.max(1, parseInt(fpQtyInput.value) || 1);
                    if (barcodeText.value == "") {
                        Print_Status = "Unsuccessful (Barcode Empty)"; sendMessageNew("Free Print", barcodeText.value, "Unknown", qty, "N/A", "N/A");
                        alert("Please enter text into the barcode box.");
                    } else if (barcodeText.value.includes("LPN")) {
                        const response = confirm("LPN's are considered unique and should not be printed. OK to continue?");
                        if (response) getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(barcodeText.value) + "&text=" + asciihex(barcodeText.value) + "&quantity=" + qty + "&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Free Print", barcodeText.value, "LPN", qty, "N/A", "N/A");
                        else { Print_Status = "Cancelled"; sendMessageNew("Free Print", barcodeText.value, "LPN", qty, "N/A", "N/A"); }
                    } else {
                        getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(barcodeText.value) + "&text=" + asciihex(barcodeText.value) + "&quantity=" + qty + "&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Free Print", barcodeText.value, "Unknown", qty, "N/A", "N/A");
                    }
                };
                var buttonClose = document.createElement("button");
                buttonClose.id = 'fcr-freeprint-close';
                buttonClose.innerHTML = "✕ Fermer";
                buttonClose.onclick = function() { bar_cover.style.display = "none"; var si = document.getElementById("search"); if (si) si.focus(); };
                fpBtnRow.appendChild(buttonFPrint);
                fpBtnRow.appendChild(buttonClose);

                // Assemblage
                bar_panel.appendChild(fpTitle);
                bar_panel.appendChild(fpBarcodeLabel);
                bar_panel.appendChild(barcodeText);
                bar_panel.appendChild(fpQtyRow);
                bar_panel.appendChild(fpBtnRow);
                bar_cover.appendChild(bar_panel);

                // Fermer avec Échap
                document.addEventListener('keydown', function(e) {
                    if (e.key === 'Escape' && bar_cover.style.display !== 'none') {
                        bar_cover.style.display = 'none';
                    }
                });

                // Appliquer style thème au panel (appelé aussi depuis applyTheme)
                function styleFreePrintPanel() {
                    const t = THEMES[currentTheme] || THEMES.bleu;
                    bar_cover.style.background = t.bg1 + 'cc';
                    bar_panel.style.background  = t.isGradient ? t.gradPanel : t.bg2;
                    bar_panel.style.border      = `1px solid ${t.accentDark}`;
                    fpTitle.style.color         = t.accent;
                    fpBarcodeLabel.style.color  = t.accent;
                    barcodeText.style.background    = t.bg3;
                    barcodeText.style.color         = t.isBase ? '#222' : '#d1d5db';
                    barcodeText.style.borderColor   = t.accentDark;
                    fpQtyLabel.style.color      = t.isBase ? '#222' : '#d1d5db';
                    fpQtyMinus.style.background = t.bg3;
                    fpQtyMinus.style.color      = t.accent;
                    fpQtyMinus.style.borderColor= t.accentDark;
                    fpQtyPlus.style.background  = t.bg3;
                    fpQtyPlus.style.color       = t.accent;
                    fpQtyPlus.style.borderColor = t.accentDark;
                    fpQtyInput.style.background = t.bg3;
                    fpQtyInput.style.color      = t.isBase ? '#222' : '#d1d5db';
                    fpQtyInput.style.borderColor= t.accentDark;
                    buttonFPrint.style.background   = t.isGradient ? t.gradAccent : t.accent;
                    buttonFPrint.style.color        = t.bg1;
                    buttonFPrint.style.boxShadow    = `0 0 10px ${t.accent}55`;
                    buttonClose.style.background    = t.bg3;
                    buttonClose.style.color         = t.isBase ? '#222' : '#d1d5db';
                    buttonClose.style.border        = `1px solid ${t.accentDark}`;
                }
                // Enregistre le restyle pour le hook centralisé
                window._fcrFreePrintRestyle = styleFreePrintPanel;

                $(document).ready(function() {
                    document.head.appendChild(barcodeShowStyle);
                    document.body.append(bar_cover);
                    var searchProfile = document.getElementById('search-profile');
                    if (searchProfile) {
                        searchProfile.type = "button";
                        searchProfile.value = "🖶 Print Barcode";
                        // Style thème
                        function styleNavPrintBtn() {
                            const t = THEMES[currentTheme] || THEMES.bleu;
                            searchProfile.style.cssText = `margin-right:6px;padding:4px 12px;border-radius:5px;border:1px solid ${t.accentDark};background:${t.isGradient ? t.gradBtn : t.bg3};color:${t.accent};font-size:12px;font-weight:700;cursor:pointer;transition:all 0.18s;box-shadow:0 0 6px ${t.accent}33;`;
                            searchProfile.onmouseenter = () => { searchProfile.style.background = t.accent; searchProfile.style.color = t.bg1; searchProfile.style.boxShadow = `0 0 10px ${t.accent}88`; searchProfile.style.transform = 'scale(1.05)'; };
                            searchProfile.onmouseleave = () => { searchProfile.style.background = t.isGradient ? t.gradBtn : t.bg3; searchProfile.style.color = t.accent; searchProfile.style.boxShadow = `0 0 6px ${t.accent}33`; searchProfile.style.transform = 'scale(1)'; };
                        }
                        styleNavPrintBtn();
                        window._fcrNavPrintRestyle = styleNavPrintBtn;

                        searchProfile.onclick = function() {
                            const qty = Math.max(1, parseInt(navQtyInput?.value) || 1);
                            let BarcodeSearch = document.getElementById("barcodeSearchText")?.value || "";
                            if (BarcodeSearch == "") BarcodeSearch = document.getElementById("search")?.placeholder || "";
                            if (BarcodeSearch.includes("LPN")) {
                                const response = confirm("LPN's are considered unique. OK to continue?");
                                if (response) getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(BarcodeSearch) + "&text=" + asciihex(BarcodeSearch) + "&quantity=" + qty + "&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Print Search Box", BarcodeSearch, "LPN", qty, "N/A", "N/A");
                                else { Print_Status = "Cancelled"; sendMessageNew("Print Search Box", BarcodeSearch, "LPN", qty, "N/A", "N/A"); }
                            } else {
                                getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(BarcodeSearch) + "&text=" + asciihex(BarcodeSearch) + "&quantity=" + qty + "&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Print Search Box", BarcodeSearch, "Unknown", qty, "N/A", "N/A");
                            }
                        };
                    }
                    var searchButton = document.getElementById('search-button');
                    if (searchButton) searchButton.style = "margin-left:10px";
                    var barcodeSearchText = document.createElement("input");
                    barcodeSearchText.id = "barcodeSearchText";

                    // Sélecteur de quantité +/- dans la navbar
                    var navQtyInput = null;
                    if (searchProfile) {
                        // Wrapper quantité
                        const navQtyWrap = document.createElement('span');
                        navQtyWrap.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-right:4px;vertical-align:middle;';

                        navQtyInput = document.createElement('input');
                        navQtyInput.type = 'number'; navQtyInput.min = 1; navQtyInput.value = 1;

                        function styleNavQty() {
                            const t = THEMES[currentTheme] || THEMES.bleu;
                            navQtyInput.style.cssText = `width:42px;text-align:center;padding:2px 4px;border-radius:4px;border:1px solid ${t.accentDark};background:${t.bg3};color:${t.isBase ? '#222' : '#d1d5db'};font-size:12px;font-weight:700;`;
                        }
                        styleNavQty();
                        window._fcrNavQtyRestyle = styleNavQty;

                        navQtyWrap.appendChild(navQtyInput);

                        searchProfile.parentNode.insertBefore(barcodeSearchText, searchProfile);
                        barcodeSearchText.placeholder = "Enter barcode data"; barcodeSearchText.autocomplete = "off";
                        // Insérer [− qty +] juste avant le bouton Print
                        searchProfile.parentNode.insertBefore(navQtyWrap, searchProfile);
                    }

                    var searchForm = document.forms[0];
                    if (searchForm) {
                        searchForm.id = "SearchForm";
                        searchForm.onsubmit = function() {
                            if (barcodeSearchText === document.activeElement) { if (searchProfile) { searchProfile.click(); return false; } }
                            return true;
                        };
                    }

                    // Enregistre le restyle nav pour le hook centralisé
                    window._fcrNavPrintRestyle = styleNavPrintBtn;
                    window._fcrNavQtyRestyle   = styleNavQty;
                });
            }
        })();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== HOOK CENTRALISÉ applyTheme — restyle tous les composants
    // ════════════════════════════════════════════════════════════════
    (function() {
        const _orig = applyTheme;
        applyTheme = function(name) {
            _orig(name);
            if (typeof window._fcrFreePrintRestyle === 'function') window._fcrFreePrintRestyle();
            if (typeof window._fcrNavPrintRestyle  === 'function') window._fcrNavPrintRestyle();
            if (typeof window._fcrNavQtyRestyle    === 'function') window._fcrNavQtyRestyle();
        };
    })();

    // ════════════════════════════════════════════════════════════════
    // ===== UTILITAIRE — empilement des bandeaux hazmat (anti-doublon) =====
    // Les bandeaux produit et inventaire partagent la classe .hazmat-fixed-banner.
    // Cette fonction les empile proprement les uns sous les autres au lieu
    // de les superposer au même endroit (top:0), ce qui donnait l'impression
    // de "doublons" quand les deux alertes étaient actives en même temps.
    // ════════════════════════════════════════════════════════════════
    function fcrReflowHazmatBanners() {
        const banners = Array.from(document.querySelectorAll('.hazmat-fixed-banner'));
        let offset = 0;
        banners.forEach(b => {
            b.style.top = offset + 'px';
            offset += b.getBoundingClientRect().height;
        });
    }

    // ════════════════════════════════════════════════════════════════
    // ===== CACHE PARTAGÉ HAZMAT (anti double-recherche) =====
    // Un seul cache — et une seule requête en vol — par couple FC+ASIN,
    // partagé entre le panel "produit" (fiche ASIN) et le scan "inventaire",
    // pour ne jamais interroger PanDash deux fois pour le même ASIN.
    // ════════════════════════════════════════════════════════════════
    const hazmatDataCache = {};        // cacheKey -> { level, message, pcApproved }
    const hazmatPendingCallbacks = {}; // cacheKey -> [callback, ...] (requête déjà en vol)

    // ASIN/niveau actuellement affiché par le bandeau "produit" (fiche ASIN unique).
    // Sert à ne pas ré-afficher le même ASIN dans le bandeau "inventaire" (anti doublon visuel).
    let fcrActiveProductHazmat = null; // { asin, level } | null

    function getHazmatFullData(asin, fc, callback) {
        const cacheKey = fc + '_' + asin;
        if (hazmatDataCache[cacheKey] !== undefined) { callback(hazmatDataCache[cacheKey]); return; }
        if (hazmatPendingCallbacks[cacheKey]) { hazmatPendingCallbacks[cacheKey].push(callback); return; }
        hazmatPendingCallbacks[cacheKey] = [callback];

        function resolveAll(result) {
            hazmatDataCache[cacheKey] = result;
            const cbs = hazmatPendingCallbacks[cacheKey] || [];
            delete hazmatPendingCallbacks[cacheKey];
            cbs.forEach(cb => { try { cb(result); } catch (e) {} });
        }

        function queryLevel(hazlvl) {
            const a = new Date();
            const filename = `${fc}_${asin}_${a.getFullYear()}${a.getMonth()+1}${a.getDate()}${a.getHours()}${a.getMinutes()}${a.getSeconds()}`;
            GM_xmlhttpRequest({
                method: "POST",
                withCredentials: true,
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
                    let result = { level: null, message: '', pcApproved: '' };
                    if (response.response && response.response.rows && response.response.rows.length > 0) {
                        const data = response.response.rows[0];
                        result = { level: data.level || data.htrc || null, message: data.message || '', pcApproved: data.pcApproved || '' };
                    }
                    resolveAll(result);
                },
                onerror: function() { resolveAll({ level: null, message: '', pcApproved: '' }); }
            });
        }

        let hazlvl = GM_getValue(fc + "hazlvl", false);
        if (!hazlvl) {
            GM_xmlhttpRequest({
                method: "GET",
                withCredentials: true,
                url: `https://pandash.amazon.com/GridServlet?fc=${fc}`,
                responseType: "json",
                onload: function(e) {
                    hazlvl = e.response.restriction;
                    GM_setValue(fc + "hazlvl", hazlvl);
                    queryLevel(hazlvl);
                },
                onerror: function() { resolveAll({ level: null, message: '', pcApproved: '' }); }
            });
        } else {
            queryLevel(hazlvl);
        }
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
                const tsCageLabels = ['Max units for tsCage (500lbs)', 'Max units for tsCage', 'Unités max pour tsCage (500lbs)', 'Unités max pour tsCage'];
                const restrictedLabels = ['Item Restricted in France', 'Article soumis à des restrictions en France', 'Article soumis à des restrictions'];
                const productTable = document.querySelector('[data-section-type="product"] table.a-keyvalue');
                if (productTable) {
                    for (let row of productTable.querySelectorAll('tbody tr')) {
                        const th = row.querySelector('th');
                        if (th && tsCageLabels.includes(th.textContent.trim())) return row;
                    }
                }
                const allTables = document.querySelectorAll('table.a-keyvalue');
                for (let table of allTables) {
                    for (let row of table.querySelectorAll('tbody tr')) {
                        const th = row.querySelector('th');
                        if (th && restrictedLabels.includes(th.textContent.trim())) return row;
                    }
                }
                // Last resort: last row of product table
                if (productTable) {
                    const rows = productTable.querySelectorAll('tbody tr');
                    if (rows.length > 0) return rows[rows.length - 1];
                }
                return null;
            }

            // injectHazmatPanel_restyle is defined in global scope (called by applyTheme on theme change)

            // ── Bandeau d'alerte hazmat (fixe en haut de la page, joli + empilable sans chevauchement) ──
            function buildHazmatBanner(asin, hazmatLevel, lastinMessage, lastinLevel) {
                let banner = document.getElementById('hazmat-fcr-banner');
                const refLevel = (lastinLevel !== '' && lastinLevel !== undefined) ? lastinLevel : hazmatLevel;
                const levelNum = parseInt(refLevel);
                const isDangerous = !isNaN(levelNum) && (levelNum === 0 || levelNum === 5 || levelNum === 6);

                if (!isDangerous) {
                    if (banner) { banner.remove(); fcrReflowHazmatBanners(); }
                    // Cet ASIN n'est plus signalé par le bandeau produit : on peut relâcher
                    // la déduplication vis-à-vis du bandeau inventaire pour cet ASIN.
                    if (fcrActiveProductHazmat && fcrActiveProductHazmat.asin === asin) {
                        fcrActiveProductHazmat = null;
                        if (typeof renderInventoryHazmatBanner === 'function') renderInventoryHazmatBanner();
                    }
                    return;
                }

                // Mémorise l'ASIN/niveau affiché ici pour que le bandeau "inventaire"
                // ne réaffiche pas la même alerte (anti double-bandeau), puis rafraîchit
                // immédiatement le bandeau inventaire s'il était déjà affiché.
                fcrActiveProductHazmat = { asin, level: refLevel };
                if (typeof renderInventoryHazmatBanner === 'function') renderInventoryHazmatBanner();

                let bg, icon, label;
                if (levelNum === 5) { bg = 'linear-gradient(90deg,#a85c0c,#e08e0f)'; icon = '⚠️'; label = 'ATTENTION HAZMAT'; }
                else                { bg = 'linear-gradient(90deg,#7a1d15,#c0392b)'; icon = '🚫'; label = 'HAZMAT INTERDIT'; }

                if (!banner) {
                    banner = document.createElement('div');
                    banner.id = 'hazmat-fcr-banner';
                    banner.className = 'hazmat-fixed-banner';
                    banner.style.cssText = `
                        position:fixed; left:0; right:0; z-index:999999;
                        padding:9px 44px 9px 18px; font-family:Arial,sans-serif;
                        color:#fff; font-size:13px;
                        box-shadow:0 2px 12px rgba(0,0,0,0.5);
                        cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.22);
                        animation:hazmatBannerPulse 1.8s ease-in-out infinite;
                        transition:top 0.2s ease;
                    `;
                    if (!document.getElementById('hazmat-fcr-banner-style')) {
                        const style = document.createElement('style');
                        style.id = 'hazmat-fcr-banner-style';
                        style.textContent = `@keyframes hazmatBannerPulse { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.12); } }`;
                        document.head.appendChild(style);
                    }
                    banner.addEventListener('click', (e) => {
                        if (e.target.closest('#hazmat-fcr-banner-close')) return;
                        const panel = document.getElementById('hazmat-fcr-panel');
                        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                    document.body.appendChild(banner);
                }

                banner.style.background = bg;
                banner.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;max-width:1100px;margin:0 auto;">
                        <span style="font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));">${icon}</span>
                        <span style="font-weight:800;letter-spacing:0.4px;">${label}</span>
                        ${asin ? `<span style="background:rgba(255,255,255,0.22);border:1px solid rgba(255,255,255,0.4);border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">ASIN&nbsp;${asin}</span>` : ''}
                        <span style="background:rgba(0,0,0,0.28);border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">Niveau&nbsp;${refLevel}</span>
                        ${lastinMessage ? `<span style="font-size:11px;font-weight:500;opacity:0.92;">· ${lastinMessage}</span>` : ''}
                    </div>
                    <span id="hazmat-fcr-banner-close" title="Fermer" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:13px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(0,0,0,0.22); opacity:0.9;">✕</span>
                `;
                banner.querySelector('#hazmat-fcr-banner-close').addEventListener('click', (e) => {
                    e.stopPropagation();
                    banner.remove();
                    fcrReflowHazmatBanners();
                });

                fcrReflowHazmatBanners();
            }

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
                    if (levelNum === 0)                        { badgeColor = '#DC3545'; badgeBg = '#fdecea'; statusIcon = '🚫'; }
                    else if (levelNum >= 1 && levelNum <= 4)   { badgeColor = '#27ae60'; badgeBg = '#e8f5e9'; statusIcon = '✓'; }
                    else if (levelNum === 5)                   { badgeColor = '#E67E22'; badgeBg = '#fff3e0'; statusIcon = '⚠️'; }
                    else if (levelNum === 6)                   { badgeColor = '#DC3545'; badgeBg = '#fdecea'; statusIcon = '🚫'; }
                    else                                       { badgeColor = '#DC3545'; badgeBg = '#fdecea'; statusIcon = '🚫'; }
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

                // Couleur du lastinLevel selon les mêmes règles
                const lastinNum = parseInt(lastinLevel);
                let lastinColor = '#666';
                if (!isNaN(lastinNum)) {
                    if (lastinNum === 0 || lastinNum === 6)            lastinColor = '#DC3545';
                    else if (lastinNum >= 1 && lastinNum <= 4)         lastinColor = '#27ae60';
                    else if (lastinNum === 5)                          lastinColor = '#E67E22';
                }

                info.innerHTML = `
                    <div style="font-size:14px;font-weight:700;color:${badgeColor};display:flex;align-items:center;gap:8px;">
                        <span>${statusIcon}</span>
                        <span>Niveau ${hazmatLevel}</span>
                        ${lastinLevel ? `<span style="font-size:11px;color:${lastinColor};font-weight:600;">&nbsp;·&nbsp;Last In: ${lastinLevel}</span>` : ''}
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

                if (isLoading) buildHazmatBanner(asin, '', '', '');
                else buildHazmatBanner(asin, hazmatLevel, lastinMessage, lastinLevel);
            }

            function fetchHazmatLevel(asin, fc) {
                if (!asin || !fc) return;
                const anchorRow = findInsertionAnchor();
                if (!anchorRow) return;
                buildHazmatPanel(anchorRow, asin, 'Chargement...', '', '', '');

                // Utilise le cache/dedupe partagé : si cet ASIN a déjà été interrogé
                // (ex: par le scan inventaire), aucune nouvelle requête PanDash n'est lancée.
                getHazmatFullData(asin, fc, function(result) {
                    if (!result || result.level === null || result.level === undefined) {
                        buildHazmatPanel(anchorRow, asin, 'Non trouvé', '', '', '');
                        return;
                    }
                    // On utilise "Last In" (result.level) comme chiffre principal affiché
                    const lastinLevel = result.level;
                    const hazmatLevel = lastinLevel; // badge + couleurs basés sur Last In
                    const lastinMessage = result.message || '';
                    const pcApproved = result.pcApproved || '';
                    buildHazmatPanel(anchorRow, asin, hazmatLevel, lastinMessage, lastinLevel, pcApproved);
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
            // Perf : mutualisé sur l'observer racine partagé (fcrOnRootMutation)
            // au lieu d'un MutationObserver dédié sur main/#content.
            fcrOnRootMutation(function(mutations) {
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
        })();
    }

    // ════════════════════════════════════════════════════════════════
    // ===== HAZMAT INTERDIT — INDICATEUR NIVEAU INVENTAIRE =====
    // Scanne les ASIN de la table inventaire et prévient si l'un d'eux est
    // en hazmat interdit (niveau 0 ou 6 — même seuil que le bandeau produit).
    // Requêtes limitées en parallèle (4 à la fois) pour ménager pandash.
    // ════════════════════════════════════════════════════════════════
    // Le cache/dedupe est désormais partagé avec le panel produit via getHazmatFullData()
    // (voir plus haut) — un même ASIN n'est donc jamais interrogé deux fois sur PanDash,
    // que ce soit depuis la fiche produit ou depuis le scan inventaire.
    function fetchAsinHazmatLevel(asin, fc, callback) {
        getHazmatFullData(asin, fc, callback);
    }

    // Exécute `worker` sur chaque item de `items` avec au maximum `limit` requêtes en parallèle.
    async function runWithConcurrencyLimit(items, limit, worker) {
        let idx = 0;
        async function next() {
            while (idx < items.length) {
                const current = idx++;
                await worker(items[current], current);
            }
        }
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
    }

    // `forbiddenEntries` est un tableau d'objets { asin, level }.
    function showInventoryHazmatBanner(forbiddenEntries) {
        let banner = document.getElementById('hazmat-inventory-fcr-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'hazmat-inventory-fcr-banner';
            banner.className = 'hazmat-fixed-banner';
            banner.style.cssText = `
                position:fixed; left:0; right:0; z-index:999998;
                padding:9px 44px 9px 18px; font-family:Arial,sans-serif;
                color:#fff; font-size:13px; background:linear-gradient(90deg,#7a1d15,#c0392b);
                box-shadow:0 2px 12px rgba(0,0,0,0.5);
                cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.22);
                animation:hazmatBannerPulse 1.8s ease-in-out infinite;
                transition:top 0.2s ease;
            `;
            if (!document.getElementById('hazmat-fcr-banner-style')) {
                const style = document.createElement('style');
                style.id = 'hazmat-fcr-banner-style';
                style.textContent = `@keyframes hazmatBannerPulse { 0%,100% { filter:brightness(1); } 50% { filter:brightness(1.12); } }`;
                document.head.appendChild(style);
            }
            banner.addEventListener('click', (e) => {
                if (e.target.closest('#hazmat-inventory-fcr-banner-close')) return;
                const chip = document.getElementById('inventoryHazmatChip');
                if (chip) chip.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            document.body.appendChild(banner);
        }
        // Chaque ASIN affiché avec son niveau hazmat, ex: "B0GJ91LZLF (Niv. 0)"
        const list = forbiddenEntries.slice(0, 5)
            .map(e => `${e.asin}${(e.level !== null && e.level !== undefined && e.level !== '') ? ` (Niv.&nbsp;${e.level})` : ''}`)
            .join(', ') + (forbiddenEntries.length > 5 ? '…' : '');
        banner.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;max-width:1100px;margin:0 auto;">
                <span style="font-size:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));">🚫</span>
                <span style="font-weight:800;letter-spacing:0.4px;">HAZMAT INTERDIT DANS L'INVENTAIRE</span>
                <span style="background:rgba(0,0,0,0.28);border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">${forbiddenEntries.length} ASIN</span>
                <span style="font-size:11px;font-weight:500;opacity:0.92;">${list}</span>
            </div>
            <span id="hazmat-inventory-fcr-banner-close" title="Fermer" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); cursor:pointer; font-size:13px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:rgba(0,0,0,0.22); opacity:0.9;">✕</span>
        `;
        banner.querySelector('#hazmat-inventory-fcr-banner-close').addEventListener('click', (e) => {
            e.stopPropagation();
            banner.remove();
            fcrReflowHazmatBanners();
        });
        fcrReflowHazmatBanners();
    }

    function removeInventoryHazmatBanner() {
        const banner = document.getElementById('hazmat-inventory-fcr-banner');
        if (banner) { banner.remove(); fcrReflowHazmatBanners(); }
    }

    // Dernier résultat du scan inventaire (tableau d'objets { asin, level }),
    // conservé pour pouvoir ré-appliquer le filtre anti-doublon dès que le
    // bandeau produit apparaît/disparaît, sans relancer de recherche.
    let lastInventoryForbidden = [];

    // Affiche le bandeau inventaire en excluant l'ASIN déjà couvert par le
    // bandeau "produit" (fiche ASIN unique) — évite le double bandeau pour
    // la même alerte quand on est sur la fiche de l'ASIN en question.
    function renderInventoryHazmatBanner() {
        const activeAsin = fcrActiveProductHazmat ? fcrActiveProductHazmat.asin : null;
        const toShow = activeAsin ? lastInventoryForbidden.filter(e => e.asin !== activeAsin) : lastInventoryForbidden;
        if (toShow.length > 0) showInventoryHazmatBanner(toShow);
        else removeInventoryHazmatBanner();
    }

    function addInventoryHazmatIndicator() {
        if (!isModuleEnabled('hazmat')) return;
        const inventoryHeader = document.querySelector('[data-section-type="inventory"] .section-title');
        if (!inventoryHeader || document.getElementById('inventoryHazmatChip')) return;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.id = 'inventoryHazmatChip';
        chip.className = 'LoadPrep-button';
        chip.textContent = '☢️ Hazmat : —';
        chip.title = "Cliquer pour (re)vérifier le hazmat de l'inventaire";
        chip.addEventListener('click', scanInventoryHazmat);
        inventoryHeader.appendChild(chip);
        // Scan automatique peu après le chargement de la table
        setTimeout(scanInventoryHazmat, 1200);
    }

    let inventoryHazmatScanning = false;
    async function scanInventoryHazmat() {
        if (inventoryHazmatScanning) return;
        const chip = document.getElementById('inventoryHazmatChip');
        if (!chip) return;
        inventoryHazmatScanning = true;
        chip.disabled = true;
        chip.textContent = '☢️ Hazmat : vérification...';
        chip.style.color = '';
        try {
            const fc = getFCFromURL() || FC || 'ETZ2';
            const rows = document.querySelectorAll('#table-inventory tbody tr');
            const asinSet = new Set();
            rows.forEach(row => {
                const asinCellParent = fcrGetInventoryCell(row, 'asin', 1);
                const asinCell = asinCellParent ? asinCellParent.querySelector('a') : null;
                const asin = asinCell ? asinCell.innerText.trim() : '';
                if (asin) asinSet.add(asin);
            });
            // On ne garde que les ASIN pas encore en cache pour l'affichage "vérification…",
            // mais on interroge quand même fetchAsinHazmatLevel pour tous : le cache partagé
            // (getHazmatFullData) renvoie instantanément les ASIN déjà connus, sans requête réseau.
            const asins = Array.from(asinSet);

            if (asins.length === 0) {
                chip.textContent = '☢️ Hazmat : aucun item';
                return;
            }

            const forbidden = [], warning = [];
            await runWithConcurrencyLimit(asins, 4, (asin) => new Promise(resolve => {
                fetchAsinHazmatLevel(asin, fc, (result) => {
                    const levelNum = parseInt(result && result.level);
                    if (!isNaN(levelNum)) {
                        if (levelNum === 0 || levelNum === 6) forbidden.push({ asin, level: result.level });
                        else if (levelNum === 5) warning.push({ asin, level: result.level });
                    }
                    resolve();
                });
            }));

            lastInventoryForbidden = forbidden;

            if (forbidden.length > 0) {
                const asinList = forbidden.map(e => e.asin);
                chip.textContent = `🚫 ${forbidden.length} HAZMAT INTERDIT !`;
                chip.style.color = '#ff4d4d';
                chip.title = `ASIN interdit(s) détecté(s) dans l'inventaire : ${forbidden.map(e => `${e.asin} (Niv. ${e.level})`).join(', ')}`;
                renderInventoryHazmatBanner();
            } else if (warning.length > 0) {
                const asinList = warning.map(e => e.asin);
                chip.textContent = `⚠️ ${warning.length} Hazmat niveau 5`;
                chip.style.color = '#f39c12';
                chip.title = `ASIN à surveiller (niveau 5) : ${asinList.join(', ')}`;
                removeInventoryHazmatBanner();
            } else {
                chip.textContent = '✅ Hazmat OK';
                chip.style.color = '#3df70a';
                chip.title = `${asins.length} ASIN vérifié(s), aucun hazmat interdit détecté.`;
                removeInventoryHazmatBanner();
            }
        } catch (error) {
            chip.textContent = '☢️ Hazmat : erreur';
            chip.style.color = 'red';
            console.error('Erreur scan hazmat inventaire:', error);
        } finally {
            chip.disabled = false;
            inventoryHazmatScanning = false;
        }
    }

    // ════════════════════════════════════════════════════════════════
    // ===== ÉTAGE (FLOOR) DANS LE TABLEAU INVENTORY — BADGE INLINE =====
    // ════════════════════════════════════════════════════════════════
    // v2 : on n'ajoute PLUS de colonne dans le tableau (thead/colgroup),
    // ce qui provoquait des lignes d'en-tête dupliquées à chaque tri sur
    // une autre colonne — DataTables reconstruit son header d'une façon
    // qu'on n'a pas réussi à anticiper de manière fiable en modifiant sa
    // structure de l'extérieur. À la place : un petit badge "Étage X" est
    // simplement ajouté DANS la cellule "Container" déjà existante (on ne
    // touche à aucune structure de table, donc DataTables n'a plus aucune
    // raison de se comporter différemment lors d'un tri). Le tri "par
    // étage" se fait via un bouton dédié dans la barre d'outils, qui
    // réordonne manuellement les lignes déjà affichées.
    const fcrPodRegex = /P-\d-([A-Z]\d{3}){2}/;
    const fcrPodFloorCache = {};

    function fcrParsePODLocation(locationStr) {
        const parts = locationStr.split(',').map(p => p.trim());
        // La cellule source contient souvent un libellé ("Floor: 2") plutôt
        // que la valeur seule : on ne garde que ce qui suit les ":" s'il y en a.
        const stripLabel = (s) => {
            if (!s) return '';
            const m = s.match(/:\s*(.+)$/);
            return (m ? m[1] : s).trim();
        };
        return {
            floor: stripLabel(parts[0]),
            aisle: stripLabel(parts[1]),
            shelf: stripLabel(parts[2]),
            slot:  stripLabel(parts[3]),
        };
    }

    function fcrGetPODFloor(containerId) {
        const podMatch = containerId.match(fcrPodRegex);
        if (!podMatch) return Promise.resolve(null);
        const pod = podMatch[0];
        if (fcrPodFloorCache[pod]) return Promise.resolve(fcrPodFloorCache[pod]);
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                url: window.location.href.replace(/\?.+/g, '/container-hierarchy?s=' + pod),
                method: 'GET',
                withCredentials: true,
                onload: function(response) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');
                        const floorCell = doc.querySelector('div.a-span6:nth-child(1) > table:nth-child(1) > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(2)');
                        const locationStr = floorCell ? floorCell.textContent.trim() : '';
                        const location = fcrParsePODLocation(locationStr);
                        fcrPodFloorCache[pod] = location;
                        resolve(location);
                    } catch (e) { resolve(null); }
                },
                onerror: function() { resolve(null); }
            });
        });
    }

    // ── Tri manuel par étage (bouton dédié, indépendant de DataTables) ──
    let fcrFloorSortDir = null; // null | 'asc' | 'desc'

    function fcrFloorSortButtonLabel() {
        if (fcrFloorSortDir === 'asc')  return '🗺️ Étage ▲';
        if (fcrFloorSortDir === 'desc') return '🗺️ Étage ▼';
        return '🗺️ Trier par étage';
    }

    function fcrSortRowsByFloor(dir) {
        const tbody = document.querySelector('#table-inventory tbody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (!rows.length) return;

        const getVal = (row) => {
            const raw = row.dataset.fcrFloor;
            if (raw === undefined || raw === '') return null;
            const n = parseFloat(raw);
            return isNaN(n) ? raw : n;
        };

        rows.sort((a, b) => {
            const va = getVal(a), vb = getVal(b);
            if (va === null && vb === null) return 0;
            if (va === null) return 1;  // pas d'étage résolu -> toujours en dernier
            if (vb === null) return -1;
            if (va < vb) return dir === 'asc' ? -1 : 1;
            if (va > vb) return dir === 'asc' ? 1 : -1;
            return 0;
        });

        // Déplace les <tr> existants dans le nouvel ordre (pas de clone/duplication).
        rows.forEach(row => tbody.appendChild(row));
    }

    function fcrToggleFloorSort() {
        fcrFloorSortDir = fcrFloorSortDir === 'asc' ? 'desc' : (fcrFloorSortDir === 'desc' ? null : 'asc');
        const btn = document.getElementById('floorSortButton');
        if (btn) btn.textContent = fcrFloorSortButtonLabel();
        if (fcrFloorSortDir) fcrSortRowsByFloor(fcrFloorSortDir);
    }

    function addFloorSortButton() {
        if (!isModuleEnabled('binFloor')) return;
        const inventoryHeader = document.querySelector('[data-section-type="inventory"] .section-title');
        if (!inventoryHeader || document.getElementById('floorSortButton')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'floorSortButton';
        button.className = 'LoadPrep-button';
        button.textContent = fcrFloorSortButtonLabel();
        button.title = 'Trie les bins actuellement affichés par étage (tri local, indépendant du tri natif du tableau)';
        button.addEventListener('click', fcrToggleFloorSort);
        inventoryHeader.appendChild(button);
    }

    function fcrProcessFloorRow(row) {
        const firstTd = row.querySelector('td');
        if (!firstTd) return;
        // Badge déjà posé sur cette ligne : rien à refaire. On n'ajoute
        // jamais de <td>/<th> ni ne touche au colgroup, donc il n'y a
        // structurellement aucune duplication possible ici.
        if (firstTd.querySelector('.fcr-floor-badge')) return;

        const containerLink = firstTd.querySelector('a');
        const containerId = (containerLink ? containerLink.textContent : firstTd.textContent).trim();

        if (!fcrPodRegex.test(containerId)) {
            row.dataset.fcrFloor = ''; // pas de bin POD -> ira en fin de tri, rien à afficher
            return;
        }

        const badge = document.createElement('span');
        badge.className = 'fcr-floor-badge';
        badge.style.cssText = 'display:inline-block; margin-left:8px; padding:1px 6px; border-radius:4px; font-size:11px; font-weight:700; background:rgba(120,120,120,0.35); vertical-align:middle; white-space:nowrap;';
        badge.textContent = '…';
        row.dataset.fcrFloor = ''; // en attente de résolution
        firstTd.appendChild(badge);

        fcrGetPODFloor(containerId).then(location => {
            const floorVal = (location && location.floor) ? location.floor : '';
            badge.textContent = floorVal ? `Étage ${floorVal}` : '?';
            if (location && location.floor) badge.title = `${location.floor}, ${location.aisle || '-'}, ${location.shelf || '-'}, ${location.slot || '-'}`;
            if (!floorVal) badge.style.opacity = '0.5';
            row.dataset.fcrFloor = floorVal;
            // Si un tri par étage est actif, cette ligne reprend sa place
            // dès que sa valeur (souvent déjà en cache) est connue.
            if (fcrFloorSortDir) fcrSortRowsByFloor(fcrFloorSortDir);
        });
    }

    let fcrFloorRowObserver = null;
    function fcrInjectBinFloorColumn() {
        if (!isModuleEnabled('binFloor')) return;
        const table = document.querySelector('#table-inventory');
        if (!table) return;
        addFloorSortButton();
        const tbody = table.querySelector('tbody');
        if (!tbody) return;
        tbody.querySelectorAll('tr').forEach(fcrProcessFloorRow);

        // DataTables redessine parfois tout le tbody (tri, pagination) : on
        // observe pour poser le badge sur les nouvelles lignes uniquement.
        if (!fcrFloorRowObserver) {
            fcrFloorRowObserver = new MutationObserver(debounce(() => {
                if (!isModuleEnabled('binFloor')) return;
                const tb = document.querySelector('#table-inventory tbody');
                if (tb) tb.querySelectorAll('tr').forEach(fcrProcessFloorRow);
            }, 150));
            fcrFloorRowObserver.observe(tbody, { childList: true });
        }
    }

    // ===== OBSERVERS POUR LES BOUTONS INVENTORY =====
    // ════════════════════════════════════════════════════════════════
    // Perf : mutualisé sur l'observer racine partagé (fcrOnRootMutation)
    // au lieu d'un MutationObserver dédié sur main/#content.
    // Debounce 800ms pour éviter les déclenchements en rafale.
    fcrOnRootMutation(debounce(() => {
        const hasInventory = !!document.querySelector('[data-section-type="inventory"]');
        const hasHistory   = !!document.querySelector('#table-inventory-history');
        const hasCsvBtn    = !!document.getElementById('csvExportButton');
        const hasWeightBtn = !!document.getElementById('weightButton');
        const hasTotalPriceBtn = !!document.getElementById('totalPriceButton');
        const hasHazmatChip = !!document.getElementById('inventoryHazmatChip');
        const hasHistoryBtn = !!document.getElementById('csvHistoryButton');

        if (hasInventory) {
            if (!hasWeightBtn)     addWeightButton();
            if (!hasCsvBtn)        addCsvExportButton();
            if (!hasTotalPriceBtn) addTotalPriceButton();
            if (!hasHazmatChip)    addInventoryHazmatIndicator();
            fcrInjectBinFloorColumn();
        }
        if (hasHistory && !hasHistoryBtn) addCsvHistoryButton();
    }, 800)); // debounce augmenté 500→800ms

    setTimeout(() => {
        if (document.querySelector('[data-section-type="inventory"]')) { addWeightButton(); addCsvExportButton(); addTotalPriceButton(); addInventoryHazmatIndicator(); fcrInjectBinFloorColumn(); }
        if (document.querySelector('#table-inventory-history')) addCsvHistoryButton();
    }, 2500);

    // ════════════════════════════════════════════════════════════════
    // ===== PROBLEM WIDGET — FAB flottant résumé des problèmes =====
    // Lit #table-problems, affiche les 3 plus récents (tous types confondus, triés par date)
    // ════════════════════════════════════════════════════════════════
    (function() {

        // ── Colonnes attendues dans #table-problems (index 0-based) ──
        // Problem Id | Location | Creator | Status | Creation Date | Created By | Symptoms
        const COL = { id: 0, location: 1, creator: 2, status: 3, date: 4, createdBy: 5, symptoms: 6 };

        const STATUS_COLOR = {
            'Resolved':              '#27ae60',
            'Spawned Child Workflows':'#3498db',
            'Open':                  '#e67e22',
            'Closed':                '#888',
        };

        function getStatusColor(status) {
            for (const key of Object.keys(STATUS_COLOR)) {
                if (status && status.toLowerCase().includes(key.toLowerCase())) return STATUS_COLOR[key];
            }
            return '#aaa';
        }

        function parseProblemDate(dateStr) {
            if (!dateStr) return null;
            const s = dateStr.trim();
            // "YYYY-MM-DD HH:MM:SS" ou "YYYY-MM-DDTHH:MM:SS"
            let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
            if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
            // "DD/MM/YYYY HH:MM:SS" (format FR éventuel)
            m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
            if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
            // "YYYY-MM-DD" seul
            m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
            // Dernier recours : parsing natif du navigateur
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        }

        function timeAgo(dateStr) {
            if (!dateStr) return '';
            const d = parseProblemDate(dateStr);
            if (!d) return dateStr;
            const diffMs  = Date.now() - d.getTime();
            const diffMin = Math.floor(diffMs / 60000);
            const diffH   = Math.floor(diffMin / 60);
            const diffD   = Math.floor(diffH / 24);
            if (diffMin < 1)  return "À l'instant";
            if (diffMin < 60) return `il y a ${diffMin} min`;
            if (diffH < 24)   return `il y a ${diffH}h${diffMin % 60 > 0 ? (diffMin % 60) + 'min' : ''}`;
            return `il y a ${diffD}j`;
        }

        function parseProblemsTable() {
            const table = document.querySelector('#table-problems');
            if (!table) return null;
            const rows = Array.from(table.querySelectorAll('tbody tr'));
            if (!rows.length) return null;

            const problems = rows.map(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 5) return null;
                return {
                    id:        (cells[COL.id]        || {}).textContent?.trim() || '',
                    location:  (cells[COL.location]  || {}).textContent?.trim() || '',
                    creator:   (cells[COL.creator]   || {}).textContent?.trim() || '',
                    status:    (cells[COL.status]    || {}).textContent?.trim() || '',
                    date:      (cells[COL.date]      || {}).textContent?.trim() || '',
                    createdBy: (cells[COL.createdBy] || {}).textContent?.trim() || '',
                    symptoms:  (cells[COL.symptoms]  || {}).textContent?.trim() || 'Unknown',
                };
            }).filter(Boolean);

            // Tri strictement chronologique (plus récent → plus ancien), tous types confondus.
            // Les dates non reconnues sont reléguées en fin de liste plutôt que de casser le tri.
            const recent = problems.slice().sort((a, b) => {
                const da = parseProblemDate(a.date);
                const db = parseProblemDate(b.date);
                if (!da && !db) return 0;
                if (!da) return 1;
                if (!db) return -1;
                return db.getTime() - da.getTime();
            }).slice(0, 3);

            return { recent, total: problems.length };
        }


        function buildProblemWidget() {
            if (document.getElementById('fcr-problem-fab')) return;
            const data = parseProblemsTable();
            if (!data) return; // Pas de table problems sur cette page

            const t = THEMES[currentTheme] || THEMES.bleu;
            const isDark = !t.isBase;
            const panelBg    = isDark ? (t.isGradient ? t.gradPanel : t.bg2) : '#fff';
            const headerBg   = isDark ? (t.isGradient ? t.gradHeader : t.bg3) : '#f5f5f5';
            const accentColor = isDark ? t.accent : '#cc0000';
            const textColor  = isDark ? '#d1d5db' : '#222';
            const borderColor = isDark ? t.accentDark : '#ddd';
            const subTextColor = isDark ? '#aab4c8' : '#666';

            const totalProblems = data.total;

            // ── FAB ──
            const fab = document.createElement('div');
            fab.id = 'fcr-problem-fab';
            fab.title = 'Problems résumé';
            fab.style.cssText = `
                position:fixed; bottom:216px; right:24px; z-index:99990;
                width:48px; height:48px; border-radius:50%;
                background:${isDark ? (t.isGradient ? t.gradBtn : t.bg3) : '#cc0000'};
                color:${accentColor}; font-size:20px;
                display:flex; align-items:center; justify-content:center;
                cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.4);
                border:2px solid ${accentColor};
                transition:transform 0.2s, box-shadow 0.2s;
                user-select:none; flex-direction:column; gap:0;
            `;
            fab.innerHTML = `<span style="font-size:18px;line-height:1;">⚠️</span>`;

            // Badge count
            const badge = document.createElement('span');
            badge.id = 'fcr-problem-badge';
            badge.textContent = totalProblems > 99 ? '99+' : totalProblems;
            badge.style.cssText = `
                position:absolute; top:-4px; right:-4px;
                background:#e74c3c; color:#fff; font-size:9px; font-weight:700;
                border-radius:10px; padding:1px 5px; min-width:16px; text-align:center;
                border:1px solid #fff; pointer-events:none;
            `;
            fab.style.position = 'fixed';
            fab.appendChild(badge);

            fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.12)'; });
            fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
            document.body.appendChild(fab);
            makeFcrFabDraggable(fab, 'problem');

            // ── Panneau ──
            const panel = document.createElement('div');
            panel.id = 'fcr-problem-panel';
            panel.style.cssText = `
                position:fixed; z-index:99989;
                border-radius:12px;
                background:${panelBg}; border:1px solid ${borderColor};
                box-shadow:0 8px 32px rgba(0,0,0,0.4);
                font-family:Arial,sans-serif; font-size:14px;
                display:none; flex-direction:column;
            `;
            fcrFitFabPanel(panel, 84, 216, 440, 560, true);
            window.addEventListener('resize', debounce(() => fcrFitFabPanel(panel, 84, 216, 440, 560, true), 150));

            // Header
            const header = document.createElement('div');
            header.style.cssText = `
                background:${headerBg}; padding:12px 16px;
                display:flex; align-items:center; justify-content:space-between;
                border-bottom:1px solid ${borderColor}; flex-shrink:0;
            `;
            header.innerHTML = `
                <span style="font-size:13px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.5px;">
                    ⚠️ PROBLEMS — ${totalProblems} entrée${totalProblems > 1 ? 's' : ''}
                </span>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span id="fcr-problem-refresh" title="Rafraîchir" style="cursor:pointer;font-size:14px;color:${accentColor};">🔄</span>
                    <span id="fcr-problem-close" style="cursor:pointer;color:${accentColor};font-size:16px;font-weight:700;line-height:1;" title="Fermer">✕</span>
                </div>
            `;

            // Body scrollable
            const body = document.createElement('div');
            body.id = 'fcr-problem-body';
            body.style.cssText = `padding:12px 16px; overflow-y:auto; flex:1;`;

            // Liste plate des 3 problèmes les plus récents (déjà triés du plus récent au plus ancien)
            data.recent.forEach((p, i) => {
                const statusColor = getStatusColor(p.status);
                const card = document.createElement('div');
                card.style.cssText = `
                    background:${isDark ? t.bg1 + 'cc' : '#f8f8f8'};
                    border:1px solid ${borderColor};
                    border-left:4px solid ${statusColor};
                    border-radius:7px; padding:10px 13px;
                    margin-bottom:8px; font-size:12px;
                `;

                // ID tronqué + copier
                const shortId = p.id.length > 40 ? '…' + p.id.slice(-30) : p.id;

                card.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:10px;font-weight:800;color:${accentColor};background:${accentColor}1a;border-radius:10px;padding:2px 7px;flex-shrink:0;">#${i + 1}</span>
                        <span style="color:${subTextColor};font-size:11px;font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;margin:0 8px;" title="${p.id}">${shortId}</span>
                        <span style="
                            font-size:11px;font-weight:700;padding:3px 8px;border-radius:10px;
                            background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}55;
                            white-space:nowrap;flex-shrink:0;
                        ">${p.status}</span>
                    </div>
                    <div style="color:${textColor};font-size:12px;font-weight:700;margin-bottom:4px;">${p.symptoms}</div>
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:2px;">
                        <span style="color:${textColor};font-size:12px;font-weight:600;">📍 ${p.location}</span>
                        <span style="color:${textColor};font-size:12px;font-weight:600;">👤 ${p.createdBy}</span>
                    </div>
                    <div style="color:${subTextColor};font-size:11px;margin-top:4px;" title="${p.date}">🕐 ${timeAgo(p.date)}</div>
                    ${p.creator && p.creator !== p.createdBy ? `<div style="color:${subTextColor};font-size:11px;margin-top:3px;">📂 ${p.creator}</div>` : ''}
                `;
                body.appendChild(card);
            });

            if (data.recent.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = `text-align:center; padding:20px; color:${subTextColor}; font-size:12px;`;
                empty.textContent = 'Aucun problème trouvé.';
                body.appendChild(empty);
            }

            panel.appendChild(header);
            panel.appendChild(body);
            document.body.appendChild(panel);

            // ── Toggle ──
            let isOpen = false;
            function togglePanel() {
                isOpen = !isOpen;
                panel.style.display = isOpen ? 'flex' : 'none';
            }

            fab.addEventListener('click', togglePanel);
            panel.querySelector('#fcr-problem-close').addEventListener('click', togglePanel);
            header.style.cursor = 'pointer';
            header.title = 'Cliquer pour fermer';
            header.addEventListener('click', (e) => {
                if (e.target.closest('#fcr-problem-close, #fcr-problem-refresh')) return;
                togglePanel();
            });

            // Rafraîchir
            panel.querySelector('#fcr-problem-refresh').addEventListener('click', () => {
                document.getElementById('fcr-problem-panel')?.remove();
                document.getElementById('fcr-problem-fab')?.remove();
                setTimeout(buildProblemWidget, 200);
            });
        }

        // Restyle du widget sur changement de thème
        function problemWidget_restyle() {
            const fab   = document.getElementById('fcr-problem-fab');
            const panel = document.getElementById('fcr-problem-panel');
            if (!fab && !panel) return;
            // On reconstruit simplement le widget (plus simple que restyler manuellement)
            const wasOpen = panel?.style.display !== 'none';
            document.getElementById('fcr-problem-panel')?.remove();
            document.getElementById('fcr-problem-fab')?.remove();
            setTimeout(() => {
                buildProblemWidget();
                if (wasOpen) {
                    const newPanel = document.getElementById('fcr-problem-panel');
                    if (newPanel) newPanel.style.display = 'flex';
                }
            }, 50);
        }

        // Exposer pour applyTheme
        window._fcrProblemRestyle = problemWidget_restyle;

        // Init
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(buildProblemWidget, 2000));
        } else {
            setTimeout(buildProblemWidget, 2500);
        }

        // Observer : réinjecter si la table apparaît dynamiquement
        // Perf : mutualisé sur l'observer racine partagé (fcrOnRootMutation)
        // au lieu d'un MutationObserver dédié.
        let probDebounce = null;
        fcrOnRootMutation(() => {
            clearTimeout(probDebounce);
            probDebounce = setTimeout(() => {
                if (!document.getElementById('fcr-problem-fab') && document.querySelector('#table-problems')) {
                    buildProblemWidget();
                }
            }, 800);
        });

    })();

    // ════════════════════════════════════════════════════════════════
    // ===== MODULE ÉTIQUETTES (fusionné depuis Etiquette Print Standalone)
    // Impression via window.print() — boîte de dialogue Windows
    // Suit le thème FCR Lite Ultra via etiq2_restyle(t)
    // ════════════════════════════════════════════════════════════════

    const ETIQUETTES = {
        'Damage': [
            { action: 'Collecte Damage', label: 'ICQA Damage' },
            { action: 'Collecte Damage', label: 'Defective Recall' },
            { action: 'Collecte Damage', label: 'Damage InQuarantine' },
            { action: 'Collecte Damage', label: 'Defective PS' },
            { action: 'Collecte Damage', label: 'Suspicion Vol' },
            { action: 'Collecte Damage', label: 'NS/Transparency issue' },
        ],
        'Prep': [
            { action: 'Collecte Sweep', label: 'Prep Bubble' },
            { action: 'Collecte Sweep', label: 'Prep stickering' },
            { action: 'Collecte Sweep', label: 'Prep Bagging' },
            { action: 'Collecte Sweep', label: 'Prep Boxing' },
            { action: 'Collecte Sweep', label: 'Prep Cap_Sealing' },
            { action: 'Collecte Sweep', label: 'Prep taping' },
            { action: 'Collecte Sweep', label: 'Prep Opaque' },
        ],
        'TT': [
            { action: 'Collecte Sweep', label: 'TT - No PO' },
            { action: 'Collecte Sweep', label: 'TT - Not In PO' },
            { action: 'Collecte Sweep', label: 'TT - Wrong Title' },
            { action: 'Collecte Sweep', label: 'TT - Wrong Image' },
            { action: 'Collecte Sweep', label: 'TT - Description Product' },
            { action: 'Collecte Sweep', label: 'TT - No Barcode' },
            { action: 'Collecte Sweep', label: 'TT - Multiple Scannable Barcode' },
            { action: 'Collecte Sweep', label: 'TT - EAN Mislinked' },
            { action: 'Collecte Sweep', label: 'TT - EAN not linked' },
            { action: 'Collecte Sweep', label: 'TT - Expiration date' },
        ],
        'HAZMAT': [
            { action: 'Collecte Sweep', label: 'TT - HAZMAT Level 6' },
            { action: 'Collecte Sweep', label: 'TT - HAZMAT Level 0' },
            { action: 'Collecte Sweep', label: 'Hazmat Level 5' },
        ],
        'Inbound': [
            { action: 'Collecte STOW', label: 'CUBI' },
            { action: 'Collecte STOW', label: 'Tote Sale' },
            { action: 'Collecte STOW', label: 'Tote Cassée' },
        ],
        'Non Sort': [
            { action: 'Collecte Sweep', label: 'Non Sort' },
            { action: 'Collecte Sweep', label: 'Non Sort  XFRE' },
            { action: 'Collecte Sweep', label: 'Non Sort  XFRJ' },
            { action: 'Collecte Sweep', label: 'Non Sort  XOR4' },
            { action: 'Collecte Sweep', label: 'Non Sort  XOS1' },
        ],
        'DA': [
            { action: 'Collecte Sweep', label: 'DA à faire' },
            { action: 'Collecte Sweep', label: 'Da en attente approval' },
            { action: 'Collecte Sweep', label: 'DA :' },
        ],
    };

    const ETIQ_CAT_ICONS = {
        'Damage':   '💥',
        'Prep':     '📦',
        'TT':       '🔄',
        'HAZMAT':   '☢️',
        'Inbound':  '📥',
        'Non Sort': '🚫',
        'DA':       '📋',
    };

    function etiq2_getThemeVars(t) {
        const isDark = t && !t.isBase;
        return {
            isDark,
            panelBg:     isDark ? (t.isGradient ? t.gradPanel : t.bg2)  : '#fff',
            headerBg:    isDark ? (t.isGradient ? t.gradHeader : t.bg3) : '#f5f5f5',
            accentColor: isDark ? t.accent : '#ff9900',
            textColor:   isDark ? '#d1d5db' : '#333',
            borderColor: isDark ? t.accentDark : '#ddd',
            inputBg:     isDark ? t.bg1 : '#fff',
        };
    }

    // Restyle appelé par applyTheme() à chaque changement de thème
    function etiq2_restyle(t) {
        const v = etiq2_getThemeVars(t);
        const panel = document.getElementById('etiq2-panel');
        const fab   = document.getElementById('etiq2-fab');
        if (!panel || !fab) return;

        panel.style.background   = v.panelBg;
        panel.style.borderColor  = v.borderColor;

        const header = panel.querySelector('#etiq2-header');
        if (header) {
            header.style.background   = v.headerBg;
            header.style.borderColor  = v.borderColor;
        }
        const headerLabel = panel.querySelector('#etiq2-header-label');
        if (headerLabel) headerLabel.style.color = v.accentColor;
        const closeBtn = panel.querySelector('#etiq2-close');
        if (closeBtn) closeBtn.style.color = v.accentColor;

        fab.style.background  = v.isDark ? (t.isGradient ? t.gradBtn : t.bg3) : '#ff9900';
        fab.style.borderColor = v.accentColor;
        fab.style.color       = v.accentColor;

        panel.querySelectorAll('label').forEach(el => el.style.color = v.textColor);
        panel.querySelectorAll('input, select').forEach(el => {
            el.style.background   = v.inputBg;
            el.style.color        = v.textColor;
            el.style.borderColor  = v.borderColor;
        });

        const printBtn = document.getElementById('etiq2-print-btn');
        if (printBtn) {
            printBtn.style.background  = v.accentColor;
            printBtn.style.borderColor = v.accentColor;
        }

        const sigPreview = document.getElementById('etiq2-sig-preview');
        if (sigPreview) {
            sigPreview.style.background  = v.isDark ? t.bg1 : '#f8f8f8';
            sigPreview.style.borderColor = v.borderColor;
            sigPreview.style.color       = v.isDark ? '#aaa' : '#888';
        }
    }

    function etiq2_escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function etiq2_getShift()   { return GM_getValue('etiShift', ''); }
    function etiq2_getDateStr() { const d = new Date(); return `${d.getDate()}/${d.getMonth()+1}`; }
    function etiq2_getLogin()   { return getCookie('fcmenu-employeeLogin') || ''; }

    function etiq2_buildSignature() {
        const parts = [];
        const login = etiq2_getLogin();
        const shift = etiq2_getShift();
        if (login) parts.push('@' + login);
        if (shift) parts.push(shift);
        parts.push(etiq2_getDateStr());
        return parts.join(' ');
    }




    function etiq2_print(etiquette, quantity) {
        const sig    = etiq2_buildSignature();
        const action = etiq2_escapeHTML(etiquette.action.trim());
        const label  = etiq2_escapeHTML(etiquette.label.trim());
        const sigEsc = etiq2_escapeHTML(sig);
        const qty    = Math.max(1, parseInt(quantity) || 1);

        const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');

        // ── CSS Chrome — valeurs issues de print_label_bon_forma_chrome ──
        const cssChrome = `
    @page { size: 104mm 76.2mm; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; font-family: Arial, sans-serif; width: 104mm; }
    .etq-page { width: 104mm; height: 76.2mm; page-break-after: always; margin: 0; padding: 0; overflow: hidden; position: relative; }
    .etq-page:last-child { page-break-after: auto; }
    .etq-cell {
        position: absolute;
        top: -10mm; left: 40mm; right: -10mm; bottom: 3mm;
        box-sizing: border-box;
        border: 2px solid #000;
        background: #ffffff;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        text-align: center;
        padding: 4mm 5mm; gap: 2.5mm;
    }
    .etq-action { font-size:14pt; font-weight:bold; color:#000; line-height:1.1; }
    .etq-title  { font-size:33pt; font-weight:bold; color:#000; line-height:1.05; word-wrap:break-word; }
    .etq-sig    { font-size:18pt; font-weight:bold; color:#000; line-height:1.1; }`;

        // ── CSS Firefox (fenêtre réelle) — étiquette 50x35mm ───────────
        const cssFirefox = `
    @page { size: 50mm 35mm portrait; margin: 0; }
    * { box-sizing: border-box; }
    html { margin:0; padding:0; }
    body { margin:0; padding:0; font-family:Arial,sans-serif; }
    .etq-page { width:100vw; height:100vh; page-break-after:always; overflow:hidden; position:relative; display:flex; align-items:center; justify-content:center; }
    .etq-page:last-child { page-break-after:auto; }
    .etq-cell {
        width:90%; height:90%;
        box-sizing:border-box; background:#fff;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        text-align:center; padding:2% 3%; gap:2%;
        margin-top:-20mm;
        margin-left:25mm;
    }
    .etq-action { font-size:16pt;  font-weight:bold; color:#000; }
    .etq-title  { font-size:23pt; font-weight:bold; color:#000; word-wrap:break-word; }
    .etq-sig    { font-size:15.5pt;  font-weight:bold; color:#000; }`;

        let pages = '';
        for (let i = 0; i < qty; i++) {
            pages += `<div class="etq-page"><div class="etq-cell"><div class="etq-action">${action}</div><div class="etq-title">${label}</div><div class="etq-sig">${sigEsc}</div></div></div>`;
        }

        const printHTML = (css, isChr) => {
            const viewport = isChr
                ? '<meta name="viewport" content="width=device-width,initial-scale=1.0">'
                : '';
            return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title>${viewport}<style>${css}</style></head><body>${pages}</body></html>`;
        };

        if (isFirefox) {
            // Fenêtre visible normale — Firefox respecte @page dans ce contexte
            const w = window.open('', '_blank', 'width=800,height=600');
            if (!w) { alert('Veuillez autoriser les popups pour imprimer.'); return; }
            w.document.open();
            w.document.write(printHTML(cssFirefox, false));
            w.document.close();
            w.addEventListener('load', function() {
                setTimeout(function() {
                    w.focus();
                    if (typeof fcrActivityTrack === 'function') fcrActivityTrack('impression');
                    w.print();
                    setTimeout(function() { try { w.close(); } catch(e) {} }, 3000);
                }, 300);
            });
        } else {
            // Chrome : iframe caché (méthode de print_label_bon_forma_chrome)
            try {
                const iframe = document.createElement('iframe');
                iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
                document.body.appendChild(iframe);
                const doc = iframe.contentWindow.document;
                doc.open();
                doc.write(printHTML(cssChrome, false));
                doc.close();
                iframe.onload = function() {
                    try {
                        iframe.contentWindow.focus();
                        if (typeof fcrActivityTrack === 'function') fcrActivityTrack('impression');
                        iframe.contentWindow.print();
                    } catch(e) {
                        const w = window.open('', '_blank', 'width=500,height=400');
                        if (w) { w.document.write(printHTML(cssChrome, false)); w.document.close(); }
                    }
                    setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 2000);
                };
            } catch(e) {
                const w = window.open('', '_blank', 'width=500,height=400');
                if (w) { w.document.write(printHTML(cssChrome, false)); w.document.close(); }
            }
        }
    }

    function etiq2_showFeedback(msg, color) {
        const btn = document.getElementById('etiq2-print-btn');
        if (!btn) return;
        const orig = btn.textContent, origBg = btn.style.background;
        btn.textContent = msg; btn.style.background = color;
        setTimeout(() => { btn.textContent = orig; btn.style.background = origBg; }, 2000);
    }

    function etiq2_buildPanel() {
        if (document.getElementById('etiq2-panel')) return;

        const t = THEMES[currentTheme] || THEMES.bleu;
        const v = etiq2_getThemeVars(t);

        // ── FAB ──────────────────────────────────────────────────────
        const fab = document.createElement('div');
        fab.id = 'etiq2-fab';
        fab.title = 'Étiquettes';
        fab.innerHTML = '🏷️';
        fab.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:99990;
            width:48px; height:48px; border-radius:50%;
            background:${v.isDark ? (t.isGradient ? t.gradBtn : t.bg3) : '#ff9900'};
            color:${v.accentColor}; font-size:22px;
            display:flex; align-items:center; justify-content:center;
            cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.35);
            border:2px solid ${v.accentColor};
            transition:transform 0.2s, box-shadow 0.2s;
            user-select:none;
        `;
        fab.addEventListener('mouseenter', () => { fab.style.transform='scale(1.12)'; });
        fab.addEventListener('mouseleave', () => { fab.style.transform='scale(1)'; });
        fab.addEventListener('click', etiq2_toggle);
        document.body.appendChild(fab);
        makeFcrFabDraggable(fab, 'etiquettes');

        // ── Panneau ──────────────────────────────────────────────────
        const panel = document.createElement('div');
        panel.id = 'etiq2-panel';
        panel.style.cssText = `
            position:fixed; z-index:99989;
            border-radius:12px;
            background:${v.panelBg}; border:1px solid ${v.borderColor};
            box-shadow:0 8px 32px rgba(0,0,0,0.4);
            font-family:Arial,sans-serif; font-size:13px;
            display:none;
        `;
        fcrFitFabPanel(panel, 84, 24, 310, 560, true);
        window.addEventListener('resize', debounce(() => fcrFitFabPanel(panel, 84, 24, 310, 560, true), 150));

        // Header
        const header = document.createElement('div');
        header.id = 'etiq2-header';
        header.style.cssText = `
            background:${v.headerBg}; padding:10px 14px;
            display:flex; align-items:center; justify-content:space-between;
            border-bottom:1px solid ${v.borderColor};
        `;
        header.innerHTML = `
            <span id="etiq2-header-label" style="font-size:11px;font-weight:700;color:${v.accentColor};text-transform:uppercase;letter-spacing:0.5px;">🏷️ IMPRIMER ÉTIQUETTE</span>
            <span id="etiq2-close" style="cursor:pointer;color:${v.accentColor};font-size:16px;font-weight:700;line-height:1;" title="Fermer">✕</span>
        `;
        header.querySelector('#etiq2-close').addEventListener('click', etiq2_toggle);
        header.style.cursor = 'pointer';
        header.title = 'Cliquer pour fermer';
        header.addEventListener('click', (e) => {
            if (e.target.closest('#etiq2-close')) return;
            etiq2_toggle();
        });
        panel.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding:14px;display:flex;flex-direction:column;gap:10px;';

        // Shift
        const shiftRow = document.createElement('div');
        shiftRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        shiftRow.innerHTML = `
            <label style="font-size:11px;font-weight:600;color:${v.textColor};min-width:70px;">Mon Shift</label>
            <input id="etiq2-shift-input" type="text" placeholder="ex: IC1, O1, O3…"
                value="${etiq2_escapeHTML(etiq2_getShift())}"
                style="flex:1;padding:5px 8px;border-radius:5px;border:1px solid ${v.borderColor};background:${v.inputBg};color:${v.textColor};font-size:12px;outline:none;" />
        `;
        body.appendChild(shiftRow);

        // Signature preview
        const sigPreview = document.createElement('div');
        sigPreview.id = 'etiq2-sig-preview';
        sigPreview.style.cssText = `
            font-size:11px; color:${v.isDark ? '#aaa' : '#888'};
            padding:4px 8px; background:${v.isDark ? t.bg1 : '#f8f8f8'};
            border-radius:4px; border:1px solid ${v.borderColor};
            font-family:monospace;
        `;
        sigPreview.textContent = etiq2_buildSignature() || '(login non détecté)';
        body.appendChild(sigPreview);

        shiftRow.querySelector('#etiq2-shift-input').addEventListener('input', function() {
            GM_setValue('etiShift', this.value.trim().toUpperCase());
            sigPreview.textContent = etiq2_buildSignature() || '(login non détecté)';
        });

        const sep = document.createElement('hr');
        sep.style.cssText = `border:none;border-top:1px solid ${v.borderColor};margin:0;`;
        body.appendChild(sep);

        // ── Favoris ──────────────────────────────────────────────────
        const FAVORITES = [
            { cat: 'Inbound',  idx: 0, icon: '📥', label: 'INBOUND CUBI'  },  // Inbound → CUBI (index 0)
            { cat: 'Damage',   idx: 0, icon: '💥', label: 'ICQA DAMAGE'   },  // Damage  → ICQA Damage (index 0)
        ];
        const favRow = document.createElement('div');
        favRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap;';
        const favLbl = document.createElement('span');
        favLbl.textContent = '⭐ Favoris';
        favLbl.style.cssText = `font-size:11px;font-weight:600;color:${v.textColor};min-width:70px;`;
        favRow.appendChild(favLbl);
        FAVORITES.forEach(fav => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = `${fav.icon} ${fav.label}`;
            btn.title = `Imprimer 1× ${fav.label}`;
            btn.style.cssText = `
                padding:4px 9px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:700;
                border:1px solid ${v.accentColor};background:${v.isDark ? (t.isGradient ? t.gradBtn : t.bg3) : '#fff3dc'};
                color:${v.accentColor};transition:background 0.15s,color 0.15s;white-space:nowrap;
            `;
            btn.addEventListener('mouseenter', () => { btn.style.background = v.accentColor; btn.style.color = '#fff'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = v.isDark ? (t.isGradient ? t.gradBtn : t.bg3) : '#fff3dc'; btn.style.color = v.accentColor; });
            btn.addEventListener('click', () => {
                const eti = (ETIQUETTES[fav.cat] || [])[fav.idx];
                if (!eti) return;
                const qtyEl = document.getElementById('etiq2-qty');
                const qty = parseInt(qtyEl ? qtyEl.value : '1') || 1;
                try {
                    etiq2_print(eti, qty);
                    etiq2_showFeedback('✓ Envoyé à l\'impression', '#27ae60');
                } catch(e) {
                    etiq2_showFeedback('✗ Erreur', '#e74c3c');
                }
            });
            favRow.appendChild(btn);
        });
        body.appendChild(favRow);

        const sep2 = document.createElement('hr');
        sep2.style.cssText = `border:none;border-top:1px solid ${v.borderColor};margin:0;`;
        body.appendChild(sep2);

        // Catégorie
        const catRow = document.createElement('div');
        catRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        catRow.innerHTML = `
            <label style="font-size:11px;font-weight:600;color:${v.textColor};min-width:70px;">Catégorie</label>
            <select id="etiq2-cat-select" style="flex:1;padding:5px 8px;border-radius:5px;border:1px solid ${v.borderColor};background:${v.inputBg};color:${v.textColor};font-size:12px;cursor:pointer;">
                ${Object.keys(ETIQUETTES).map(cat => `<option value="${cat}">${ETIQ_CAT_ICONS[cat]||''} ${cat}</option>`).join('')}
            </select>
        `;
        body.appendChild(catRow);

        // Étiquette
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        labelRow.innerHTML = `
            <label style="font-size:11px;font-weight:600;color:${v.textColor};min-width:70px;">Étiquette</label>
            <select id="etiq2-label-select" style="flex:1;padding:5px 8px;border-radius:5px;border:1px solid ${v.borderColor};background:${v.inputBg};color:${v.textColor};font-size:12px;cursor:pointer;"></select>
        `;
        body.appendChild(labelRow);

        // Aperçu
        const preview = document.createElement('div');
        preview.id = 'etiq2-label-preview';
        preview.style.cssText = `
            background:${v.isDark ? t.bg1 : '#fffbe6'};
            border:1px solid ${v.isDark ? v.borderColor : '#f0c040'};
            border-radius:6px; padding:10px 12px; font-size:11px; line-height:1.8;
            color:${v.textColor}; font-family:monospace; white-space:pre-line;
        `;
        body.appendChild(preview);

        // Quantité + bouton
        const bottomRow = document.createElement('div');
        bottomRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        bottomRow.innerHTML = `
            <label style="font-size:11px;font-weight:600;color:${v.textColor};min-width:70px;">Quantité</label>
            <input id="etiq2-qty" type="number" min="1" max="99" value="1"
                style="width:55px;padding:5px 8px;border-radius:5px;border:1px solid ${v.borderColor};background:${v.inputBg};color:${v.textColor};font-size:12px;text-align:center;" />
            <button id="etiq2-print-btn" style="
                flex:1;padding:7px 10px;border-radius:6px;
                border:1px solid ${v.accentColor};background:${v.accentColor};
                color:#fff;font-weight:700;font-size:12px;
                cursor:pointer;transition:0.2s;letter-spacing:0.3px;
            ">🖨️ Imprimer</button>
        `;
        body.appendChild(bottomRow);
        panel.appendChild(body);
        document.body.appendChild(panel);

        // ── Logique ──────────────────────────────────────────────────
        const catSelect   = document.getElementById('etiq2-cat-select');
        const labelSelect = document.getElementById('etiq2-label-select');
        const qtyInput    = document.getElementById('etiq2-qty');
        const printBtn    = document.getElementById('etiq2-print-btn');

        function updateLabelSelect() {
            const labels = ETIQUETTES[catSelect.value] || [];
            labelSelect.innerHTML = labels.map((e, i) => `<option value="${i}">${etiq2_escapeHTML(e.label)}</option>`).join('');
            updatePreview();
        }

        function getSelectedEti() {
            return (ETIQUETTES[catSelect.value] || [])[parseInt(labelSelect.value)] || null;
        }

        function updatePreview() {
            const eti = getSelectedEti();
            preview.textContent = eti ? `${eti.action}\n${eti.label}\n${etiq2_buildSignature()}` : '';
        }

        catSelect.addEventListener('change', updateLabelSelect);
        labelSelect.addEventListener('change', updatePreview);

        printBtn.addEventListener('click', () => {
            const eti = getSelectedEti();
            if (!eti) return;
            try {
                etiq2_print(eti, parseInt(qtyInput.value) || 1);
                etiq2_showFeedback('✓ Envoyé à l\'impression', '#27ae60');
            } catch(e) {
                etiq2_showFeedback('✗ Erreur', '#e74c3c');
            }
        });

        [labelSelect, qtyInput].forEach(el => {
            el.addEventListener('keydown', e => { if (e.key === 'Enter') printBtn.click(); });
        });

        updateLabelSelect();
    }

    function etiq2_toggle() {
        const panel = document.getElementById('etiq2-panel');
        if (!panel) return;
        const visible = panel.style.display !== 'none';
        panel.style.display = visible ? 'none' : 'block';
        if (!visible) {
            const sig = document.getElementById('etiq2-sig-preview');
            if (sig) sig.textContent = etiq2_buildSignature() || '(login non détecté)';
            const catSelect   = document.getElementById('etiq2-cat-select');
            const labelSelect = document.getElementById('etiq2-label-select');
            const preview     = document.getElementById('etiq2-label-preview');
            if (preview && catSelect && labelSelect) {
                const eti = (ETIQUETTES[catSelect.value] || [])[parseInt(labelSelect.value)];
                if (eti) preview.textContent = `${eti.action}\n${eti.label}\n${etiq2_buildSignature()}`;
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', etiq2_buildPanel);
    } else {
        setTimeout(etiq2_buildPanel, 1000);
    }

    // ════════════════════════════════════════════════════════════════
    // ===== TRANSSHIPMENT DESTINATION TOOLTIP =====
    // ════════════════════════════════════════════════════════════════
    (function initTransshipmentTooltip() {

        // ── Tooltip DOM ──────────────────────────────────────────────
        const tooltip = document.createElement('div');
        tooltip.id = 'fcr-tship-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            z-index: 99999;
            display: none;
            min-width: 180px;
            max-width: 280px;
            padding: 10px 14px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            pointer-events: none;
            box-shadow: 0 6px 24px rgba(0,0,0,0.35);
            border: 1px solid;
            transition: opacity 0.15s;
        `;
        document.body.appendChild(tooltip);

        // Cache pour éviter les appels répétés (conteneur → destination)
        const rodeoCache = {};

        // ── Style selon thème actif ──────────────────────────────────
        function getTooltipStyle() {
            const t = THEMES[GM_getValue('fcr-theme', 'base')];
            if (!t || t.isBase) {
                return {
                    bg: '#1a1a2e', border: '#4a6fa5', text: '#e8eaf6',
                    accent: '#7eb3ff', subtext: '#9ab0cc'
                };
            }
            return {
                bg: t.bg2 || '#1a1a2e',
                border: t.accent || '#4a6fa5',
                text: '#e8eaf6',
                accent: t.accent || '#7eb3ff',
                subtext: '#9ab0cc'
            };
        }

        function showTooltip(x, y, content) {
            const s = getTooltipStyle();
            tooltip.style.background = s.bg;
            tooltip.style.borderColor = s.border;
            tooltip.style.color = s.text;
            tooltip.innerHTML = content;
            tooltip.style.display = 'block';
            // Positionnement : évite les débordements
            const tw = tooltip.offsetWidth || 200;
            const th = tooltip.offsetHeight || 80;
            let left = x + 14;
            let top  = y - 10;
            if (left + tw > window.innerWidth  - 10) left = x - tw - 14;
            if (top  + th > window.innerHeight - 10) top  = window.innerHeight - th - 10;
            if (top < 6) top = 6;
            tooltip.style.left = left + 'px';
            tooltip.style.top  = top  + 'px';
        }

        function hideTooltip() {
            tooltip.style.display = 'none';
        }

        // ── Appel Rodeo ──────────────────────────────────────────────
        function fetchRodeoDestination(container, onSuccess, onError) {
            if (rodeoCache[container] !== undefined) {
                onSuccess(rodeoCache[container]);
                return;
            }
            const warehouseId = $.cookie('fcmenu-warehouseId') || getFCFromURL() || 'ETZ2';
            const url = `https://rodeo-dub.amazon.com/${warehouseId}/Search?searchKey=${encodeURIComponent(container)}`;
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function(resp) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(resp.responseText, 'text/html');
                        // Cherche la colonne "Identifiant de l'entrepôt de destination"
                        // dans toutes les tables du résultat Rodeo
                        let destination = null;
                        const headers = doc.querySelectorAll('th');
                        headers.forEach(th => {
                            const text = th.textContent.trim().toLowerCase();
                            if (text.includes('destination') || text.includes('entrepôt de destination') || text.includes('destination warehouse')) {
                                const table = th.closest('table');
                                if (!table) return;
                                const colIndex = Array.from(th.parentElement.children).indexOf(th);
                                const firstRow = table.querySelector('tbody tr');
                                if (firstRow) {
                                    const cell = firstRow.children[colIndex];
                                    if (cell) destination = cell.textContent.trim();
                                }
                            }
                        });
                        // Fallback : cherche un pattern FC (3-4 lettres majuscules + 1 chiffre)
                        if (!destination) {
                            const match = resp.responseText.match(/\b([A-Z]{3,4}[0-9])\b/);
                            if (match) destination = match[1];
                        }
                        rodeoCache[container] = destination || null;
                        onSuccess(destination);
                    } catch(e) {
                        // Erreur de parsing : ne pas mettre en cache
                        onError('Erreur de parsing');
                    }
                },
                onerror: function() {
                    // Erreur réseau : ne pas mettre en cache pour permettre une nouvelle tentative
                    onError('Erreur réseau');
                }
            });
        }

        // ── Construction du HTML tooltip ─────────────────────────────
        function buildTooltipHTML(container, destination) {
            const s = getTooltipStyle();
            const warehouseId = $.cookie('fcmenu-warehouseId') || getFCFromURL() || 'ETZ2';
            const rodeoUrl = `https://rodeo-dub.amazon.com/${warehouseId}/Search?searchKey=${encodeURIComponent(container)}`;
            if (destination) {
                return `
                    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${s.accent};margin-bottom:6px;">
                        🚚 Destination TRANSSHIPMENT
                    </div>
                    <div style="font-size:18px;font-weight:800;color:${s.accent};letter-spacing:1px;margin-bottom:8px;">
                        ${destination}
                    </div>
                    `;
            }
        }

        function buildLoadingHTML(container) {
            const s = getTooltipStyle();
            return `
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${s.accent};margin-bottom:6px;">
                    🚚 Destination TRANSSHIPMENT
                </div>
                <div style="font-size:12px;color:${s.subtext};">
                    ⏳ Recherche en cours…
                </div>
                `;
        }

        // ── Attache les événements sur chaque cellule TRANSSHIPMENT ──
        function attachTransshipmentHover(row) {
            const cells = row.querySelectorAll('td');
            if (!cells.length) return;

            // Colonne 0 = Conteneur (texte du lien ou texte direct)
            const containerCell = cells[0];
            const containerLink = containerCell ? containerCell.querySelector('a') : null;
            const container = containerLink
                ? containerLink.textContent.trim()
                : (containerCell ? containerCell.textContent.trim() : null);
            if (!container || !container.match(/^ts[A-Z0-9]/i)) return;

            // Cherche la cellule TRANSSHIPMENT dans la ligne
            cells.forEach(cell => {
                if (cell.dataset.tshipHover) return; // déjà traité
                const text = cell.textContent.trim();
                if (text !== 'TRANSSHIPMENT') return;

                cell.dataset.tshipHover = '1';
                cell.style.cursor = 'help';

                let hoverTimer = null;
                let mouseX = 0, mouseY = 0;

                cell.addEventListener('mouseenter', function(e) {
                    mouseX = e.clientX;
                    mouseY = e.clientY;
                    hoverTimer = setTimeout(() => {
                        // Affiche immédiatement "chargement" si pas en cache
                        if (rodeoCache[container] !== undefined) {
                            showTooltip(mouseX, mouseY, buildTooltipHTML(container, rodeoCache[container]));
                        } else {
                            showTooltip(mouseX, mouseY, buildLoadingHTML(container));
                            fetchRodeoDestination(container,
                                (dest) => {
                                    if (tooltip.style.display !== 'none') {
                                        showTooltip(mouseX, mouseY, buildTooltipHTML(container, dest));
                                    }
                                },
                                (err) => {
                                    if (tooltip.style.display !== 'none') {
                                        const s = getTooltipStyle();
                                        showTooltip(mouseX, mouseY, `<div style="color:#ff6b6b;">❌ ${err}</div><div style="font-size:10px;color:${s.subtext};margin-top:4px;">📦 ${container}</div>`);
                                    }
                                }
                            );
                        }
                    }, 300); // délai 300ms avant d'afficher
                });

                cell.addEventListener('mousemove', function(e) {
                    mouseX = e.clientX;
                    mouseY = e.clientY;
                    if (tooltip.style.display !== 'none') {
                        const tw = tooltip.offsetWidth || 200;
                        const th = tooltip.offsetHeight || 80;
                        let left = mouseX + 14;
                        let top  = mouseY - 10;
                        if (left + tw > window.innerWidth  - 10) left = mouseX - tw - 14;
                        if (top  + th > window.innerHeight - 10) top  = window.innerHeight - th - 10;
                        if (top < 6) top = 6;
                        tooltip.style.left = left + 'px';
                        tooltip.style.top  = top  + 'px';
                    }
                });

                cell.addEventListener('mouseleave', function() {
                    clearTimeout(hoverTimer);
                    hideTooltip();
                });
            });
        }
        // Exposition globale pour l'observer unifié dans godModePrint
        window.attachTransshipmentHover = attachTransshipmentHover;

        // Tooltip a un lien cliquable → besoin de pointer-events
        tooltip.addEventListener('mouseenter', () => {
            tooltip.style.pointerEvents = 'all';
        });
        tooltip.addEventListener('mouseleave', () => {
            tooltip.style.pointerEvents = 'none';
            hideTooltip();
        });

    })();

    // === Correction position sidebar : suit le header + suit le scroll de la page ===
    // NOTE : on ne compte plus sur CSS `position: sticky` pour faire tenir la sidebar,
    // car sticky casse silencieusement dès qu'un ancêtre a un overflow différent de
    // "visible" (fréquent sur les apps internes — notamment la page d'accueil, qui a
    // une structure de conteneur différente des pages FCResearch/AFT). On pilote donc
    // tout nous-mêmes en JS avec position:fixed, ce qui fonctionne quel que soit le
    // conteneur parent, et on force les styles avec priorité "important" pour ne
    // jamais se faire écraser par les règles CSS `!important` du thème actif.
    (function fixSidebarFollowScroll() {
        function getSidebar() {
            return document.querySelector('#side-bar') || document.querySelector('.sidebar') || document.querySelector('[id*="side"]');
        }

        let headerOffset = 0;   // hauteur du header fixe/sticky à respecter en haut
        let naturalTop = null;  // position de la sidebar dans le flux normal (doc, hors scroll)
        let isFixed = false;

        function computeHeaderOffset(sidebar) {
            const sidebarRect = sidebar.getBoundingClientRect();
            let maxBottom = 0;

            // Cas le plus courant : un header en position fixed/sticky collé en haut de
            // l'écran qui chevauche horizontalement la sidebar (donc passe "par-dessus" elle).
            // Perf : on borne le scan aux 4 premiers niveaux sous body plutôt que tout le
            // sous-arbre, pour éviter un reflow forcé sur chaque ligne d'un tableau inventaire.
            const all = document.body.querySelectorAll(':scope > *, :scope > * > *, :scope > * > * > *, :scope > * > * > * > *');
            for (const el of all) {
                if (el === sidebar || sidebar.contains(el) || el.contains(sidebar)) continue;
                const cs = getComputedStyle(el);
                if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
                const r = el.getBoundingClientRect();
                if (r.height <= 0 || r.width <= 0) continue;
                // Les bandeaux hazmat s'empilent (voir fcrReflowHazmatBanners) : celui du bas
                // a un top > 20, on l'accepte quand même explicitement pour ne pas être masqué.
                const isStackedHazmatBanner = el.classList && el.classList.contains('hazmat-fixed-banner');
                if (r.top > 20 && !isStackedHazmatBanner) continue;
                if (r.right <= sidebarRect.left || r.left >= sidebarRect.right) continue;
                if (r.bottom > maxBottom) maxBottom = r.bottom;
            }

            return Math.max(0, Math.round(maxBottom));
        }

        // Mesure la position/largeur "naturelle" de la sidebar dans le flux du document
        // (en retirant temporairement tout positionnement fixed qu'on lui aurait appliqué).
        function measureNatural(sidebar) {
            const wasFixed = isFixed;
            if (wasFixed) releaseFixed(sidebar, /*silent*/ true);

            const rect = sidebar.getBoundingClientRect();
            const scrollY = window.scrollY || window.pageYOffset || 0;
            naturalTop = rect.top + scrollY;

            if (wasFixed) applyFixed(sidebar);
        }

        function applyFixed(sidebar) {
            // Largeur/position horizontale : on se base sur le parent (le flux normal),
            // pas sur la sidebar elle-même (qui serait déjà fixed au moment du calcul).
            const parent = sidebar.parentElement;
            const parentRect = parent ? parent.getBoundingClientRect() : sidebar.getBoundingClientRect();
            const width = sidebar.offsetWidth || parentRect.width;

            sidebar.style.setProperty('position', 'fixed', 'important');
            sidebar.style.setProperty('top', headerOffset + 'px', 'important');
            sidebar.style.setProperty('left', Math.round(parentRect.left) + 'px', 'important');
            sidebar.style.setProperty('width', Math.round(width) + 'px', 'important');
            sidebar.style.setProperty('max-height', `calc(100vh - ${headerOffset}px)`, 'important');
            sidebar.style.setProperty('z-index', '500', 'important');
        }

        function releaseFixed(sidebar, silent) {
            sidebar.style.removeProperty('position');
            sidebar.style.removeProperty('top');
            sidebar.style.removeProperty('left');
            sidebar.style.removeProperty('width');
            sidebar.style.removeProperty('z-index');
            sidebar.style.setProperty('max-height', `calc(100vh - ${headerOffset}px)`, 'important');
            if (!silent) isFixed = false;
        }

        // Petit espaceur invisible qui prend la place de la sidebar dans le flux quand
        // elle passe en fixed, pour éviter que le reste de la page ne "saute" vers la gauche.
        let spacer = null;
        function ensureSpacer(sidebar) {
            if (!spacer) {
                spacer = document.createElement('div');
                spacer.id = 'fcr-sidebar-spacer';
                spacer.style.cssText = 'flex-shrink:0;';
                sidebar.parentElement && sidebar.parentElement.insertBefore(spacer, sidebar);
            }
            return spacer;
        }

        function onScroll() {
            const sidebar = getSidebar();
            if (!sidebar || naturalTop === null) return;
            const scrollY = window.scrollY || window.pageYOffset || 0;
            const shouldBeFixed = (scrollY + headerOffset) > naturalTop;

            if (shouldBeFixed) {
                const sp = ensureSpacer(sidebar);
                if (!isFixed) {
                    sp.style.width = sidebar.offsetWidth + 'px';
                    sp.style.height = sidebar.offsetHeight + 'px';
                    isFixed = true;
                }
                applyFixed(sidebar);
                sp.style.display = '';
            } else if (isFixed) {
                isFixed = false;
                releaseFixed(sidebar);
                if (spacer) spacer.style.display = 'none';
            }
        }

        let ticking = false;
        function onScrollThrottled() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => { onScroll(); ticking = false; });
        }

        function recompute() {
            const sidebar = getSidebar();
            if (!sidebar) return;
            headerOffset = computeHeaderOffset(sidebar);
            document.documentElement.style.setProperty('--fcr-sidebar-offset', headerOffset + 'px');
            measureNatural(sidebar);
            onScroll();
        }

        const recomputeDebounced = debounce(recompute, 150);

        function init() {
            recompute();
            window.addEventListener('scroll', onScrollThrottled, { passive: true });
            window.addEventListener('resize', recomputeDebounced);
            window.addEventListener('orientationchange', recomputeDebounced);
            // Recalcul si le DOM autour de la sidebar change (header dynamique, bannières, etc.)
            const ro = new MutationObserver(debounce(() => recompute(), 200));
            ro.observe(document.body, { childList: true, subtree: false });
            window.addEventListener('load', () => setTimeout(recompute, 500));
            setTimeout(recompute, 1000);
            setTimeout(recompute, 3000);
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();

    // ════════════════════════════════════════════════════════════════
    // ===== QUICK STATUS CHANGE (Inventory FC Research → Edit Item intégré) =====
    // ════════════════════════════════════════════════════════════════
    (function quickStatusChange() {

        const EDIT_ITEMS_PATH = '/app/edititems';
        const isEditItemsPage = window.location.pathname.startsWith(EDIT_ITEMS_PATH);
        const inIframe = window.self !== window.top;

        const STATUS_DEFS = [
            { key: 'SELLABLE',         label: 'Sellable',         match: 'inventory' },
            { key: 'PENDING_RESEARCH', label: 'Pending Research', match: 'pending research' },
            { key: 'UNSELLABLE',       label: 'Unsellable',       match: 'unsellable' },
            { key: 'PENDING_REPAIR',   label: 'Pending Repair',   match: 'pending repair' },
        ];

        GM_addStyle(`
            .fcr-status-arrow {
                display:inline-block;
                margin-left:8px;
                cursor:pointer;
                color:#FFA500;
                font-weight:900;
                font-size:14px;
                user-select:none;
            }
            .fcr-status-arrow:hover { color:#FFD24D; }
            .fcr-status-header-cell {
                color:#FFD24D !important;
                font-weight:700;
            }
            .fcr-status-cell {
                text-align:center;
                white-space:nowrap;
            }
            .fcr-status-menu {
                position:absolute;
                z-index:999999;
                background:#1c1c1c;
                border:1px solid #444;
                border-radius:6px;
                box-shadow:0 4px 12px rgba(0,0,0,0.4);
                min-width:160px;
                overflow:hidden;
            }
            .fcr-status-menu-item {
                padding:8px 12px;
                color:#fff;
                font-size:13px;
                cursor:pointer;
            }
            .fcr-status-menu-item:hover { background:#FFA500; color:#000; }
            .fcr-status-toast {
                position:fixed;
                bottom:24px;
                right:24px;
                background:#1c1c1c;
                color:#FFD24D;
                border:1px solid #FFA500;
                padding:12px 16px;
                border-radius:8px;
                font-size:13px;
                z-index:2147483647;
                box-shadow:0 4px 12px rgba(0,0,0,0.4);
                max-width:320px;
            }
            .fcr-status-overlay {
                position:fixed;
                inset:0;
                background:rgba(0,0,0,0.6);
                z-index:2147483000;
                display:flex;
                align-items:center;
                justify-content:center;
            }
            .fcr-status-modal {
                background:#fff;
                width:min(1000px, 92vw);
                height:min(750px, 90vh);
                border-radius:10px;
                overflow:hidden;
                position:relative;
                box-shadow:0 10px 40px rgba(0,0,0,0.5);
                display:flex;
                flex-direction:column;
            }
            .fcr-status-modal-header {
                background:#0b2e33;
                color:#fff;
                padding:10px 16px;
                display:flex;
                align-items:center;
                justify-content:space-between;
                font-weight:700;
                font-size:14px;
            }
            .fcr-status-modal-close {
                cursor:pointer;
                font-size:18px;
                line-height:1;
                color:#fff;
                background:none;
                border:none;
                padding:4px 8px;
            }
            .fcr-status-modal-close:hover { color:#FFA500; }
            .fcr-status-modal iframe {
                flex:1;
                border:none;
                width:100%;
            }
            .fcr-status-modal-loading {
                position:absolute;
                inset:0;
                top:42px;
                display:flex;
                align-items:center;
                justify-content:center;
                background:#fff;
                color:#555;
                font-size:14px;
            }
        `);

        // ---------- Partie A : flèche + menu dans le tableau Inventory (FC Research) ----------
        function initInventoryArrows() {
            if (isEditItemsPage) return;

            // Perf : on garde en cache la table détectée + ses index de colonnes.
            // Tant qu'elle reste dans le DOM, on évite de rescanner TOUTES les
            // tables de la page (et leur textContent) à chaque mutation.
            let _cachedInvTable = null;
            let _cachedInvCols = null;

            function findInventoryTable() {
                if (_cachedInvTable && document.contains(_cachedInvTable)) return _cachedInvTable;
                _cachedInvTable = null;
                _cachedInvCols = null;
                const tables = document.querySelectorAll('table');
                for (const t of tables) {
                    const headerText = (t.querySelector('thead, tr') || {}).textContent || '';
                    if (headerText.includes('Disposition') && headerText.includes('Container')) {
                        _cachedInvTable = t;
                        return t;
                    }
                }
                return null;
            }

            function getColumnIndex(table, label) {
                const headerCells = table.querySelectorAll('thead th, tr:first-child th, tr:first-child td');
                let idx = -1;
                headerCells.forEach((cell, i) => {
                    if (idx === -1 && cell.textContent.trim().toLowerCase().startsWith(label.toLowerCase())) idx = i;
                });
                return idx;
            }

            function processTable() {
                const table = findInventoryTable();
                if (!table) return;

                let cols = (table === _cachedInvTable) ? _cachedInvCols : null;
                if (!cols) {
                    cols = {
                        containerIdx:   getColumnIndex(table, 'Container'),
                        asinIdx:        getColumnIndex(table, 'ASIN'),
                        fcskuIdx:       getColumnIndex(table, 'FCSku'),
                        dispositionIdx: getColumnIndex(table, 'Disposition'),
                    };
                    _cachedInvCols = cols;
                }
                const { containerIdx, asinIdx, fcskuIdx, dispositionIdx } = cols;
                if (containerIdx === -1 || asinIdx === -1) return;
                if (fcskuIdx === -1 && dispositionIdx === -1) return;

                // Ajoute l'en-tête de la nouvelle colonne "Statut" une seule fois
                const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
                if (headerRow && !headerRow.dataset.fcrStatusHeaderAdded) {
                    headerRow.dataset.fcrStatusHeaderAdded = '1';
                    const th = document.createElement(headerRow.querySelector('th') ? 'th' : 'td');
                    th.textContent = '⚡ Statut';
                    th.className = 'fcr-status-header-cell';
                    headerRow.appendChild(th);
                }

                const allRows = table.querySelectorAll('tbody tr, tr');
                const rows = Array.from(allRows).filter(r => r !== headerRow);
                rows.forEach(row => {
                    if (row.dataset.fcrStatusArrow) return;
                    const cells = row.querySelectorAll('td');
                    if (!cells.length) return;
                    row.dataset.fcrStatusArrow = '1';

                    const container = (cells[containerIdx]?.textContent || '').trim();
                    const asin      = (cells[asinIdx]?.textContent || '').trim();
                    const fcsku     = fcskuIdx !== -1 ? (cells[fcskuIdx]?.textContent || '').trim() : '';
                    if (!container || !asin) return;

                    const newCell = document.createElement('td');
                    newCell.className = 'fcr-status-cell';
                    const arrow = document.createElement('span');
                    arrow.textContent = '➜';
                    arrow.title = 'Changer le statut inventaire';
                    arrow.className = 'fcr-status-arrow';
                    newCell.appendChild(arrow);
                    row.appendChild(newCell);

                    arrow.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openStatusMenu(arrow, container, asin, fcsku);
                    });
                });
            }

            let menuEl = null;
            function closeStatusMenu() {
                if (menuEl) { menuEl.remove(); menuEl = null; }
                document.removeEventListener('click', closeStatusMenu);
            }

            function openStatusMenu(anchor, container, asin, fcsku) {
                closeStatusMenu();
                menuEl = document.createElement('div');
                menuEl.className = 'fcr-status-menu';
                STATUS_DEFS.forEach(s => {
                    const item = document.createElement('div');
                    item.className = 'fcr-status-menu-item';
                    item.textContent = s.label;
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        launchStatusChange(container, asin, fcsku, s.key);
                        closeStatusMenu();
                    });
                    menuEl.appendChild(item);
                });
                document.body.appendChild(menuEl);
                const rect = anchor.getBoundingClientRect();
                menuEl.style.left = (rect.left + window.scrollX) + 'px';
                menuEl.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
                setTimeout(() => document.addEventListener('click', closeStatusMenu), 0);
            }

            function buildEditItemsURL(container, asin, fcsku, statusKey) {
                const base = 'https://aft-qt-eu.aka.amazon.com';
                return `${base}${EDIT_ITEMS_PATH}?experience=Desktop`
                    + `&fcrContainer=${encodeURIComponent(container)}`
                    + `&fcrItem=${encodeURIComponent(asin)}`
                    + `&fcrFcsku=${encodeURIComponent(fcsku || '')}`
                    + `&fcrStatus=${encodeURIComponent(statusKey)}`
                    + `&fcrAutofill=1`;
            }

            function launchStatusChange(container, asin, fcsku, statusKey) {
                const url = buildEditItemsURL(container, asin, fcsku, statusKey);
                openEditItemsModal(url, container, asin);
            }

            function openEditItemsModal(url, container, asin) {
                const overlay = document.createElement('div');
                overlay.className = 'fcr-status-overlay';

                const modal = document.createElement('div');
                modal.className = 'fcr-status-modal';

                const header = document.createElement('div');
                header.className = 'fcr-status-modal-header';
                header.innerHTML = `<span>Edit Item — Container ${container} / Item ${asin}</span>`;
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'fcr-status-modal-close';
                closeBtn.textContent = '✕';
                header.appendChild(closeBtn);

                const loading = document.createElement('div');
                loading.className = 'fcr-status-modal-loading';
                loading.textContent = '⏳ Chargement d\'Edit Item…';

                const iframe = document.createElement('iframe');
                iframe.src = url;

                modal.appendChild(header);
                modal.appendChild(loading);
                modal.appendChild(iframe);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                function closeModal() {
                    overlay.remove();
                    window.removeEventListener('message', onMessage);
                    clearTimeout(fallbackTimer);
                }
                closeBtn.addEventListener('click', closeModal);
                overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

                function onMessage(e) {
                    if (!e.data || e.data.type !== 'fcr-edititems-ready') return;
                    loading.style.display = 'none';
                    clearTimeout(fallbackTimer);
                }
                window.addEventListener('message', onMessage);

                // Si l'app ne peut pas être affichée en cadre intégré (X-Frame-Options/CSP),
                // aucun message ne sera reçu : on bascule alors sur un nouvel onglet classique.
                const fallbackTimer = setTimeout(() => {
                    loading.textContent = '⚠️ Affichage intégré impossible, ouverture dans un nouvel onglet…';
                    setTimeout(() => {
                        closeModal();
                        GM_openInTab(url, { active: true });
                    }, 1200);
                }, 5000);
            }

            // Perf : recadré sur main/#content (au lieu de document.body entier,
            // le plus large et le moins nécessaire des observers) et mutualisé
            // sur l'observer racine partagé (fcrOnRootMutation).
            fcrOnRootMutation(debounce(() => processTable(), 300));
            processTable();
        }

        // ---------- Partie B : autofill sur EditItemsApp (s'exécute aussi dans l'iframe) ----------
        function initEditItemsAutofill() {
            if (!isEditItemsPage) return;
            const params = new URLSearchParams(window.location.search);
            if (params.get('fcrAutofill') !== '1') return;

            // Signale au parent (si on est dans l'iframe de la modale) que la page a bien chargé.
            if (inIframe) {
                try { window.top.postMessage({ type: 'fcr-edititems-ready' }, '*'); } catch (e) {}
            }

            const container    = params.get('fcrContainer') || '';
            const item         = params.get('fcrItem') || '';
            const fcsku        = params.get('fcrFcsku') || '';
            const targetStatus = params.get('fcrStatus') || '';

            function setNativeValue(el, value) {
                const proto = Object.getPrototypeOf(el);
                const desc = Object.getOwnPropertyDescriptor(proto, 'value')
                    || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
                desc.set.call(el, value);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }

            function findLabeledInput(labelText) {
                const candidates = Array.from(document.querySelectorAll('label, div, span'));
                const labelEl = candidates.find(el =>
                    el.children.length === 0 && el.textContent.trim().toLowerCase() === labelText.toLowerCase()
                );
                if (!labelEl) return document.querySelector('input[type="text"]');
                let el = labelEl.nextElementSibling;
                while (el && el.tagName !== 'INPUT') el = el.nextElementSibling;
                if (el) return el;
                const wrap = labelEl.closest('div');
                return wrap ? wrap.querySelector('input') : document.querySelector('input[type="text"]');
            }

            function clickContinue() {
                const buttons = Array.from(document.querySelectorAll('button, a'));
                const btn = buttons.find(b => b.textContent.trim().toLowerCase().startsWith('continue'));
                if (btn) btn.click();
            }

            function waitForHeading(text, timeout = 8000) {
                return new Promise((resolve, reject) => {
                    const check = () => {
                        const els = Array.from(document.querySelectorAll('div, h1, h2, h3'));
                        return els.find(el =>
                            el.children.length === 0 && el.textContent.trim().toLowerCase().includes(text.toLowerCase())
                        );
                    };
                    const found = check();
                    if (found) return resolve(found);
                    // Perf : debounce 150ms pour éviter un scan complet du DOM
                    // à chaque mutation individuelle pendant le chargement de la modale.
                    const obs = new MutationObserver(debounce(() => {
                        const f = check();
                        if (f) { obs.disconnect(); resolve(f); }
                    }, 150));
                    obs.observe(document.body, { childList: true, subtree: true });
                    setTimeout(() => { obs.disconnect(); reject(new Error('timeout: ' + text)); }, timeout);
                });
            }

            function fillAndContinue(labelText, value) {
                return waitForElement('input').then(() => {
                    const input = findLabeledInput(labelText) || document.querySelector('input[type="text"]');
                    if (!input) return;
                    input.focus();
                    setNativeValue(input, value);
                    setTimeout(clickContinue, 150);
                });
            }

            function selectFcskuIfNeeded() {
                return waitForHeading('Select').then(heading => {
                    const txt = heading.textContent.toLowerCase();
                    if (txt.includes('new inventory state')) return; // déjà sur le bon écran
                    if (txt.includes('fcsku') || txt.includes('select item')) {
                        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
                        let target = null;
                        if (fcsku) target = radios.find(r => (r.closest('div')?.textContent || '').includes(fcsku));
                        if (!target) target = radios[0];
                        if (target) target.click();
                        setTimeout(clickContinue, 150);
                    }
                }).catch(() => {});
            }

            function showFcrToast(msg) {
                const toast = document.createElement('div');
                toast.className = 'fcr-status-toast';
                toast.textContent = msg;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 6000);
            }

            function selectTargetStatus() {
                const def = STATUS_DEFS.find(s => s.key === targetStatus);
                if (!def) return;
                waitForHeading('Select new inventory state').then(() => {
                    setTimeout(() => {
                        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
                        const target = radios.find(r => {
                            const txt = (r.closest('div')?.textContent || '').toLowerCase();
                            return txt.includes(def.match);
                        });
                        if (target) {
                            target.click();
                            showFcrToast('Statut "' + def.label + '" présélectionné — vérifie puis clique Continue (et choisis le type de disposition si demandé).');
                        }
                    }, 200);
                }).catch(() => {});
            }

            // Séquence : container -> item -> (fcsku si présent) -> présélection du statut
            fillAndContinue('Container', container)
                .then(() => waitForElement('input'))
                .then(() => fillAndContinue('Item barcode', item))
                .then(() => selectFcskuIfNeeded())
                .then(() => selectTargetStatus())
                .catch(err => console.warn('[FCR Quick Status]', err));
        }

        // NOTE: la détection par ligne dans le tableau Inventory perturbait le rendu du site
        // (double en-tête de colonnes). Désactivée au profit de la bulle flottante, plus simple.
        // initInventoryArrows();
        initEditItemsAutofill();

    })();

    // ════════════════════════════════════════════════════════════════
    // ===== UTILITAIRE — panneaux FAB responsives à la fenêtre =====
    // Calcule width/height du panneau pour qu'il tienne toujours dans la
    // fenêtre visible (sans jamais dépasser en haut/à gauche), en se
    // rapprochant le plus possible de la taille "idéale" souhaitée.
    // ════════════════════════════════════════════════════════════════
    function fcrFitFabPanel(panel, rightOffset, bottomOffset, idealWidth, idealHeight, useMaxHeight) {
        const margin = 12, minWidth = 300, minHeight = 200;
        const availWidth  = window.innerWidth  - rightOffset  - margin;
        const availHeight = window.innerHeight - bottomOffset - margin;
        const width  = Math.max(minWidth,  Math.min(idealWidth,  availWidth));
        const height = Math.max(minHeight, Math.min(idealHeight, availHeight));
        panel.style.width  = width + 'px';
        if (useMaxHeight) {
            // Contenu à hauteur naturelle : on plafonne plutôt que de forcer, avec scroll interne.
            panel.style.maxHeight = height + 'px';
            panel.style.overflowY = 'auto';
        } else {
            panel.style.height = height + 'px';
        }
        // Si même la largeur minimale ne rentre pas avec cet offset, on colle
        // le panneau tout près du bord droit plutôt que de le laisser déborder.
        panel.style.right = (rightOffset + width > window.innerWidth - 4)
            ? '4px'
            : rightOffset + 'px';
        // Idem verticalement : si le panneau + son offset bas dépasse le haut de l'écran, on colle en bas.
        panel.style.bottom = (bottomOffset + height > window.innerHeight - 4)
            ? '4px'
            : bottomOffset + 'px';
    }

    // ════════════════════════════════════════════════════════════════
    // ===== FAB EDIT ITEM (même style que le module Étiquettes) =====
    // ════════════════════════════════════════════════════════════════
    (function floatingEditItemBubble() {

        const EDIT_ITEMS_PATH = '/app/edititems';
        const isEditItemsPage = window.location.pathname.startsWith(EDIT_ITEMS_PATH);
        if (isEditItemsPage) return; // pas besoin du FAB sur Edit Item lui-même

        function buildEditItemsBaseURL() {
            // Domaine fixe de l'app Edit Item (différent du domaine FC Research).
            return 'https://aft-qt-eu.aka.amazon.com' + EDIT_ITEMS_PATH + '?experience=Desktop';
        }

        function openInWindow() {
            const url = buildEditItemsBaseURL();
            const w = 460, h = 700;
            const left = (window.screen.width - w) - 40;
            const top = (window.screen.height - h) - 80;
            const win = window.open(
                url, 'fcrEditItemPopup',
                `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`
            );
            if (win) win.focus();
            else alert('Le navigateur a bloqué l\'ouverture de la fenêtre Edit Item. Autorise les popups pour ce site puis réessaie.');
        }

        function buildFab() {
            if (document.getElementById('fcr-edititems-fab')) return;

            const t = THEMES[currentTheme] || THEMES.bleu;
            const v = etiq2_getThemeVars(t);

            // ── FAB ──────────────────────────────────────────────────
            const fab = document.createElement('div');
            fab.id = 'fcr-edititems-fab';
            fab.title = 'Edit Item';
            fab.innerHTML = '✏️';
            fab.style.cssText = `
                position:fixed; bottom:88px; right:24px; z-index:99990;
                width:48px; height:48px; border-radius:50%;
                background:${v.isDark ? (t.isGradient ? t.gradBtn : t.bg3) : '#ff9900'};
                color:${v.accentColor}; font-size:22px;
                display:flex; align-items:center; justify-content:center;
                cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.35);
                border:2px solid ${v.accentColor};
                transition:transform 0.2s, box-shadow 0.2s;
                user-select:none;
            `;
            fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.12)'; });
            fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
            fab.addEventListener('click', toggle);
            document.body.appendChild(fab);
            makeFcrFabDraggable(fab, 'edititems');

            // ── Panneau ──────────────────────────────────────────────
            const panel = document.createElement('div');
            panel.id = 'fcr-edititems-panel';
            panel.style.cssText = `
                position:fixed; z-index:99989;
                border-radius:12px;
                background:${v.panelBg}; border:1px solid ${v.borderColor};
                box-shadow:0 8px 32px rgba(0,0,0,0.4);
                font-family:Arial,sans-serif; font-size:13px;
                display:none; flex-direction:column; overflow:hidden;
            `;
            fcrFitFabPanel(panel, 84, 88, 420, 620);
            window.addEventListener('resize', debounce(() => fcrFitFabPanel(panel, 84, 88, 420, 620), 150));

            const header = document.createElement('div');
            header.style.cssText = `
                background:${v.headerBg}; padding:10px 14px;
                display:flex; align-items:center; justify-content:space-between;
                border-bottom:1px solid ${v.borderColor}; flex-shrink:0;
            `;
            header.innerHTML = `
                <span style="font-size:11px;font-weight:700;color:${v.accentColor};text-transform:uppercase;letter-spacing:0.5px;">✏️ EDIT ITEM</span>
                <span style="display:flex;gap:10px;align-items:center;">
                    <span id="fcr-edititems-popout" title="Ouvrir dans une fenêtre" style="cursor:pointer;color:${v.accentColor};font-size:14px;">⤢</span>
                    <span id="fcr-edititems-reload" title="Recharger" style="cursor:pointer;color:${v.accentColor};font-size:14px;">⟳</span>
                    <span id="fcr-edititems-close" title="Fermer" style="cursor:pointer;color:${v.accentColor};font-size:16px;font-weight:700;line-height:1;">✕</span>
                </span>
            `;
            panel.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = 'position:relative; flex:1; background:#fff;';
            const loading = document.createElement('div');
            loading.id = 'fcr-edititems-loading';
            loading.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#555; font-size:13px; text-align:center; padding:16px;';
            loading.textContent = '⏳ Chargement d\'Edit Item…';
            const iframe = document.createElement('iframe');
            iframe.id = 'fcr-edititems-iframe';
            iframe.style.cssText = 'width:100%; height:100%; border:none; display:block;';
            body.appendChild(loading);
            body.appendChild(iframe);
            panel.appendChild(body);

            document.body.appendChild(panel);

            let fallbackTimer = null;
            function load() {
                loading.style.display = 'flex';
                loading.textContent = '⏳ Chargement d\'Edit Item…';
                iframe.src = buildEditItemsBaseURL();
                clearTimeout(fallbackTimer);
                fallbackTimer = setTimeout(() => {
                    loading.innerHTML = '⚠️ Affichage intégré bloqué par le site.<br><br>Utilise le bouton ⤢ ci-dessus pour ouvrir Edit Item dans une fenêtre.';
                }, 4000);
            }
            iframe.addEventListener('load', () => {
                // Le 'load' se déclenche même si le contenu est bloqué (X-Frame-Options) ;
                // on masque le message de chargement mais le fallback texte reste si rien ne s'affiche après le délai.
                clearTimeout(fallbackTimer);
                loading.style.display = 'none';
            });

            function toggle() {
                const visible = panel.style.display !== 'none';
                if (visible) {
                    panel.style.display = 'none';
                } else {
                    panel.style.display = 'flex';
                    if (!iframe.src) load();
                }
            }

            header.querySelector('#fcr-edititems-close').addEventListener('click', toggle);
            header.querySelector('#fcr-edititems-reload').addEventListener('click', load);
            header.querySelector('#fcr-edititems-popout').addEventListener('click', openInWindow);
            header.style.cursor = 'pointer';
            header.title = 'Cliquer pour fermer';
            header.addEventListener('click', (e) => {
                if (e.target.closest('#fcr-edititems-close, #fcr-edititems-reload, #fcr-edititems-popout')) return;
                toggle();
            });

            window.fcrEditItemsToggle = toggle;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', buildFab);
        } else {
            setTimeout(buildFab, 1000);
        }

    })();

    // ════════════════════════════════════════════════════════════════
    // ===== FAB MOVE ITEM (même style que le module Edit Item) =====
    // ════════════════════════════════════════════════════════════════
    (function floatingMoveItemBubble() {

        const MOVE_ITEMS_PATH = '/app/moveitems';
        const isMoveItemsPage = window.location.pathname.startsWith(MOVE_ITEMS_PATH);
        if (isMoveItemsPage) return; // pas besoin du FAB sur Move Item lui-même

        function buildMoveItemsBaseURL() {
            // Domaine fixe de l'app Move Item (identique à Edit Item).
            return 'https://aft-qt-eu.aka.amazon.com' + MOVE_ITEMS_PATH + '?experience=Desktop';
        }

        function openInWindow() {
            const url = buildMoveItemsBaseURL();
            const w = 460, h = 700;
            const left = (window.screen.width - w) - 40;
            const top = (window.screen.height - h) - 80;
            const win = window.open(
                url, 'fcrMoveItemPopup',
                `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`
            );
            if (win) win.focus();
            else alert('Le navigateur a bloqué l\'ouverture de la fenêtre Move Item. Autorise les popups pour ce site puis réessaie.');
        }

        function buildFab() {
            if (document.getElementById('fcr-moveitems-fab')) return;

            const t = THEMES[currentTheme] || THEMES.bleu;
            const v = etiq2_getThemeVars(t);

            // ── FAB ──────────────────────────────────────────────────
            const fab = document.createElement('div');
            fab.id = 'fcr-moveitems-fab';
            fab.title = 'Move Item';
            fab.innerHTML = '📦';
            fab.style.cssText = `
                position:fixed; bottom:152px; right:24px; z-index:99990;
                width:48px; height:48px; border-radius:50%;
                background:${v.isDark ? (t.isGradient ? t.gradBtn : t.bg3) : '#ff9900'};
                color:${v.accentColor}; font-size:22px;
                display:flex; align-items:center; justify-content:center;
                cursor:pointer; box-shadow:0 4px 16px rgba(0,0,0,0.35);
                border:2px solid ${v.accentColor};
                transition:transform 0.2s, box-shadow 0.2s;
                user-select:none;
            `;
            fab.addEventListener('mouseenter', () => { fab.style.transform = 'scale(1.12)'; });
            fab.addEventListener('mouseleave', () => { fab.style.transform = 'scale(1)'; });
            fab.addEventListener('click', toggle);
            document.body.appendChild(fab);
            makeFcrFabDraggable(fab, 'moveitems');

            // ── Panneau ──────────────────────────────────────────────
            const panel = document.createElement('div');
            panel.id = 'fcr-moveitems-panel';
            panel.style.cssText = `
                position:fixed; z-index:99989;
                border-radius:12px;
                background:${v.panelBg}; border:1px solid ${v.borderColor};
                box-shadow:0 8px 32px rgba(0,0,0,0.4);
                font-family:Arial,sans-serif; font-size:13px;
                display:none; flex-direction:column; overflow:hidden;
            `;
            fcrFitFabPanel(panel, 84, 152, 420, 620);
            window.addEventListener('resize', debounce(() => fcrFitFabPanel(panel, 84, 152, 420, 620), 150));

            const header = document.createElement('div');
            header.style.cssText = `
                background:${v.headerBg}; padding:10px 14px;
                display:flex; align-items:center; justify-content:space-between;
                border-bottom:1px solid ${v.borderColor}; flex-shrink:0;
            `;
            header.innerHTML = `
                <span style="font-size:11px;font-weight:700;color:${v.accentColor};text-transform:uppercase;letter-spacing:0.5px;">📦 MOVE ITEM</span>
                <span style="display:flex;gap:10px;align-items:center;">
                    <span id="fcr-moveitems-popout" title="Ouvrir dans une fenêtre" style="cursor:pointer;color:${v.accentColor};font-size:14px;">⤢</span>
                    <span id="fcr-moveitems-reload" title="Recharger" style="cursor:pointer;color:${v.accentColor};font-size:14px;">⟳</span>
                    <span id="fcr-moveitems-close" title="Fermer" style="cursor:pointer;color:${v.accentColor};font-size:16px;font-weight:700;line-height:1;">✕</span>
                </span>
            `;
            panel.appendChild(header);

            const body = document.createElement('div');
            body.style.cssText = 'position:relative; flex:1; background:#fff;';
            const loading = document.createElement('div');
            loading.id = 'fcr-moveitems-loading';
            loading.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#555; font-size:13px; text-align:center; padding:16px;';
            loading.textContent = '⏳ Chargement de Move Item…';
            const iframe = document.createElement('iframe');
            iframe.id = 'fcr-moveitems-iframe';
            iframe.style.cssText = 'width:100%; height:100%; border:none; display:block;';
            body.appendChild(loading);
            body.appendChild(iframe);
            panel.appendChild(body);

            document.body.appendChild(panel);

            let fallbackTimer = null;
            function load() {
                loading.style.display = 'flex';
                loading.textContent = '⏳ Chargement de Move Item…';
                iframe.src = buildMoveItemsBaseURL();
                clearTimeout(fallbackTimer);
                fallbackTimer = setTimeout(() => {
                    loading.innerHTML = '⚠️ Affichage intégré bloqué par le site.<br><br>Utilise le bouton ⤢ ci-dessus pour ouvrir Move Item dans une fenêtre.';
                }, 4000);
            }
            iframe.addEventListener('load', () => {
                // Le 'load' se déclenche même si le contenu est bloqué (X-Frame-Options) ;
                // on masque le message de chargement mais le fallback texte reste si rien ne s'affiche après le délai.
                clearTimeout(fallbackTimer);
                loading.style.display = 'none';
            });

            function toggle() {
                const visible = panel.style.display !== 'none';
                if (visible) {
                    panel.style.display = 'none';
                } else {
                    panel.style.display = 'flex';
                    if (!iframe.src) load();
                }
            }

            header.querySelector('#fcr-moveitems-close').addEventListener('click', toggle);
            header.querySelector('#fcr-moveitems-reload').addEventListener('click', load);
            header.querySelector('#fcr-moveitems-popout').addEventListener('click', openInWindow);
            header.style.cursor = 'pointer';
            header.title = 'Cliquer pour fermer';
            header.addEventListener('click', (e) => {
                if (e.target.closest('#fcr-moveitems-close, #fcr-moveitems-reload, #fcr-moveitems-popout')) return;
                toggle();
            });

            window.fcrMoveItemsToggle = toggle;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', buildFab);
        } else {
            setTimeout(buildFab, 1000);
        }

    })();

})();
