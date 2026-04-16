import { useCallback } from 'react';
import type { ClothingItem } from './clothingApi';
import { createWardrobeUpdatedEnvelope } from '../../shared/ws/contracts';

type SendEnvelope = (envelope: Record<string, unknown>) => void;

export function useWardrobeActions(sessionId: string, sendEnvelopeToMirror: SendEnvelope) {
  const notifyWardrobeUpdated = useCallback(
    (payload: { selected_image_url?: string; selected_item_id?: number } = {}) => {
      sendEnvelopeToMirror(createWardrobeUpdatedEnvelope(sessionId, payload));
    },
    [sendEnvelopeToMirror, sessionId],
  );

  const clearDeletedSelection = useCallback(
    (
      id: number,
      selected: {
        shirt: ClothingItem | null;
        pants: ClothingItem | null;
        accessory: ClothingItem | null;
      },
      setters: {
        setShirt: (v: ClothingItem | null | ((old: ClothingItem | null) => ClothingItem | null)) => void;
        setPants: (v: ClothingItem | null | ((old: ClothingItem | null) => ClothingItem | null)) => void;
        setAccessory: (v: ClothingItem | null | ((old: ClothingItem | null) => ClothingItem | null)) => void;
      },
    ) => {
      if (selected.shirt?.id === id) setters.setShirt(null);
      if (selected.pants?.id === id) setters.setPants(null);
      if (selected.accessory?.id === id) setters.setAccessory(null);
    },
    [],
  );

  return {
    notifyWardrobeUpdated,
    clearDeletedSelection,
  };
}
