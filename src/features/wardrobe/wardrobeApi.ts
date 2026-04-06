export interface WardrobeItem {
  id: number;
  user_id: string;
  name: string;
  category?: string | null;
  image_url: string;
  created_at: string;
  updated_at: string;
}

function trimBase(base: string): string {
  return base.replace(/\/$/, '');
}

function absoluteImageUrl(baseUrl: string, imageUrl: string): string {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  return `${trimBase(baseUrl)}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
}

export async function listWardrobeItems(baseUrl: string, userId: string): Promise<WardrobeItem[]> {
  const res = await fetch(`${trimBase(baseUrl)}/api/wardrobe/items?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`List wardrobe failed: ${res.status} ${res.statusText}`);
  const items = (await res.json()) as WardrobeItem[];
  return items.map((item) => ({ ...item, image_url: absoluteImageUrl(baseUrl, item.image_url) }));
}

export async function uploadWardrobeItem(
  baseUrl: string,
  userId: string,
  file: File,
  category = ''
): Promise<WardrobeItem> {
  const form = new FormData();
  form.append('file', file);
  form.append('user_id', userId);
  form.append('name', file.name.replace(/\.[^/.]+$/, ''));
  form.append('category', category);
  const res = await fetch(`${trimBase(baseUrl)}/api/wardrobe/items`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Upload wardrobe failed: ${res.status} ${res.statusText}`);
  const out = (await res.json()) as WardrobeItem;
  return { ...out, image_url: absoluteImageUrl(baseUrl, out.image_url) };
}

export async function removeWardrobeItem(baseUrl: string, itemId: number): Promise<void> {
  const res = await fetch(`${trimBase(baseUrl)}/api/wardrobe/items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete wardrobe failed: ${res.status} ${res.statusText}`);
}
