import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { render, renderError, renderLoading } from '../src/render';
import type { MenuData } from '../src/api';

// happy-dom implementeert HTMLMediaElement.load niet altijd; render() roept
// vid.load() aan bij een video-achtergrond. Defensief stubben.
beforeAll(() => {
  const proto = (globalThis as unknown as { HTMLMediaElement?: { prototype: Record<string, unknown> } }).HTMLMediaElement?.prototype;
  if (proto && typeof proto.load !== 'function') proto.load = () => {};
});

function setUrl(search = ''): void {
  window.history.replaceState(null, '', '/' + search);
}

type Cat = MenuData['categories'][number];

function cat(name: string, itemCount = 1, text_scale = 100): Cat {
  return {
    id: 'c' + name,
    name,
    sort_order: 1,
    text_scale,
    items: Array.from({ length: itemCount }, (_, i) => ({
      id: `i${name}${i}`,
      name: `${name} ${i}`,
      description: null,
      price_cents: 250,
      image_url: null,
      is_available: true,
      sort_order: i,
    })),
  };
}

function makeData(overrides: Partial<MenuData> = {}): MenuData {
  return {
    tenant: {
      id: 't1',
      name: 'Test Snackbar',
      bg_image_url: null,
      bg_video_url: null,
      ticker_text: null,
      ...(overrides.tenant ?? {}),
    },
    categories: overrides.categories ?? [cat('Friet'), cat('Snacks')],
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  document.body.className = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-font');
  document.documentElement.style.cssText = '';
  setUrl(''); // reset eventuele URL-params tussen tests
});

const grid = () => document.querySelector('.board-grid') as HTMLElement;

describe('display render — layout', () => {
  it('gebruikt grid-layout zonder video', () => {
    render(makeData());
    expect(grid().dataset.layout).toBe('grid');
    expect(grid().style.getPropertyValue('--cols')).toBe('2');
    expect(document.querySelectorAll('.board-col').length).toBe(0);
  });

  it('activeert center-layout automatisch bij een video-achtergrond', () => {
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: '/uploads/x.mp4', ticker_text: null } }));
    expect(grid().dataset.layout).toBe('center');
    expect(document.querySelectorAll('.board-col').length).toBe(2);
  });

  it('honoreert ?layout=center ook zonder video', () => {
    setUrl('?layout=center');
    render(makeData());
    expect(grid().dataset.layout).toBe('center');
    expect(document.querySelectorAll('.board-col').length).toBe(2);
  });

  it('honoreert ?layout=grid en negeert de video', () => {
    setUrl('?layout=grid');
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: '/uploads/x.mp4', ticker_text: null } }));
    expect(grid().dataset.layout).toBe('grid');
  });

  it('valt terug op grid bij minder dan 2 categorieën, zelfs met video', () => {
    render(makeData({
      tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: '/uploads/x.mp4', ticker_text: null },
      categories: [cat('Solo')],
    }));
    expect(grid().dataset.layout).toBe('grid');
  });
});

describe('display render — fontschaal per categorie', () => {
  it('zet --cat-scale op een vergrote categorie en laat 100% leeg', () => {
    render(makeData({ categories: [cat('Groot', 1, 150), cat('Normaal', 1, 100)] }));
    const sections = document.querySelectorAll<HTMLElement>('.category');
    expect(sections[0].style.getPropertyValue('--cat-scale')).toBe('1.5');
    expect(sections[1].style.getPropertyValue('--cat-scale')).toBe('');
  });
});

describe('display render — header & ticker', () => {
  it('toont de winkelnaam in de header', () => {
    render(makeData());
    expect(document.querySelector('.board-title')?.textContent).toBe('Test Snackbar');
  });

  it('rendert een ticker en markeert de grid als has-ticker', () => {
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: null, ticker_text: 'Actie!' } }));
    expect(document.querySelector('.ticker-text')?.textContent).toBe('Actie!');
    expect(grid().classList.contains('has-ticker')).toBe(true);
  });

  it('verbergt lege categorieën (geen beschikbare items)', () => {
    const leeg = cat('Leeg');
    leeg.items[0].is_available = false;
    render(makeData({ categories: [cat('Vol'), leeg] }));
    expect(grid().style.getPropertyValue('--cols')).toBe('1');
    expect(document.querySelectorAll('.category').length).toBe(1);
  });

  it('escaped HTML in de tenantnaam (XSS-bescherming)', () => {
    render(makeData({ tenant: { id: 't', name: '<script>x</script>', bg_image_url: null, bg_video_url: null, ticker_text: null } }));
    expect(document.querySelector('.board-title script')).toBeNull();
    expect(document.querySelector('.board-title')?.textContent).toContain('<script>');
  });
});

describe('display render — per-scherm thema/layout/font', () => {
  const root = () => document.documentElement;

  it('past het scherm-thema en -font toe', () => {
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: null, ticker_text: null, theme: 'warm', font: 'serif' } }));
    expect(root().dataset.theme).toBe('warm');
    expect(root().dataset.font).toBe('serif');
  });

  it('laat dark/default zonder data-attributen', () => {
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: null, ticker_text: null, theme: 'dark', font: 'default' } }));
    expect(root().dataset.theme).toBeUndefined();
    expect(root().dataset.font).toBeUndefined();
  });

  it('URL-param overruled het scherm-thema', () => {
    setUrl('?theme=cool');
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: null, ticker_text: null, theme: 'warm' } }));
    expect(root().dataset.theme).toBe('cool');
  });

  it('scherm-layout center forceert center zonder video', () => {
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: null, ticker_text: null, layout: 'center' } }));
    expect(grid().dataset.layout).toBe('center');
  });

  it('scherm-layout grid forceert grid ondanks video', () => {
    render(makeData({ tenant: { id: 't', name: 'T', bg_image_url: null, bg_video_url: '/uploads/x.mp4', ticker_text: null, layout: 'grid' } }));
    expect(grid().dataset.layout).toBe('grid');
  });
});

describe('display render — states', () => {
  it('toont de error-state', () => {
    renderError('Menu tijdelijk niet beschikbaar');
    expect(document.querySelector('.splash-error')?.textContent).toBe('Menu tijdelijk niet beschikbaar');
  });

  it('toont de loading-state', () => {
    renderLoading();
    expect(document.querySelector('.splash-loading')).not.toBeNull();
  });
});
