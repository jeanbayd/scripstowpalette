// ==UserScript==
// @name         Sideline Refonte — JB Edition (Neo-Tokyo Neon)
// @namespace    https://jeanbayd.local/sideline-refonte
// @version      5.0.0
// @description  Refonte graphique complète du Sideline Application (Poirot V3) — thème "Neo-Tokyo" : cyberpunk néon bleu, titre en enseigne lumineuse, boutons de sidebar réellement thémés via injection Shadow DOM.
// @author       jeanbayd
// @match        https://aft-poirot-website-dub.dub.proxy.amazon.com/*
// @match        https://aft-poirot-website*.proxy.amazon.com/*
// @icon         https://m.media-amazon.com/images/G/01/AmazonExports/Fashion/AmazonFashion/favicon._CB485921485_.ico
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    /* ====================================================================
       SIDELINE REFONTE — JB EDITION — "NEO-TOKYO"
       v5 : le titre "Sideline Application" devient une véritable enseigne
       néon (glow tube + léger scintillement réaliste, plus de badge
       "CLASSIFIED" clignotant). Les boutons <alchemy-button> du panneau
       latéral droit (Change Container, Item Issue...) rendent leur
       <button> réel dans un Shadow DOM *ouvert* : le CSS de page ne peut
       pas l'atteindre, d'où le rendu gris resté par défaut. On corrige ça
       en injectant une feuille de style directement dans chaque shadow
       root ouvert (et on observe le DOM pour couvrir les boutons ajoutés
       dynamiquement).
       ==================================================================== */

    const STYLE_ID = 'sideline-refonte-jb-style';
    const old = document.getElementById(STYLE_ID);
    if (old) old.remove(); // permet de recharger une version plus récente sans reload complet

    const css = `
    :root {
        --sp-bg-0: #05040d;
        --sp-bg-1: #0a0a1a;
        --sp-panel: #0b0e22;
        --sp-blue: #21e6ff;
        --sp-blue-strong: #9df6ff;
        --sp-blue-dim: #1177a3;
        --sp-magenta: #ff2ea6;
        --sp-magenta-dim: #7a1a5e;
        --sp-amber: #ffb020;
        --sp-red: #ff3860;
        --sp-text: #d6f6ff;
        --sp-text-dim: #5c7a99;
        --sp-border: rgba(33,230,255,0.4);
        --sp-glow: 0 0 8px rgba(33,230,255,0.6), 0 0 22px rgba(33,230,255,0.28), 0 0 44px rgba(33,230,255,0.1);
        --sp-glow-magenta: 0 0 8px rgba(255,46,166,0.55), 0 0 22px rgba(255,46,166,0.2);
        --sp-font: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace;
        --sp-radius: 0px;
        --sp-chamfer: 10px;
    }

    /* ================= FOND GLOBAL — ruelle néon / perspective grid ================= */
    html, body.alchemy-light-theme, #app-root.bg-gray, .viewport {
        background: var(--sp-bg-0) !important;
        background-image:
            linear-gradient(rgba(33,230,255,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(33,230,255,0.06) 1px, transparent 1px),
            radial-gradient(ellipse 1000px 550px at 15% -10%, rgba(33,230,255,0.14) 0%, transparent 60%),
            radial-gradient(ellipse 800px 500px at 105% 10%, rgba(255,46,166,0.10) 0%, transparent 55%),
            linear-gradient(180deg, #05040d 0%, #0a0a1f 55%, #05040d 100%) !important;
        background-size: 26px 26px, 26px 26px, auto, auto, auto !important;
        background-attachment: fixed !important;
        color: var(--sp-text) !important;
        font-family: var(--sp-font) !important;
        min-height: 100vh;
    }

    /* Scanlines CRT + vignette (overlay non interactif) */
    #app-root.bg-gray::before {
        content: '';
        position: fixed; inset: 0; z-index: 9990; pointer-events: none;
        background:
            repeating-linear-gradient(
                to bottom,
                rgba(0,0,0,0) 0px,
                rgba(0,0,0,0) 2px,
                rgba(0,0,0,0.12) 3px
            ),
            radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%);
        mix-blend-mode: multiply;
        opacity: 0.6;
    }
    /* scintillement néon global (ambiance générale, discret) */
    @keyframes sp-flicker {
        0%, 92%, 100% { opacity: 1; }
        93% { opacity: 0.85; }
        94% { opacity: 1; }
        95% { opacity: 0.9; }
        96% { opacity: 1; }
    }
    #app-root.bg-gray { animation: sp-flicker 6s infinite; }
    @media (prefers-reduced-motion: reduce) {
        #app-root.bg-gray { animation: none; }
    }

    * { scrollbar-width: thin; scrollbar-color: var(--sp-blue-dim) transparent; }
    *::-webkit-scrollbar { width: 8px; height: 8px; }
    *::-webkit-scrollbar-track { background: transparent; }
    *::-webkit-scrollbar-thumb { background: var(--sp-blue-dim); border-radius: 0; }
    *::-webkit-scrollbar-thumb:hover { background: var(--sp-blue); }

    /* Typographie générale */
    .text, span, label, button, alchemy-button, input, select {
        font-family: var(--sp-font) !important;
    }
    .text--size-lg, .text--size-xl, .text--size-xxl, .text--size-xxxl {
        letter-spacing: 0.6px;
    }

    /* ================= NAVBAR — enseigne néon ================= */
    .ps-nav-bar {
        background: linear-gradient(180deg, #07091a 0%, #020208 100%) !important;
        border-bottom: 1px solid var(--sp-border);
        box-shadow: 0 0 24px rgba(33,230,255,0.22), 0 2px 0 rgba(255,46,166,0.25), inset 0 -1px 0 rgba(33,230,255,0.2);
        position: relative;
        z-index: 9991;
    }
    .ps-nav-bar::after {
        content: '';
        position: absolute; left: 0; right: 0; bottom: -2px; height: 2px;
        background: linear-gradient(90deg, var(--sp-blue) 0%, var(--sp-magenta) 50%, var(--sp-blue) 100%);
        opacity: 0.7;
        filter: blur(0.5px);
    }
    .navbar .text--size-lg {
        color: var(--sp-text-dim) !important;
        text-transform: uppercase;
        font-size: 12px !important;
        letter-spacing: 1.5px;
    }

    /* Titre "Sideline Application" = tube néon allumé : cœur quasi-blanc,
       halo bleu multi-couches, léger scintillement réaliste de tube usé
       (pas un clignotement on/off franc). */
    .navbar .font-weight-bold {
        color: #eafcff !important;
        background: none !important;
        text-transform: uppercase;
        letter-spacing: 2px;
        font-size: 14px !important;
        font-weight: 700 !important;
        position: relative;
        text-shadow:
            0 0 2px #eafcff,
            0 0 6px #eafcff,
            0 0 14px var(--sp-blue),
            0 0 26px var(--sp-blue),
            0 0 48px rgba(33,230,255,0.55),
            0 0 90px rgba(33,230,255,0.25);
        animation: sp-neon-sign 6s infinite;
    }
    .navbar .font-weight-bold::before {
        content: '// ';
        color: var(--sp-blue-dim);
        text-shadow: none;
        font-weight: 400;
    }
    /* accent katakana décoratif — petit tube secondaire magenta, greffé sur la même enseigne */
    .navbar .font-weight-bold::after {
        content: '『サイドライン』';
        margin-left: 12px;
        font-size: 10px;
        letter-spacing: 1px;
        color: #ffd6f0;
        text-shadow: 0 0 3px #ffd6f0, 0 0 10px var(--sp-magenta), 0 0 22px rgba(255,46,166,0.5);
        opacity: 0.85;
        vertical-align: middle;
        animation: sp-neon-sign 6s infinite 0.4s;
    }
    /* scintillement de tube néon : reste allumé, avec deux courtes baisses d'intensité imprévisibles */
    @keyframes sp-neon-sign {
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
    @media (prefers-reduced-motion: reduce) {
        .navbar .font-weight-bold, .navbar .font-weight-bold::after { animation: none; }
    }

    /* menu latéral (menu hamburger) */
    .menu .menu--inner {
        background: linear-gradient(180deg, var(--sp-bg-1) 0%, #020208 100%) !important;
        border-right: 1px solid var(--sp-border);
        box-shadow: 6px 0 34px rgba(0,0,0,0.75), inset -1px 0 0 rgba(255,46,166,0.08);
    }
    .menu--header .text { color: var(--sp-blue) !important; text-transform: uppercase; letter-spacing: 1px; }
    .menu--shade { background: rgba(2,2,10,0.8) !important; backdrop-filter: blur(2px); }

    /* ================= BOUTONS NATIFS (hors Shadow DOM) — coins chanfreinés cyberpunk =================
       Concerne les <button class="btn-ghost">, <button class="btn-secondary">, etc.
       qui sont directement dans le DOM de la page (Start Over, Sign Out, Confirm...).
       Les <alchemy-button> du panneau latéral droit sont traités séparément plus bas
       car leur <button> réel vit dans un Shadow DOM fermé aux styles de la page. */
    .btn-ghost, .btn-secondary, .btn-tertiary,
    button:not(.btn-primary), .btn, [class*="btn-"] {
        background: linear-gradient(135deg, rgba(11,14,34,0.9) 0%, rgba(5,4,13,0.95) 100%) !important;
        border: 1px solid var(--sp-border) !important;
        color: var(--sp-text) !important;
        border-radius: 0 !important;
        clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 12px !important;
        position: relative;
        transition: all 0.12s ease;
        box-shadow: inset 0 0 12px rgba(33,230,255,0.06);
    }
    .btn-ghost:hover:not(:disabled), .btn-secondary:hover:not(:disabled), .btn-tertiary:hover:not(:disabled),
    button:not(.btn-primary):hover:not(:disabled), .btn:hover:not(:disabled) {
        background: var(--sp-blue) !important;
        border-color: var(--sp-blue) !important;
        color: var(--sp-bg-0) !important;
        box-shadow: var(--sp-glow);
        text-shadow: none;
    }
    .btn-ghost:disabled, .btn-secondary:disabled, .btn-tertiary:disabled,
    button:disabled, .btn:disabled, [class*="btn-"]:disabled,
    .btn-ghost[aria-disabled="true"], .btn-secondary[aria-disabled="true"],
    button[aria-disabled="true"], .btn[aria-disabled="true"] {
        background: rgba(8,10,24,0.6) !important;
        border: 1px dashed rgba(33,230,255,0.28) !important;
        color: var(--sp-text-dim) !important;
        text-shadow: none !important;
        box-shadow: none !important;
        opacity: 0.7 !important;
        cursor: not-allowed;
    }

    /* Wrapper <alchemy-button> lui-même (léger effet au survol, hors Shadow DOM) */
    alchemy-button {
        display: inline-block;
        border-radius: 0;
        transition: transform 0.1s ease;
    }
    alchemy-button:hover { transform: translateX(2px); }
    .scrollable-layout alchemy-button {
        display: block !important;
        margin-bottom: 3px;
    }

    /* ================= PANNEAUX / CARTES ("box") — inclut Source Container & Item Issue ================= */
    .box.box--default {
        background: linear-gradient(165deg, rgba(11,14,34,0.94) 0%, rgba(3,3,10,0.97) 100%) !important;
        border: 1px solid var(--sp-border) !important;
        border-radius: 0 !important;
        clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
        box-shadow: 0 8px 30px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(33,230,255,0.05);
        position: relative;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .box.box--default:hover {
        border-color: var(--sp-blue) !important;
        box-shadow: var(--sp-glow), 0 8px 30px rgba(0,0,0,0.6);
    }
    .box.box--default::before,
    .box.box--default::after {
        content: '';
        position: absolute; width: 14px; height: 14px;
        border-color: var(--sp-magenta);
        pointer-events: none;
        opacity: 0.85;
        transition: border-color 0.15s ease, opacity 0.15s ease;
    }
    .box.box--default::before {
        top: -1px; left: -1px;
        border-top: 2px solid; border-left: 2px solid;
    }
    .box.box--default::after {
        bottom: -1px; right: -1px;
        border-bottom: 2px solid; border-right: 2px solid;
    }
    .box.box--default:hover::before,
    .box.box--default:hover::after {
        border-color: var(--sp-blue);
        opacity: 1;
    }
    .box.box--gray {
        background: rgba(33,230,255,0.04) !important;
        border: 1px dashed var(--sp-border) !important;
        border-radius: 0 !important;
    }
    .box .text--size-lg.font-weight-bold,
    .box h3, .box h4 {
        color: var(--sp-blue) !important;
        text-transform: uppercase;
        letter-spacing: 1px;
        text-shadow: var(--sp-glow);
    }

    /* ================= TITRE DE TÂCHE — effet glitch ================= */
    .taskComponentHeader { padding-bottom: 6px; }
    #task-component-title {
        font-size: clamp(1.1rem, 1.8vw, 1.5rem) !important;
        font-weight: 600 !important;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: var(--sp-blue) !important;
        text-shadow: var(--sp-glow);
        position: relative;
        display: inline-block;
    }
    #task-component-title::before {
        content: '> ';
        color: var(--sp-blue-dim);
        font-weight: 400;
    }
    #task-component-title::after {
        content: '_';
        color: var(--sp-magenta);
        animation: sp-blink 1s steps(1) infinite;
        margin-left: 2px;
    }
    @keyframes sp-blink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: 0.3; } }
    @media (prefers-reduced-motion: reduce) { #task-component-title::after { animation: none; } }
    #task-component-title .font-weight-bold,
    #task-component-title .text--variant-bright-blue,
    #task-component-title span {
        color: var(--sp-blue) !important;
    }

    /* ================= CHAMPS DE SAISIE — vitre néon ================= */
    .field-input, input[type="text"], input[type="number"] {
        background: #030510 !important;
        border: 1px solid var(--sp-border) !important;
        color: var(--sp-blue-strong) !important;
        border-radius: 0 !important;
        clip-path: polygon(10px 0, 100% 0, 100% 100%, 0 100%, 0 10px);
        padding: 10px 14px !important;
        font-size: 15px !important;
        letter-spacing: 1px;
        text-transform: uppercase;
        caret-color: var(--sp-magenta);
        transition: border-color 0.12s ease, box-shadow 0.12s ease;
    }
    .field-input:focus, input[type="text"]:focus, input[type="number"]:focus {
        outline: none !important;
        border-color: var(--sp-blue) !important;
        box-shadow: var(--sp-glow) !important;
    }
    .field-input::placeholder { color: var(--sp-text-dim) !important; opacity: 0.7; }

    /* ================= BOUTON PRINCIPAL (Confirm, etc.) ================= */
    button.btn-primary {
        background: transparent !important;
        border: 1.5px solid var(--sp-blue) !important;
        color: var(--sp-blue) !important;
        font-weight: 700 !important;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        border-radius: 0 !important;
        clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
        box-shadow: inset 0 0 14px rgba(33,230,255,0.08);
        transition: background 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
    }
    button.btn-primary:hover:not(:disabled) {
        background: var(--sp-blue) !important;
        color: var(--sp-bg-0) !important;
        box-shadow: var(--sp-glow);
    }
    button.btn-primary:disabled {
        border-color: rgba(255,255,255,0.15) !important;
        color: var(--sp-text-dim) !important;
        cursor: not-allowed;
    }

    /* ================= TAGS (alchemy-tag) ================= */
    alchemy-tag {
        --tag-default-background-color: transparent !important;
        --tag-default-color: var(--sp-blue-strong) !important;
        border: 1px solid var(--sp-border) !important;
        border-radius: 0 !important;
        text-transform: uppercase;
        font-size: 11px !important;
        letter-spacing: 0.5px;
    }
    alchemy-tag b, alchemy-tag .text { letter-spacing: 0.5px; }

    /* ================= TEXTE GÉNÉRIQUE ================= */
    .text--variant-black { color: var(--sp-text) !important; }
    .text--variant-bright-blue { color: var(--sp-blue) !important; }
    .text--variant-white { color: var(--sp-text) !important; }
    label .text--size-lg { color: var(--sp-text-dim) !important; text-transform: uppercase; font-size: 11px !important; letter-spacing: 1px; }
    label .font-weight-bold { color: var(--sp-blue-strong) !important; }

    /* ================= SOURCE CONTAINER ================= */
    #source-container-label {
        display: inline-block;
        margin-top: 4px;
        padding: 3px 10px;
        background: rgba(33,230,255,0.08);
        border: 1px solid var(--sp-border);
        clip-path: polygon(6px 0, 100% 0, 100% 100%, 0 100%, 0 6px);
        font-size: 12px;
        color: var(--sp-amber) !important;
        letter-spacing: 1px;
    }
    #source-container-label::before { content: 'ID:'; color: var(--sp-text-dim); margin-right: 4px; }

    /* ================= SÉPARATEURS ================= */
    .divider, hr.divider {
        border: none !important;
        height: 1px !important;
        background: repeating-linear-gradient(
            to right, var(--sp-border) 0, var(--sp-border) 6px, transparent 6px, transparent 12px
        ) !important;
    }

    /* ================= ALERTES ================= */
    .alert.alert--info {
        background: rgba(255,176,32,0.08) !important;
        border: 1px solid rgba(255,176,32,0.5) !important;
        border-radius: 0 !important;
    }
    .alert.alert--info::before {
        content: '⚠ ALERT ';
        display: block;
        font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
        color: var(--sp-amber); margin-bottom: 4px;
    }
    .alert.alert--info .text--variant-white { color: #ffe4b0 !important; }

    /* ================= IMAGES ================= */
    .product-image, .example-image, .image-container {
        border-radius: 0 !important;
        filter: contrast(1.08) saturate(0.92);
    }
    .image-container {
        background: rgba(33,230,255,0.04);
        border: 1px solid var(--sp-border);
    }
    .image-selection-item--active .image-container {
        border-color: var(--sp-blue) !important;
        box-shadow: 0 0 0 1px var(--sp-blue), var(--sp-glow);
    }
    .example-image { border: 1px solid var(--sp-border); }

    /* ================= CAMÉRA ================= */
    .camera-preview .box.box--gray {
        background: rgba(33,230,255,0.05) !important;
        border-style: dashed !important;
    }

    /* ================= RÉSUMÉ QUANTITÉ ================= */
    #container-item-quantity, #container-number-of-rows {
        color: var(--sp-blue-strong) !important;
        text-shadow: var(--sp-glow);
    }

    /* ================= FOCUS CLAVIER ================= */
    a:focus-visible, button:focus-visible, input:focus-visible, alchemy-button:focus-visible {
        outline: 1.5px solid var(--sp-magenta) !important;
        outline-offset: 2px !important;
    }

    div[style*="border-radius: 4px"] { border-radius: 0 !important; }
    `;

    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* ------------------------------------------------------------------
       INJECTION DANS LE SHADOW DOM DES <alchemy-button>
       ------------------------------------------------------------------
       Le vrai <button> rendu par <alchemy-button> vit dans un shadow
       root ouvert (shadowrootmode="open"). Le CSS injecté dans <head>
       de la page ne peut pas le styler : il faut poser un <style>
       directement à l'intérieur de chaque shadow root. C'est ce qui
       explique pourquoi "Change Container", "Back to Source Container",
       "Unscannable", "Missing Label", etc. restaient gris/blancs malgré
       le thème appliqué partout ailleurs.
       ------------------------------------------------------------------ */
    const SHADOW_STYLE_ID = 'sp-shadow-btn-style';
    const shadowCss = `
        button.alchemy-button-container {
            background: linear-gradient(135deg, rgba(11,14,34,0.92) 0%, rgba(5,4,13,0.97) 100%) !important;
            border: 1px solid rgba(33,230,255,0.4) !important;
            color: #d6f6ff !important;
            border-radius: 0 !important;
            clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
            text-transform: uppercase !important;
            letter-spacing: 1px !important;
            font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace !important;
            font-size: 12px !important;
            box-shadow: inset 0 0 12px rgba(33,230,255,0.06) !important;
            transition: all 0.12s ease !important;
        }
        button.alchemy-button-container:hover:not(.disabled) {
            background: #21e6ff !important;
            border-color: #21e6ff !important;
            color: #05040d !important;
            box-shadow: 0 0 8px rgba(33,230,255,0.6), 0 0 22px rgba(33,230,255,0.28), 0 0 44px rgba(33,230,255,0.1) !important;
        }
        button.alchemy-button-container.disabled {
            background: rgba(8,10,24,0.6) !important;
            border: 1px dashed rgba(33,230,255,0.28) !important;
            color: #5c7a99 !important;
            opacity: 0.7 !important;
            box-shadow: none !important;
            cursor: not-allowed !important;
        }
    `;

    function injectShadowStyle(el) {
        const root = el.shadowRoot;
        if (!root) return;
        if (root.getElementById(SHADOW_STYLE_ID)) return;
        const s = document.createElement('style');
        s.id = SHADOW_STYLE_ID;
        s.textContent = shadowCss;
        root.appendChild(s);
    }

    function themeAllAlchemyButtons() {
        document.querySelectorAll('alchemy-button').forEach(injectShadowStyle);
    }

    themeAllAlchemyButtons();
    const mo = new MutationObserver(() => themeAllAlchemyButtons());
    mo.observe(document.body, { childList: true, subtree: true });

})();
