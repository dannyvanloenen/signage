import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, API_URL } from '../src/lib/api';

type Init = { method?: string; body?: unknown; headers?: Record<string, string> };

function res(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function last(): [string, Init] {
  const c = fetchMock.mock.calls.at(-1)!;
  return [c[0] as string, (c[1] ?? {}) as Init];
}

describe('admin api-client — request-opbouw', () => {
  it('GET /categories met juiste URL en JSON content-type', async () => {
    fetchMock.mockResolvedValue(res([{ id: '1' }]));
    const r = await api.getCategories();
    expect(r).toEqual([{ id: '1' }]);
    const [url, init] = last();
    expect(url).toBe(`${API_URL}/categories`);
    expect(init.headers!['Content-Type']).toBe('application/json');
  });

  it('voegt Authorization toe als er een jwt in localStorage staat', async () => {
    localStorage.setItem('jwt', 'TOK123');
    fetchMock.mockResolvedValue(res([]));
    await api.getCategories();
    expect(last()[1].headers!.Authorization).toBe('Bearer TOK123');
  });

  it('voegt géén Authorization toe zonder jwt', async () => {
    fetchMock.mockResolvedValue(res([]));
    await api.getCategories();
    expect(last()[1].headers!.Authorization).toBeUndefined();
  });
});

describe('admin api-client — categorie-endpoints', () => {
  it('createCategory POST met {name}', async () => {
    fetchMock.mockResolvedValue(res({ id: 'c1' }));
    await api.createCategory('Friet');
    const [url, init] = last();
    expect(url).toBe(`${API_URL}/categories`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Friet' });
  });

  it('updateCategory PUT met text_scale (regressie fontschaal)', async () => {
    fetchMock.mockResolvedValue(res({ id: 'c1', text_scale: 125 }));
    await api.updateCategory('c1', { text_scale: 125 });
    const [url, init] = last();
    expect(url).toBe(`${API_URL}/categories/c1`);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ text_scale: 125 });
  });

  it('reorderCategories PATCH /categories/reorder met array', async () => {
    fetchMock.mockResolvedValue(res({ ok: true }));
    await api.reorderCategories([{ id: 'a', sort_order: 0 }]);
    const [url, init] = last();
    expect(url).toBe(`${API_URL}/categories/reorder`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual([{ id: 'a', sort_order: 0 }]);
  });
});

describe('admin api-client — items & library', () => {
  it('toggleAvailability PATCH met is_available', async () => {
    fetchMock.mockResolvedValue(res({ id: 'i1', is_available: false }));
    await api.toggleAvailability('i1', false);
    const [url, init] = last();
    expect(url).toBe(`${API_URL}/items/i1/availability`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ is_available: false });
  });

  it('getLibrary GET /library en selectLibraryImage POST /library/select', async () => {
    fetchMock.mockResolvedValue(res([]));
    await api.getLibrary();
    expect(last()[0]).toBe(`${API_URL}/library`);

    fetchMock.mockResolvedValue(res({ id: 'x', path: 'p', url: 'u' }));
    await api.selectLibraryImage('frites.png');
    const [url, init] = last();
    expect(url).toBe(`${API_URL}/library/select`);
    expect(JSON.parse(init.body as string)).toEqual({ filename: 'frites.png' });
  });

  it('uploadImage stuurt FormData zonder JSON content-type', async () => {
    fetchMock.mockResolvedValue(res({ id: 'u', path: 'p', url: 'u' }));
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await api.uploadImage(file);
    const [url, init] = last();
    expect(url).toBe(`${API_URL}/uploads`);
    expect(init.method).toBe('POST');
    expect(init.body instanceof FormData).toBe(true);
    expect(init.headers!['Content-Type']).toBeUndefined();
  });
});

describe('admin api-client — response-afhandeling', () => {
  it('204 geeft undefined terug (geen body)', async () => {
    fetchMock.mockResolvedValue(res(undefined, 204));
    expect(await api.deleteItem('i1')).toBeUndefined();
  });

  it('gooit de server-foutmelding bij een !ok response', async () => {
    fetchMock.mockResolvedValue(res({ error: 'Ongeldig verzoek' }, 400));
    await expect(api.getCategories()).rejects.toThrow('Ongeldig verzoek');
  });

  it('valt terug op statusText als er geen error-veld is', async () => {
    fetchMock.mockResolvedValue({ status: 500, ok: false, json: async () => ({}) });
    await expect(api.getCategories()).rejects.toThrow();
  });
});
