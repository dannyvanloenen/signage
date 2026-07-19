import type { MenuData } from './api';
import { API_URL } from './api';

const fmt = (cents: number) => `€ ${(cents / 100).toFixed(2).replace('.', ',')}`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderItem(item: MenuData['categories'][0]['items'][0]): string {
  const img = item.image_url
    ? `<img class="item-img" src="${esc(API_URL + item.image_url)}" alt="${esc(item.name)}" loading="lazy" />`
    : '';
  const desc = item.description ? `<p class="item-desc">${esc(item.description)}</p>` : '';
  return `
    <li class="item">
      ${img}
      <div class="item-text">
        <span class="item-name">${esc(item.name)}</span>
        ${desc}
      </div>
      <span class="item-price">${fmt(item.price_cents)}</span>
    </li>`;
}

function renderCategory(cat: MenuData['categories'][0]): string {
  const available = cat.items.filter(i => i.is_available);
  if (available.length === 0) return '';
  const scale = (cat.text_scale ?? 100) / 100;
  const style = scale !== 1 ? ` style="--cat-scale:${scale}"` : '';
  return `
    <section class="category"${style}>
      <h2 class="cat-name">${esc(cat.name)}</h2>
      <ul class="items">
        ${available.map(renderItem).join('')}
      </ul>
    </section>`;
}

type Layout = 'grid' | 'center';

const VALID_THEMES = ['dark', 'warm', 'cool', 'minimal'];
const VALID_FONTS = ['default', 'serif', 'rounded', 'condensed', 'mono', 'display'];

function pick(urlValue: string | null, screenValue: string | undefined, valid: string[], fallback: string): string {
  if (urlValue && valid.includes(urlValue)) return urlValue;
  if (screenValue && valid.includes(screenValue)) return screenValue;
  return fallback;
}

/**
 * Past thema en lettertype toe op <html>. Volgorde: ?theme=/?font= in de URL
 * wint, anders de per-scherm voorkeur uit de payload, anders de standaard.
 */
function applyChrome(data: MenuData): void {
  const params = new URLSearchParams(location.search);
  const root = document.documentElement;

  const theme = pick(params.get('theme'), data.tenant.theme, VALID_THEMES, 'dark');
  if (theme === 'dark') delete root.dataset.theme; else root.dataset.theme = theme;

  const font = pick(params.get('font'), data.tenant.font, VALID_FONTS, 'default');
  if (font === 'default') delete root.dataset.font; else root.dataset.font = font;
}

/**
 * Bepaalt de uitlijning. ?layout=grid|center|split wint, dan de scherm-layout,
 * anders automatisch: 'center' (midden vrij) zodra er video draait.
 */
function getLayout(hasVideo: boolean, screenLayout: string | undefined): Layout {
  const raw = new URLSearchParams(location.search).get('layout');
  if (raw === 'center' || raw === 'split') return 'center';
  if (raw === 'grid') return 'grid';
  if (screenLayout === 'center') return 'center';
  if (screenLayout === 'grid') return 'grid';
  return hasVideo ? 'center' : 'grid';
}

/**
 * Auto-fit: verlaag de globale --fit (root-fontschaal) net zo lang tot geen
 * enkele categorie-itemlijst meer wordt afgeknipt, zodat het hele menu past.
 */
function fitToScreen(): void {
  const root = document.documentElement;
  root.style.setProperty('--fit', '1');
  const lists = Array.from(document.querySelectorAll<HTMLElement>('.items'));
  if (lists.length === 0) return;
  const overflowing = () => lists.some((el) => el.scrollHeight > el.clientHeight + 1);
  let fit = 1;
  let guard = 0;
  while (overflowing() && fit > 0.45 && guard < 24) {
    fit -= 0.04;
    root.style.setProperty('--fit', fit.toFixed(2));
    guard += 1;
  }
}

