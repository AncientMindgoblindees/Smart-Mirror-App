import { ApiError, requestJson, requestVoid, trimBase } from '../../api/httpClient';
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

export function personImageLatestUrl(baseUrl: string): string {
  return `${trimBase(baseUrl)}${routes.personImageLatest}`;
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
  return requestJson<OutfitGenerateResponse>(baseUrl, routes.tryonGenerate, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clothing_image_ids: clothingImageIds,
      prompt: prompt ?? undefined,
    }),
  });
}

export interface PersonImage {
  id: number;
  file_path: string;
  status: string;
  created_at: string;
}

export async function uploadPersonImage(baseUrl: string, file: File): Promise<PersonImage> {
  const form = new FormData();
  form.append('file', file);
  return requestJson<PersonImage>(baseUrl, routes.personImageList, {
    method: 'POST',
    body: form,
  });
}

export async function listPersonImages(baseUrl: string): Promise<PersonImage[]> {
  try {
    return await requestJson<PersonImage[]>(baseUrl, routes.personImageList);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return [];
    throw error;
  }
}

export async function getPersonImageById(baseUrl: string, imageId: number): Promise<Blob> {
  const res = await fetch(`${trimBase(baseUrl)}${routes.personImageById(imageId)}`);
  if (!res.ok) throw new Error(`GET person image failed: ${res.status} ${res.statusText}`);
  return res.blob();
}

export async function patchPersonImageStatus(baseUrl: string, imageId: number, status: string): Promise<PersonImage> {
  return requestJson<PersonImage>(baseUrl, routes.personImageById(imageId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function deletePersonImage(baseUrl: string, imageId: number): Promise<void> {
  await requestVoid(baseUrl, routes.personImageById(imageId), { method: 'DELETE' });
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
