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
  return `
    <section class="category">
      <h2 class="cat-name">${esc(cat.name)}</h2>
      <ul class="items">
        ${available.map(renderItem).join('')}
      </ul>
    </section>`;
}

export function render(data: MenuData, page = 0, totalPages = 1): void {
  const app = document.getElementById('app')!;

  // Background image
  if (data.tenant.bg_image_url) {
    document.documentElement.style.setProperty('--bg-image', `url("${API_URL}${data.tenant.bg_image_url}")`);
    document.body.classList.add('has-bg');
  } else {
    document.documentElement.style.removeProperty('--bg-image');
    document.body.classList.remove('has-bg');
  }

  // Ambient glow element (only created once)
  if (!document.getElementById('ambient')) {
    const el = document.createElement('div');
    el.id = 'ambient';
    document.body.insertBefore(el, document.body.firstChild);
  }

  const catHtml = data.categories.map(renderCategory).filter(Boolean).join('');

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
    <main class="board-grid${ticker ? ' has-ticker' : ''}">
      ${catHtml || '<p class="empty">Geen items beschikbaar</p>'}
    </main>
    ${ticker}`;
}

export function renderError(message: string): void {
  document.getElementById('app')!.innerHTML = `<div class="splash-error">${esc(message)}</div>`;
}

export function renderLoading(): void {
  document.getElementById('app')!.innerHTML = `<div class="splash-loading">Laden…</div>`;
}
