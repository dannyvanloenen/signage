export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export type DisplayItem = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
};

export type DisplayCategory = {
  id: string;
  name: string;
  sort_order: number;
  items: DisplayItem[];
};

export type MenuData = {
  tenant: { id: string; name: string; bg_image_url: string | null; bg_video_url: string | null; ticker_text: string | null };
  categories: DisplayCategory[];
};

export async function fetchMenu(token: string): Promise<MenuData> {
  const res = await fetch(`${API_URL}/display/${token}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<MenuData>;
}
