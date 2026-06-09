/**
 * bible_tooltip.js — Byzantine parchment hover tooltips for Bible verse links.
 *
 * Attaches to any <a class="internal-link"> whose href starts with BIBLE_PATH_PREFIX.
 * On hover it fetches the pre-built Kiln HTML page, extracts the verse text and OSB
 * study note from the .content div, and displays a styled popup near the cursor.
 *
 * Works offline — fetches the same static files Kiln already built. No server needed.
 *
 * Adjust BIBLE_PATH_PREFIX if Kiln ever changes how it renders the Bible folder path.
 */

const BIBLE_PATH_PREFIX = '/bible/';

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

// ── Fetch + parse ────────────────────────────────────────────────────────────

const cache = new Map();

async function fetchVerse(href) {
  if (cache.has(href)) return cache.get(href);

  // Try bare href first (kiln serve handles routing), then .html fallback.
  const urls = [href, href + '.html'];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = parseVerseHtml(html);
      cache.set(href, parsed);
      return parsed;
    } catch (_) { /* try next */ }
  }
  return null;
}

function parseVerseHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const content = doc.querySelector('.content');
  if (!content) return null;

  // Kiln puts the page title in the sidebar, not in .content — read <title> instead.
  // Format: "John 3:16 • Theology Notes" → take everything before " • ".
  const titleEl = doc.querySelector('title');
  const rawTitle = titleEl ? titleEl.textContent.trim() : '';
  const ref = rawTitle.split(' • ')[0] || '';

  // First <p> that contains actual verse text (skip empty ones).
  let verse = '';
  const paras = content.querySelectorAll('p');
  for (const p of paras) {
    const t = p.textContent.trim();
    if (t.length > 8) { verse = t; break; }
  }

  // OSB note: look for a heading containing "OSB" or "note" (case-insensitive),
  // then grab the first <p> after it.
  let osb = '';
  const headings = content.querySelectorAll('h2, h3');
  for (const h of headings) {
    if (/osb|note/i.test(h.textContent)) {
      let sib = h.nextElementSibling;
      while (sib) {
        if (sib.tagName === 'P') { osb = sib.textContent.trim(); break; }
        if (/^H[1-6]$/.test(sib.tagName)) break;
        sib = sib.nextElementSibling;
      }
      break;
    }
  }

  return { ref, verse, osb };
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

  // Flip above if too close to bottom.
  if (top + 240 > vh) {
    top = anchorRect.top - 240 - OFFSET;
    if (top < 8) top = 8;
  }

  // Keep inside viewport horizontally.
  if (left + tw > vw - 8) left = vw - tw - 8;
  if (left < 8) left = 8;

  tooltip.style.left = left + 'px';
  tooltip.style.top  = top  + 'px';
}

// ── Main controller ──────────────────────────────────────────────────────────

function isBibleLink(a) {
  const href = a.getAttribute('href') || '';
  return href.startsWith(BIBLE_PATH_PREFIX);
}

function init() {
  injectStyles();
  const tooltip = buildTooltipEl();

  const refEl  = document.getElementById('bv-tooltip-ref');
  const verseEl = document.getElementById('bv-tooltip-verse');
  const osbEl  = document.getElementById('bv-tooltip-osb');
  const osbText = document.getElementById('bv-tooltip-osb-text');

  let hoverTimer = null;
  let activeHref = null;

  function showFor(a) {
    const href = a.getAttribute('href');
    if (activeHref === href) return;
    activeHref = href;

    fetchVerse(href).then(data => {
      if (!data || activeHref !== href) return;

      refEl.textContent   = data.ref || href.split('/').pop().replace(/_/g, ' ');
      verseEl.textContent = data.verse || '(verse text not found)';

      if (data.osb) {
        osbText.textContent    = data.osb;
        osbEl.style.display    = '';
      } else {
        osbEl.style.display    = 'none';
      }

      positionTooltip(tooltip, a.getBoundingClientRect());
      tooltip.classList.add('visible');
    });
  }

  function hide() {
    activeHref = null;
    tooltip.classList.remove('visible');
  }

  // Use event delegation — catches links added after DOMContentLoaded.
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

  // Also hide if focus moves away via keyboard.
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
