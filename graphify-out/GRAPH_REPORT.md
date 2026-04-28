# Graph Report - Smart-Mirror-App  (2026-04-27)

## Corpus Check
- 27 files · ~11,979 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 131 nodes · 170 edges · 8 communities detected
- Extraction: 81% EXTRACTED · 19% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]

## God Nodes (most connected - your core abstractions)
1. `MirrorConnectionManager` - 14 edges
2. `requestJson()` - 11 edges
3. `requestVoid()` - 7 edges
4. `trimBase()` - 6 edges
5. `normalizeFreeformFromStorage()` - 6 edges
6. `inferWidgetSizePreset()` - 5 edges
7. `createClothingWithImage()` - 4 edges
8. `detectEnv()` - 4 edges
9. `clampFreeformPercentBox()` - 4 edges
10. `mirrorWidgetBaseId()` - 4 edges

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
Cohesion: 0.13
Nodes (18): commitUpload(), submitOutfitTryOn(), createClothingItem(), createClothingWithImage(), generateOutfitTryOn(), getPersonImageById(), listClothingItems(), patchPersonImageStatus() (+10 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (8): commitWidgetSettingsDraft(), handleFileChosen(), handleWidgetResizeCommit(), handleWidgetUpdate(), isLoopbackHost(), mirrorHttpFallbackFromWindow(), openUploadModal(), standaloneTextWidgetBaseId()

### Community 2 - "Community 2"
Cohesion: 0.24
Nodes (2): sendEnvelopeToMirror(), MirrorConnectionManager

### Community 3 - "Community 3"
Cohesion: 0.23
Nodes (10): loadLayoutCache(), saveLayoutCache(), widgetsToSnapshots(), dedupeWidgetApiRows(), displayName(), hydrateWidgetsFromSnapshots(), mirrorWidgetBaseId(), mirrorWidgetIcon() (+2 more)

### Community 4 - "Community 4"
Cohesion: 0.17
Nodes (9): deleteItem(), triggerCapture(), triggerMirrorCapture(), deleteClothingItem(), deletePersonImage(), ApiError, requestVoid(), mirrorAuthLogout() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.36
Nodes (7): addCustomWidgetFromTemplate(), clampFreeformPercentBox(), legacyPixelsToPercent(), looksLikeLegacyPixel(), normalizeFreeformFromStorage(), readFreeform(), inferWidgetSizePreset()

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (3): createSessionId(), generateDeviceId(), getDeviceId()

### Community 7 - "Community 7"
Cohesion: 0.43
Nodes (4): detectEnv(), getMirrorEnv(), getMirrorHttpBase(), getMirrorWsUrl()

## Knowledge Gaps
- **Thin community `Community 2`** (15 nodes): `sendEnvelopeToMirror()`, `MirrorConnectionManager`, `.clearReconnectTimer()`, `.closeSocket()`, `.connect()`, `.disconnect()`, `.dispose()`, `.getSessionId()`, `.getStatus()`, `.scheduleReconnect()`, `.send()`, `.setStatus()`, `.setWsUrl()`, `.updateEvents()`, `connectionManager.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MirrorConnectionManager` connect `Community 2` to `Community 6`?**
  _High betweenness centrality (0.285) - this node is a cross-community bridge._
- **Why does `sendEnvelopeToMirror()` connect `Community 2` to `Community 1`?**
  _High betweenness centrality (0.270) - this node is a cross-community bridge._
- **Why does `addCustomWidgetFromTemplate()` connect `Community 5` to `Community 1`, `Community 3`?**
  _High betweenness centrality (0.177) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `requestJson()` (e.g. with `listClothingItems()` and `createClothingItem()`) actually correct?**
  _`requestJson()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `requestVoid()` (e.g. with `triggerMirrorCapture()` and `deleteClothingItem()`) actually correct?**
  _`requestVoid()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `trimBase()` (e.g. with `personImageLatestUrl()` and `getPersonImageById()`) actually correct?**
  _`trimBase()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `normalizeFreeformFromStorage()` (e.g. with `inferWidgetSizePreset()` and `readFreeform()`) actually correct?**
  _`normalizeFreeformFromStorage()` has 2 INFERRED edges - model-reasoned connections that need verification._