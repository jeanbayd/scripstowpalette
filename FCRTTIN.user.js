// ==UserScript==
// @name         FCR Lite — TTIN (Bin Check + Floor Finder)
// @version      2.5.0
// @description  TTIN — Bin Check Generator et Floor Finder (bins). Génère une liste de bins imprimable et affiche le floor de chaque bin dans l'inventaire.
// @author       @JEANBAYD
// @match        https://aft-sherlock.eu.aftx.amazonoperations.app/ETZ2*
// @match        https://aft-sherlock.eu.aftx.amazonoperations.app/ETZ2/*
// @match        https://fcresearch-eu.aka.amazon.com/ETZ2*
// @match        https://fcresearch-eu.aka.amazon.com/ETZ2/*
// @match        https://fcresearch-eu.aka.amazon.com/*
// @match        https://qi-fcresearch-eu.corp.amazon.com/ETZ2*
// @match        https://fcresearch-eu.aka.amazon.com/*/results?s=*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// @connect      roboscout.amazon.com
// @connect      fcresearch-eu.aka.amazon.com
// @connect      fcresearch-na.aka.amazon.com
// @connect      aft-sherlock.eu.aftx.amazonoperations.app
// @connect      qi-fcresearch-eu.corp.amazon.com
// @connect      localhost
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery-cookie/1.4.1/jquery.cookie.min.js
// @require      https://cdn.jsdelivr.net/npm/jsbarcode@3.11.0/dist/JsBarcode.all.min.js
// ==/UserScript==

(function() {
    'use strict';

    // ════════════════════════════════════════════════════════════════
    // ===== MODULE SYSTEM (simplifié) =====
    // ════════════════════════════════════════════════════════════════
    const MODULES = {
        godModePrint: { label: '🖨️ God Mode (impression)',  default: true },
        floorFinder:  { label: '🗺️ Floor Finder (bins)',    default: true },
        binCheck:     { label: '✅ Bin Check Generator',    default: true },
    };

    const MODULE_CACHE = {};
    Object.keys(MODULES).forEach(k => { MODULE_CACHE[k] = GM_getValue('module_' + k, MODULES[k].default); });

    function isModuleEnabled(key) {
        if (!MODULES[key]) return true;
        return key in MODULE_CACHE ? MODULE_CACHE[key] : GM_getValue('module_' + key, MODULES[key].default);
    }

    // ════════════════════════════════════════════════════════════════
    // ===== CONFIG RÉGION =====
    // ════════════════════════════════════════════════════════════════
    let REGION = GM_getValue('userRegion', 'EU');
    const URLS = {
        fcresearch: { NA: 'https://fcresearch-na.aka.amazon.com', EU: 'https://fcresearch-eu.aka.amazon.com' },
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
        let wfkeTimer = null;
        const obs = new MutationObserver(() => {
            clearTimeout(wfkeTimer);
            wfkeTimer = setTimeout(() => {
                const found = processMatches();
                if (found && runOnce) obs.disconnect();
            }, 80);
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
    // ===== SENDMESSAGE / SLACK LOG (God Mode) =====
    // ════════════════════════════════════════════════════════════════
    var Print_Status;
    var lastPrintedBarcode = '', lastPrintTime = 0;

    function sendMessageNew(mode, asin, type, quantity, desc, link) {
        var lt = new Date().toLocaleString() + " (" + Intl.DateTimeFormat().resolvedOptions().timeZone + ")";
        var d = new Date(); var tz = d.toString().split("GMT")[1];
        var ip = getCookie("fcmenu-remoteAddr");
        var whid = getCookie("fcmenu-warehouseId");
        var login = getCookie("fcmenu-employeeLogin");
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

    function quickPrint(asin, quantity, desc, type, link) {
        asin = asin.trim();
        getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(asin) + "&text=" + asciihex(asin) + "&quantity=" + quantity + "&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=" + asciihex(desc) + "&seq=" + genId(), "Print Button", asin, type, quantity, desc, link);
    }

    function quickPrint2(barcode, type) {
        barcode = barcode.trim();
        getStatus("http://localhost:5965/printer?action=print&type=barcode&data=" + asciihex(barcode) + "&text=" + asciihex(barcode) + "&quantity=1&badgeid=" + getCookie("fcmenu-employeeId") + "&desc=&seq=" + genId(), "Alt-Click", barcode, type, 1, "N/A", "N/A");
    }

    // ════════════════════════════════════════════════════════════════
    // ===== CSS (barcodes + print buttons) =====
    // ════════════════════════════════════════════════════════════════
    GM_addStyle(`
        .barcodes_cover { display:none;position:fixed;top:0;bottom:0;left:0;right:0;background-color:#f3f3f3cc;z-index:160;align-items:center;justify-items:center; }
        .barcodes_cover>.barcodes_panel { display:inline;width:100px;height:350px;background-color:#fff;border:1px solid #aaa;border-radius:5px;min-width:25rem;min-height:17rem;grid-template-rows:10% auto;align-items:center;justify-items:center;box-shadow:1px 1px 4px #999; }
        .barcodes_cover>.barcodes_panel>p { display:block;margin-top:1rem;color:#444; }
        .print-button-container { display:inline-block;margin-left:5px; }
        .loading.adjacent_bin_finder_spinner { display:inline-block;margin-left:5px; }
        .s-icon-status { display:inline-block; }
        #disposition-filter, #consumer-filter, #container-filter, #bin-check-comment { background:#ffffff; color:#222; border-color:#ccc; }
    `);

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
                                button.style.cssText = "padding:2px 8px;margin-left:4px;cursor:pointer;border:1px solid #aaa;border-radius:3px;background:#f0f0f0;";
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
                                method: "GET",
                        withCredentials: true, url: url,
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
                    var observer = new MutationObserver(debounce(function(mutations) {
                        var inventorySection = document.querySelector('.section-placeholder[data-section-type="inventory"]');
                        if (inventorySection && !hasAutoTriggered) {
                            hasAutoTriggered = true;
                            observer.disconnect();
                            clearInterval(pollInterval);
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
                    }, 250));
                    observer.observe(document.body, { childList: true, subtree: true });
                    var pollInterval = setInterval(function() {
                        if (!hasAutoTriggered) checkForInventory();
                        else { clearInterval(pollInterval); observer.disconnect(); }
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
                        withCredentials: true,
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

            // Remplace le setInterval 1s par un MutationObserver ciblé + fallback
            let binCheckDone = false;
            function tryAddBinCheck() {
                if (binCheckDone) return;
                if (document.querySelector('[data-section-type="inventory"]') && document.querySelector('#table-inventory')) {
                    binCheckDone = true;
                    binCheckObs.disconnect();
                    addBinCheckButton();
                    document.addEventListener('keydown', (e) => { if (e.altKey && e.key === 'p') { e.preventDefault(); generateBinCheckList(); } });
                }
            }
            const binCheckRoot = document.querySelector('main') || document.querySelector('#content') || document.body;
            let binCheckObsTimer = null;
            const binCheckObs = new MutationObserver(() => {
                clearTimeout(binCheckObsTimer);
                binCheckObsTimer = setTimeout(tryAddBinCheck, 150);
            });
            binCheckObs.observe(binCheckRoot, { childList: true, subtree: true });
            tryAddBinCheck(); // Essai immédiat si déjà chargé
            setTimeout(() => { binCheckObs.disconnect(); }, 20000); // Sécurité 20s
        })();
    }

})();
