export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('jwt');
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export type Category = { id: string; tenant_id: string; name: string; sort_order: number; text_scale: number };
export type MenuItem = {
  id: string; category_id: string; tenant_id: string;
  name: string; description: string | null;
  price_cents: number; image_path: string | null; image_url: string | null;
  is_available: boolean; sort_order: number;
};
export type Tenant = { id: string; name: string; slug: string; public_token: string; bg_image_path: string | null; bg_video_path: string | null; ticker_text: string | null; plan: string };
export type User = { id: string; email: string; tenant_id: string | null; role: string };

export type Screen = {
  id: string; tenant_id: string; name: string; public_token: string;
  theme: string; layout: string; font: string; logo_scale: number;
  bg_image_path: string | null; bg_video_path: string | null;
  ticker_text: string | null; category_ids: string[] | null; sort_order: number;
};
export type ScreenUpdate = Partial<Pick<Screen,
  'name' | 'theme' | 'layout' | 'font' | 'logo_scale' | 'bg_image_path' | 'bg_video_path' | 'ticker_text' | 'category_ids'>>;

export type PlanLimits = { screens: number; categories: number; items: number };
export type PlanUsage = { screens: number; categories: number; items: number };

export type CreateItemInput = {
  category_id: string; name: string; description?: string | null;
  price_cents: number; image_path?: string | null;
  is_available?: boolean; sort_order?: number;
};

export const api = {
  magicLink: (email: string) =>
    req<{ message: string }>('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email }) }),
  signup: (email: string, business_name: string) =>
    req<{ message: string }>('/auth/signup', { method: 'POST', body: JSON.stringify({ email, business_name }) }),
  verifyToken: (token: string) =>
    req<{ token: string }>(`/auth/verify/${token}`),
  me: () =>
    req<{ user: User; tenant: Tenant | null; limits: PlanLimits | null; usage: PlanUsage | null }>('/me'),

  getCategories: () => req<Category[]>('/categories'),
  createCategory: (name: string) =>
    req<Category>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  updateCategory: (id: string, data: Partial<{ name: string; sort_order: number; text_scale: number }>) =>
    req<Category>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCategory: (id: string) => req<void>(`/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (items: { id: string; sort_order: number }[]) =>
    req<{ ok: boolean }>('/categories/reorder', { method: 'PATCH', body: JSON.stringify(items) }),

  getScreens: () => req<Screen[]>('/screens'),
  createScreen: (name: string) =>
    req<Screen>('/screens', { method: 'POST', body: JSON.stringify({ name }) }),
  updateScreen: (id: string, data: ScreenUpdate) =>
    req<Screen>(`/screens/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteScreen: (id: string) => req<void>(`/screens/${id}`, { method: 'DELETE' }),

  getItems: () => req<MenuItem[]>('/items'),
  createItem: (data: CreateItemInput) =>
    req<MenuItem>('/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: string, data: Partial<CreateItemInput>) =>
    req<MenuItem>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleAvailability: (id: string, is_available: boolean) =>
    req<MenuItem>(`/items/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ is_available }) }),
  deleteItem: (id: string) => req<void>(`/items/${id}`, { method: 'DELETE' }),
  reorderItems: (items: { id: string; sort_order: number }[]) =>
    req<{ ok: boolean }>('/items/reorder', { method: 'PATCH', body: JSON.stringify(items) }),

  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return req<{ id: string; path: string; url: string }>('/uploads', { method: 'POST', body: form });
  },

  getLibrary: () =>
    req<{ filename: string; label: string; url: string }[]>('/library'),
  selectLibraryImage: (filename: string) =>
    req<{ id: string; path: string; url: string }>('/library/select', {
      method: 'POST',
      body: JSON.stringify({ filename }),
    }),

  uploadVideo: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return req<{ id: string; path: string; url: string }>('/uploads/video', { method: 'POST', body: form });
  },
};
