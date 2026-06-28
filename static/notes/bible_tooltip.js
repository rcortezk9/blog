/**
 * bible_tooltip.js — Byzantine parchment hover tooltips for Bible verse links.
 *
 * Loads bible.json once on first hover (same lazy pattern as glossary_tooltip.js),
 * then does an instant dictionary lookup keyed by the link's href path.
 * No per-verse HTTP requests; no HTML parsing.
 */

const BASE_URL = "/notes";
const BIBLE_PATH_PREFIX = '/bible/';
const BIBLE_JSON_URL = BASE_URL + '/bible.json';

const TOOLTIP_CSS = `
  #bv-tooltip {
    position: fixed;
    z-index: 9999;
    max-width: 360px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  #bv-tooltip.visible { opacity: 1; }
  #bv-tooltip-inner {
    background: var(--bg-color, #F7F3E9);
    color: var(--text-color, #2C1810);
    border: 1px solid var(--sidebar-border, #C4A35A);
    border-left: 3px solid var(--accent-color, #B8860B);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    font-family: var(--font-main, 'EB Garamond', Georgia, serif);
    font-size: 0.95rem;
    line-height: 1.6;
    box-shadow: 0 4px 16px rgba(44, 24, 16, 0.18);
    max-height: 220px;
    overflow: hidden;
  }
  #bv-tooltip-ref {
    font-family: 'Cinzel', 'Trajan Pro', Georgia, serif;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-color, #B8860B);
    margin-bottom: 0.4rem;
    font-weight: 600;
  }
  #bv-tooltip-verse {
    margin: 0 0 0.5rem;
    font-style: italic;
  }
  #bv-tooltip-osb {
    margin: 0;
    font-size: 0.82rem;
    color: color-mix(in srgb, var(--text-color, #2C1810), transparent 20%);
    border-top: 1px solid color-mix(in srgb, var(--accent-color, #B8860B), transparent 65%);
    padding-top: 0.45rem;
  }
  #bv-tooltip-osb-label {
    font-family: 'Cinzel', serif;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent-color, #B8860B);
    opacity: 0.8;
    display: block;
    margin-bottom: 0.2rem;
  }
`;

// ── DOM bootstrap ────────────────────────────────────────────────────────────

function injectStyles() {
  const style = document.createElement('style');
  style.textContent = TOOLTIP_CSS;
  document.head.appendChild(style);
}

function buildTooltipEl() {
  const el = document.createElement('div');
  el.id = 'bv-tooltip';
  el.innerHTML = `
    <div id="bv-tooltip-inner">
      <div id="bv-tooltip-ref"></div>
      <p id="bv-tooltip-verse"></p>
      <p id="bv-tooltip-osb" style="display:none">
        <span id="bv-tooltip-osb-label">OSB Note</span>
        <span id="bv-tooltip-osb-text"></span>
      </p>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

// ── Data loading ──────────────────────────────────────────────────────────────

let bibleData = null;
let loadPromise = null;

function loadBibleData() {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(BIBLE_JSON_URL, { cache: 'force-cache' })
    .then(r => r.ok ? r.json() : {})
    .then(data => { bibleData = data; return data; })
    .catch(() => { bibleData = {}; return {}; });
  return loadPromise;
}

function lookupVerse(href) {
  // Strip /notes prefix so the key matches bible.json's /bible/{book}/{slug} format.
  const key = href.replace(/^\/notes/, '');
  return bibleData ? (bibleData[key] ?? null) : null;
}

// ── Tooltip positioning ──────────────────────────────────────────────────────

function positionTooltip(tooltip, anchorRect) {
  const OFFSET = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = Math.min(360, vw - 24);

  tooltip.style.maxWidth = tw + 'px';

  let left = anchorRect.left;
  let top  = anchorRect.bottom + OFFSET;

  if (top + 240 > vh) {
    top = anchorRect.top - 240 - OFFSET;
    if (top < 8) top = 8;
  }

  if (left + tw > vw - 8) left = vw - tw - 8;
  if (left < 8) left = 8;

  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
}

// ── Main controller ──────────────────────────────────────────────────────────

function isBibleLink(a) {
  const href = a.getAttribute('href') || '';
  return href.includes(BIBLE_PATH_PREFIX);
}

function init() {
  injectStyles();
  const tooltip = buildTooltipEl();

  const refEl   = document.getElementById('bv-tooltip-ref');
  const verseEl = document.getElementById('bv-tooltip-verse');
  const osbEl   = document.getElementById('bv-tooltip-osb');
  const osbText = document.getElementById('bv-tooltip-osb-text');

  let hoverTimer = null;
  let activeHref = null;

  function showFor(a) {
    const href = a.getAttribute('href');
    if (activeHref === href) return;
    activeHref = href;

    loadBibleData().then(() => {
      if (activeHref !== href) return;
      const data = lookupVerse(href);
      if (!data) return;

      refEl.textContent   = data.ref || href.split('/').pop().replace(/_/g, ':');
      verseEl.textContent = data.verse || '(verse text not found)';

      if (data.osb) {
        osbText.textContent = data.osb;
        osbEl.style.display = '';
      } else {
        osbEl.style.display = 'none';
      }

      positionTooltip(tooltip, a.getBoundingClientRect());
      tooltip.classList.add('visible');
    });
  }

  function hide() {
    activeHref = null;
    tooltip.classList.remove('visible');
  }

  document.addEventListener('mouseover', e => {
    const a = e.target.closest('a');
    if (!a || !isBibleLink(a)) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => showFor(a), 180);
  });

  document.addEventListener('mouseout', e => {
    const a = e.target.closest('a');
    if (!a || !isBibleLink(a)) return;
    clearTimeout(hoverTimer);
    hide();
  });

  document.addEventListener('focusout', e => {
    const a = e.target.closest('a');
    if (a && isBibleLink(a)) hide();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
