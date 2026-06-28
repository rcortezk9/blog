/**
 * glossary_tooltip.js — Byzantine parchment hover tooltips for Orthodox theological terms.
 *
 * Attaches to any <span class="glossary-term" data-term="TERM"> element
 * (generated at build time by auto_link_glossary.py). On hover it shows a
 * styled popup with the term's definition drawn from glossary.json.
 *
 * Matches the visual style of bible_tooltip.js — reuses the same CSS variables.
 */

const BASE_URL = "/notes";
const GLOSSARY_URL = BASE_URL + "/glossary.json";

const GL_CSS = `
  #gl-tooltip {
    position: fixed;
    z-index: 9998;
    max-width: 340px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  #gl-tooltip.visible { opacity: 1; }
  #gl-tooltip-inner {
    background: var(--bg-color, #F7F3E9);
    color: var(--text-color, #2C1810);
    border: 1px solid var(--sidebar-border, #C4A35A);
    border-left: 3px solid var(--accent-color, #B8860B);
    border-radius: 6px;
    padding: 0.75rem 1rem;
    font-family: var(--font-main, 'EB Garamond', Georgia, serif);
    font-size: 0.92rem;
    line-height: 1.6;
    box-shadow: 0 4px 16px rgba(44, 24, 16, 0.18);
    max-height: 200px;
    overflow: hidden;
  }
  #gl-tooltip-term {
    font-family: 'Cinzel', 'Trajan Pro', Georgia, serif;
    font-size: 0.70rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-color, #B8860B);
    margin-bottom: 0.4rem;
    font-weight: 600;
  }
  #gl-tooltip-def {
    margin: 0;
    font-style: italic;
  }
  .glossary-term {
    border-bottom: 1px dotted var(--accent-color, #B8860B);
    cursor: help;
  }
`;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

let glossaryData = null;
let loadPromise = null;

function injectGlossaryStyles() {
  const style = document.createElement('style');
  style.textContent = GL_CSS;
  document.head.appendChild(style);
}

function buildTooltipEl() {
  const el = document.createElement('div');
  el.id = 'gl-tooltip';
  el.innerHTML = `
    <div id="gl-tooltip-inner">
      <div id="gl-tooltip-term"></div>
      <p id="gl-tooltip-def"></p>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

// ── Data loading ──────────────────────────────────────────────────────────────

function loadGlossary() {
  if (loadPromise) return loadPromise;
  loadPromise = fetch(GLOSSARY_URL, { cache: 'force-cache' })
    .then(r => r.ok ? r.json() : {})
    .then(data => { glossaryData = data; return data; })
    .catch(() => { glossaryData = {}; return {}; });
  return loadPromise;
}

// ── Tooltip positioning (mirrors bible_tooltip.js) ───────────────────────────

function positionTooltip(tooltip, anchorRect) {
  const OFFSET = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = Math.min(340, vw - 24);

  tooltip.style.maxWidth = tw + 'px';

  let left = anchorRect.left;
  let top  = anchorRect.bottom + OFFSET;

  if (top + 220 > vh) {
    top = anchorRect.top - 220 - OFFSET;
    if (top < 8) top = 8;
  }
  if (left + tw > vw - 8) left = vw - tw - 8;
  if (left < 8) left = 8;

  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
}

// ── Event handling ────────────────────────────────────────────────────────────

let activeSpan = null;
let hideTimer = null;
const HOVER_DELAY = 180;

function showTooltip(tooltip, span) {
  const term = span.dataset.term;
  if (!term || !glossaryData) return;

  const def = glossaryData[term];
  if (!def) return;

  document.getElementById('gl-tooltip-term').textContent = term;
  document.getElementById('gl-tooltip-def').textContent = def;

  positionTooltip(tooltip, span.getBoundingClientRect());
  tooltip.classList.add('visible');
  activeSpan = span;
}

function hideTooltip(tooltip) {
  tooltip.classList.remove('visible');
  activeSpan = null;
}

function attachHandlers(tooltip) {
  document.addEventListener('mouseover', e => {
    const span = e.target.closest('.glossary-term');
    if (!span) return;
    clearTimeout(hideTimer);
    loadGlossary().then(() => {
      if (activeSpan !== span) showTooltip(tooltip, span);
    });
  });

  document.addEventListener('mouseout', e => {
    if (!e.target.closest('.glossary-term')) return;
    hideTimer = setTimeout(() => hideTooltip(tooltip), 120);
  });

  // Re-position on scroll
  document.addEventListener('scroll', () => {
    if (activeSpan) positionTooltip(tooltip, activeSpan.getBoundingClientRect());
  }, { passive: true });
}

// ── Init (called on load and htmx navigation) ─────────────────────────────────

function initGlossaryTooltip() {
  if (!document.querySelector('.glossary-term')) return;
  loadGlossary();
}

function init() {
  injectGlossaryStyles();
  const tooltip = buildTooltipEl();
  attachHandlers(tooltip);
  initGlossaryTooltip();
}

document.addEventListener('DOMContentLoaded', init);
document.addEventListener('htmx:afterSwap', initGlossaryTooltip);
