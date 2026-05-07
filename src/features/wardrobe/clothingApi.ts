import { requestJson, requestVoid } from '../../api/httpClient';
import { routes } from '../../api/routes';

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

export function primaryImageUrl(item: ClothingItem): string | null {
  const imgs = item.images;
  if (!imgs?.length) return null;
  return imgs[0]?.image_url ?? null;
}

export async function listClothingItems(
  baseUrl: string,
  includeImages: boolean
): Promise<ClothingItem[]> {
  return requestJson<ClothingItem[]>(baseUrl, routes.clothingList(includeImages));
}

export async function createClothingItem(
  baseUrl: string,
  payload: ClothingItemCreate
): Promise<ClothingItem> {
  return requestJson<ClothingItem>(baseUrl, routes.clothingCreate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function uploadClothingImage(
  baseUrl: string,
  itemId: number,
  file: File
): Promise<ClothingImage> {
  const form = new FormData();
  form.append('file', file);
  return requestJson<ClothingImage>(baseUrl, routes.clothingUploadImage(itemId), {
    method: 'POST',
    body: form,
  });
}

export async function deleteClothingItem(baseUrl: string, itemId: number): Promise<void> {
  await requestVoid(baseUrl, routes.clothingDelete(itemId), { method: 'DELETE' });
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

/** Category values stored in the mirror backend. */
export const CLOTHING_CATEGORIES = ['top', 'bottom', 'hats', 'shoes'] as const;
export type ClothingCategoryId = (typeof CLOTHING_CATEGORIES)[number];
