import './style.css';
import { fetchMenu, type MenuData } from './api';
import { connectDisplay } from './socket';
import { render, renderError, renderLoading } from './render';

const STORAGE_KEY = 'signage_display_cache';
const PAGE_SIZE = 4;
const PAGE_INTERVAL = 8000;

const VALID_THEMES = ['dark', 'warm', 'cool', 'minimal'] as const;
type Theme = typeof VALID_THEMES[number];

let currentMenu: MenuData | null = null;
let pageIndex = 0;
let pageTimer: ReturnType<typeof setInterval> | undefined;
let transitioning = false;

function getToken(): string | null {
  return new URLSearchParams(location.search).get('token');
}

function applyTheme(): void {
  const raw = new URLSearchParams(location.search).get('theme') ?? 'dark';
  const theme: Theme = (VALID_THEMES as readonly string[]).includes(raw) ? raw as Theme : 'dark';
  if (theme !== 'dark') document.documentElement.dataset.theme = theme;
}

function activeCategories(data: MenuData) {
  return data.categories.filter(c => c.items.some(i => i.is_available));
}

function renderPage(data: MenuData, page: number): void {
  const cats = activeCategories(data);
  const totalPages = Math.max(1, Math.ceil(cats.length / PAGE_SIZE));
  const idx = page % totalPages;
  const slice = cats.slice(idx * PAGE_SIZE, (idx + 1) * PAGE_SIZE);
  render({ ...data, categories: slice }, idx, totalPages);
}

function transitionToPage(data: MenuData, page: number): void {
  if (transitioning) return;
  transitioning = true;
  const app = document.getElementById('app');
  if (app) app.classList.add('fading');
  setTimeout(() => {
    renderPage(data, page);
    if (app) app.classList.remove('fading');
    transitioning = false;
  }, 300);
}

function stopTimer(): void {
  if (pageTimer !== undefined) {
    clearInterval(pageTimer);
    pageTimer = undefined;
  }
}

function startPageTimer(data: MenuData): void {
  stopTimer();
  const cats = activeCategories(data);
  if (cats.length <= PAGE_SIZE) return;
  pageTimer = setInterval(() => {
    pageIndex += 1;
    transitionToPage(data, pageIndex);
  }, PAGE_INTERVAL);
}

function showMenu(data: MenuData): void {
  currentMenu = data;
  pageIndex = 0;
  renderPage(data, 0);
  startPageTimer(data);
}

async function loadAndRender(token: string): Promise<void> {
  try {
    const data = await fetchMenu(token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    showMenu(data);
  } catch (err) {
    console.error('[display] fetch failed', err);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as MenuData;
      showMenu(cached);
      const dot = document.getElementById('connection-status');
      if (dot) dot.dataset.state = 'offline';
    } else {
      renderError('Menu tijdelijk niet beschikbaar');
    }
  }
}

function init(): void {
  const token = getToken();
  if (!token) {
    renderError('Geen token opgegeven. Gebruik ?token=PUBLIC_TOKEN in de URL.');
    return;
  }
  applyTheme();
  renderLoading();
  loadAndRender(token);
  connectDisplay(token, () => loadAndRender(token));
}

init();
