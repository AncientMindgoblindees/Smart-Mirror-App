# Graph Report - Smart-Mirror-App  (2026-04-28)

## Corpus Check
- 28 files · ~12,295 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 136 nodes · 181 edges · 8 communities detected
- Extraction: 79% EXTRACTED · 21% INFERRED · 0% AMBIGUOUS · INFERRED: 38 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `MirrorConnectionManager` - 15 edges
2. `requestJson()` - 12 edges
3. `requestVoid()` - 8 edges
4. `trimBase()` - 6 edges
5. `normalizeFreeformFromStorage()` - 6 edges
6. `getMirrorApiToken()` - 5 edges
7. `inferWidgetSizePreset()` - 5 edges
8. `createClothingWithImage()` - 4 edges
9. `detectEnv()` - 4 edges
10. `clampFreeformPercentBox()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `handleWidgetResizeCommit()` --calls--> `inferWidgetSizePreset()`  [INFERRED]
  src\App.tsx → src\lib\widgetSizePresets.ts
- `addCustomWidgetFromTemplate()` --calls--> `mirrorWidgetIcon()`  [INFERRED]
  src\App.tsx → src\lib\mirrorLayout.tsx
- `trimBase()` --calls--> `personImageLatestUrl()`  [INFERRED]
  src\api\httpClient.ts → src\features\wardrobe\clothingApi.ts
- `trimBase()` --calls--> `getPersonImageById()`  [INFERRED]
  src\api\httpClient.ts → src\features\wardrobe\clothingApi.ts
- `trimBase()` --calls--> `mirrorOAuthWebStartUrl()`  [INFERRED]
  src\api\httpClient.ts → src\lib\mirrorApi.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.1
Nodes (9): commitWidgetSettingsDraft(), handleFileChosen(), handleWidgetResizeCommit(), handleWidgetUpdate(), isLoopbackHost(), mirrorHttpFallbackFromWindow(), openUploadModal(), sendEnvelopeToMirror() (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.15
Nodes (14): commitUpload(), submitOutfitTryOn(), createClothingItem(), createClothingWithImage(), generateOutfitTryOn(), listClothingItems(), patchPersonImageStatus(), primaryImageUrl() (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.14
Nodes (12): deleteItem(), triggerCapture(), triggerMirrorCapture(), deleteClothingItem(), deletePersonImage(), getPersonImageById(), personImageLatestUrl(), ApiError (+4 more)

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (1): MirrorConnectionManager

### Community 4 - "Community 4"
Cohesion: 0.21
Nodes (8): detectEnv(), getMirrorApiToken(), getMirrorEnv(), getMirrorHttpBase(), getMirrorWsUrl(), withAuthToken(), createSessionId(), mirrorOAuthWebStartUrl()

### Community 5 - "Community 5"
Cohesion: 0.23
Nodes (10): loadLayoutCache(), saveLayoutCache(), widgetsToSnapshots(), dedupeWidgetApiRows(), displayName(), hydrateWidgetsFromSnapshots(), mirrorWidgetBaseId(), mirrorWidgetIcon() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.36
Nodes (7): addCustomWidgetFromTemplate(), clampFreeformPercentBox(), legacyPixelsToPercent(), looksLikeLegacyPixel(), normalizeFreeformFromStorage(), readFreeform(), inferWidgetSizePreset()

### Community 8 - "Community 8"
Cohesion: 0.4
Nodes (2): generateDeviceId(), getDeviceId()

## Knowledge Gaps
- **Thin community `Community 3`** (14 nodes): `MirrorConnectionManager`, `.clearReconnectTimer()`, `.closeSocket()`, `.connect()`, `.disconnect()`, `.dispose()`, `.getSessionId()`, `.getStatus()`, `.scheduleReconnect()`, `.setAuthToken()`, `.setStatus()`, `.setWsUrl()`, `.updateEvents()`, `connectionManager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (6 nodes): `createDevicePairEnvelope()`, `createWardrobeUpdatedEnvelope()`, `createWidgetsSyncEnvelope()`, `generateDeviceId()`, `getDeviceId()`, `contracts.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MirrorConnectionManager` connect `Community 3` to `Community 0`, `Community 4`?**
  _High betweenness centrality (0.193) - this node is a cross-community bridge._
- **Why does `addCustomWidgetFromTemplate()` connect `Community 6` to `Community 0`, `Community 5`?**
  _High betweenness centrality (0.172) - this node is a cross-community bridge._
- **Why does `getMirrorApiToken()` connect `Community 4` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.157) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `requestJson()` (e.g. with `getMirrorApiToken()` and `listClothingItems()`) actually correct?**
  _`requestJson()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `requestVoid()` (e.g. with `getMirrorApiToken()` and `triggerMirrorCapture()`) actually correct?**
  _`requestVoid()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `trimBase()` (e.g. with `personImageLatestUrl()` and `getPersonImageById()`) actually correct?**
  _`trimBase()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `normalizeFreeformFromStorage()` (e.g. with `inferWidgetSizePreset()` and `readFreeform()`) actually correct?**
  _`normalizeFreeformFromStorage()` has 2 INFERRED edges - model-reasoned connections that need verification._