export function render(data: MenuData, page = 0, totalPages = 1): void {
  const app = document.getElementById('app')!;

  // Background image
  if (data.tenant.bg_image_url) {
    document.documentElement.style.setProperty('--bg-image', `url("${API_URL}${data.tenant.bg_image_url}")`);
    // Logo-grootte in JS uitrekenen tot een kant-en-klare px-waarde, zodat we
    // geen calc(min()) in CSS nodig hebben (niet ondersteund op oudere TV-browsers).
    const scale = (data.tenant.logo_scale ?? 100) / 100;
    const base = Math.min(window.innerHeight * 0.46, window.innerWidth * 0.40);
    document.documentElement.style.setProperty('--logo-size', `${Math.round(base * scale)}px`);
    document.body.classList.add('has-bg');
  } else {
    document.documentElement.style.removeProperty('--bg-image');
    document.documentElement.style.removeProperty('--logo-size');
    document.body.classList.remove('has-bg');
  }

  // Ambient glow element (only created once)
  if (!document.getElementById('ambient')) {
    const el = document.createElement('div');
    el.id = 'ambient';
    document.body.insertBefore(el, document.body.firstChild);
  }

  // Video background (created once, src updated as needed)
  let vid = document.getElementById('bg-video') as HTMLVideoElement | null;
  if (data.tenant.bg_video_url) {
    const src = API_URL + data.tenant.bg_video_url;
    if (!vid) {
      vid = document.createElement('video');
      vid.id = 'bg-video';
      vid.autoplay = true;
      vid.loop = true;
      vid.muted = true;
      vid.playsInline = true;
      document.body.insertBefore(vid, document.body.firstChild);
    }
    if (vid.dataset.src !== src) {
      vid.dataset.src = src;
      vid.src = src;
      vid.load();
    }
    document.body.classList.add('has-video');
  } else {
    if (vid) { vid.remove(); }
    document.body.classList.remove('has-video');
  }

  applyChrome(data);

  const catBlocks = data.categories.map(renderCategory).filter(Boolean);
  const layout = getLayout(!!data.tenant.bg_video_url, data.tenant.layout);

  let gridInner: string;
  let gridAttrs: string;
  if (layout === 'center' && catBlocks.length >= 2) {
    // Verdeel categorieën over een linker- en rechterkolom; de middenkolom
    // blijft leeg zodat de video-achtergrond daar doorheen komt.
    const mid = Math.ceil(catBlocks.length / 2);
    const left = catBlocks.slice(0, mid).join('');
    const right = catBlocks.slice(mid).join('');
    gridInner = `<div class="board-col">${left}</div><div class="board-col">${right}</div>`;
    gridAttrs = 'data-layout="center"';
  } else {
    gridInner = catBlocks.join('') || '<p class="empty">Geen items beschikbaar</p>';
    gridAttrs = `data-layout="grid" style="--cols:${Math.max(1, catBlocks.length)}"`;
  }

  const dots = totalPages > 1
    ? `<div class="page-dots">${Array.from({ length: totalPages }, (_, i) =>
        `<span class="dot${i === page ? ' active' : ''}"></span>`).join('')}</div>`
    : '';

  const ticker = data.tenant.ticker_text
    ? `<div class="ticker-wrap"><span class="ticker-text">${esc(data.tenant.ticker_text)}</span></div>`
    : '';

  app.innerHTML = `
    <header class="board-header">
      <h1 class="board-title">${esc(data.tenant.name)}</h1>
      <div class="header-right">${dots}<span id="connection-status" class="conn-dot" data-state="online"></span></div>
    </header>
    <main class="board-grid${ticker ? ' has-ticker' : ''}" ${gridAttrs}>
      ${gridInner}
    </main>
    ${ticker}`;

  fitToScreen();
}

export function renderError(message: string): void {
  document.getElementById('app')!.innerHTML = `<div class="splash-error">${esc(message)}</div>`;
}

export function renderLoading(): void {
  document.getElementById('app')!.innerHTML = `<div class="splash-loading">Laden…</div>`;
}
