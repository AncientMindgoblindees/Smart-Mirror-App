export interface ClothingImage {
  id: number;
  clothing_item_id: number;
  storage_provider: string;
  storage_key: string;
  image_url: string;
  created_at: string;
}

export interface ClothingItem {
  id: number;
  name: string;
  category: string;
  color?: string | null;
  season?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  images?: ClothingImage[] | null;
}

export interface ClothingItemCreate {
  name: string;
  category: string;
  color?: string | null;
  season?: string | null;
  notes?: string | null;
}

function trimBase(base: string): string {
  return base.replace(/\/$/, '');
}

export function primaryImageUrl(item: ClothingItem): string | null {
  const imgs = item.images;
  if (!imgs?.length) return null;
  return imgs[0]?.image_url ?? null;
}

export async function listClothingItems(
  baseUrl: string,
  includeImages: boolean
): Promise<ClothingItem[]> {
  const q = includeImages ? '?include_images=true' : '';
  const res = await fetch(`${trimBase(baseUrl)}/api/clothing${q}`);
  if (!res.ok) throw new Error(`List clothing failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as ClothingItem[];
}

export async function createClothingItem(
  baseUrl: string,
  payload: ClothingItemCreate
): Promise<ClothingItem> {
  const res = await fetch(`${trimBase(baseUrl)}/api/clothing/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Create clothing failed: ${res.status} ${t}`);
  }
  return (await res.json()) as ClothingItem;
}

export async function uploadClothingImage(
  baseUrl: string,
  itemId: number,
  file: File
): Promise<ClothingImage> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${trimBase(baseUrl)}/api/clothing/${itemId}/images`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upload clothing image failed: ${res.status} ${t}`);
  }
  return (await res.json()) as ClothingImage;
}

export async function deleteClothingItem(baseUrl: string, itemId: number): Promise<void> {
  const res = await fetch(`${trimBase(baseUrl)}/api/clothing/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete clothing failed: ${res.status} ${res.statusText}`);
}

export async function createClothingWithImage(
  baseUrl: string,
  file: File,
  meta: ClothingItemCreate
): Promise<ClothingItem> {
  const item = await createClothingItem(baseUrl, meta);
  const img = await uploadClothingImage(baseUrl, item.id, file);
  return {
    ...item,
    images: [img],
  };
}

export function personImageLatestUrl(baseUrl: string): string {
  return `${trimBase(baseUrl)}/api/tryon/person-image/latest`;
}

export interface OutfitGenerateResponse {
  status: string;
  generation_id: string;
  image_url: string;
}

export async function generateOutfitTryOn(
  baseUrl: string,
  clothingImageIds: number[],
  prompt?: string | null
): Promise<OutfitGenerateResponse> {
  const res = await fetch(`${trimBase(baseUrl)}/api/tryon/outfit-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clothing_image_ids: clothingImageIds,
      prompt: prompt ?? undefined,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Try-on failed: ${res.status} ${t}`);
  }
  return (await res.json()) as OutfitGenerateResponse;
}

/** Category values stored in DB; used for outfit slot filtering. */
export const CLOTHING_CATEGORIES = ['shirt', 'pants', 'accessories', 'other'] as const;
export type ClothingCategoryId = (typeof CLOTHING_CATEGORIES)[number];

export function outfitSlotForCategory(cat: string): 'shirt' | 'pants' | 'accessories' | null {
  const c = cat.trim().toLowerCase();
  if (c === 'shirt' || c === 'tops' || c === 'top') return 'shirt';
  if (c === 'pants' || c === 'trousers' || c === 'bottoms' || c === 'bottom') return 'pants';
  if (c === 'accessories' || c === 'accessory') return 'accessories';
  return null;
}
