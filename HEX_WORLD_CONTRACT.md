# Hex World — prototype architecture contract

Status: standalone camera and scene-file laboratory, not yet part of character gameplay.

## Decision

Interactive Tabletop keeps a game-neutral **2.5D isometric sprite scene** module inside the current repository, with no second rules engine, character store, physics world or asset format. The core stores **world coordinates**, never camera pixels. The dedicated `hex-world-lab.html` is a test surface; the normal character sheet/dice view is unchanged.

**Alternatives considered:** (1) a separate world engine/repository now, with packaging and CI overhead before the data contract is proven; (2) isolated modules and a standalone lab within the existing repository. We chose (2) until a second consumer requires extraction. Fully modeled 3D would solve unrestricted camera visibility but require a substantially different authoring pipeline; it is not the chosen renderer.

## Scene file (`smi-hex-scene/1`)

The authored JSON is authoritative for scene occupancy:

```json
{
  "schema": "smi-hex-scene/1",
  "id": "clearing",
  "grid": {
    "orientation": "pointy",
    "coordinates": "axial",
    "feet_per_step": 5
  },
  "tiles": [{ "q": 0, "r": 0, "terrain": "grass" }],
  "objects": [{ "id": "tree-1", "kind": "tree", "q": 0, "r": 0 }]
}
```

- `q,r` use axial hex coordinates; each neighboring hex represents `grid.feet_per_step` (5 ft in the sample). No pixel size is stored.
- `tiles` have a unique coordinate and symbolic terrain key. `objects` have unique IDs and occupy existing tiles. Tree crowns and other objects can **visually** extend across multiple cells without redefining the grid.
- The v1 validator enforces supported schema, coordinate bounds, unique tiles and object IDs, and bounded file content. Unknown `kind`/terrain values produce debug placeholders rather than executing anything.
- `hex-world-demo.json` is deliberately *not* an Atlas pack and does not invent asset IDs. An Atlas binding will be introduced only after testing a real published asset pack and resolver. This scene version contains flat terrain only; there is no elevation, multi-hex collision footprint, or wall-edge model yet. Future dirt/rock vertical skirts should be drawn only on exposed tile edges (scene boundary or adjacent lower tiles), not as seams on every interior hex. Six 60° camera yaws must be supported, but only asymmetric props/actors need six authored facing views; symmetric terrain and many effects can reuse artwork.

## Geometry and camera

`web/hex-world-core.js` is the authoritative, DOM-free implementation of axial-to-world, cube rounding, distance, neighbor lookup, projection and inverse projection. `web/hex-world-lab.js` owns only Canvas 2D drawing and camera controls. Camera yaw rotates in exact 60° increments; elevation is **locked to the true isometric 35.264° above the ground** (`atan(1/sqrt(2))`), not a mutable per-scene or user option; zoom anchors to the mouse position; middle/right mouse drags pan. UI selection uses the inverse camera transform, not the location of a drawn sprite. The v1 lab uses non-Atlas debug shapes to prove geometry, **not** production artwork.

Camera zoom and rotation are view state and do not change tile IDs or character values. Moving objects or actors and triggering D&D actions is **out of scope** for this first milestone.

## Future Atlas integration

Visual Atlas already defines `smi-visual-pack/1` assets: `region`, `sequence`, `state_set`, `composition`, and pivot-aware drawing via its shared renderer. Keep that manifest authoritative. The world loader should eventually resolve a stable asset ID through a validated pack, draw at the object's anchored position, and choose directional sprites according to camera facing; it must not copy frames, create a parallel animation schema, or infer a renderer from tags. Terrain, props and actors will be distinct scene concepts, but game actors will reference Tabletop-owned character identities rather than duplicating HP, skills or rules.

The current prototype does **not** download Atlas artwork, implement animation state machines, network synchronization, persistent maps, pathfinding, elevation or AI generation. Avoid adding those until the world geometry, scene file and sprite placement have a demonstrated contract.

## Qualification

`node tests/test_hex_world.js` verifies math/scene invariants and invalid input. `python tests/browser_hex_world_smoke.py` checks the actual lab in Chromium, including loading JSON files, mouse interactions and the initial fit-to-screen layout. Both are picked up by the existing `tools/qualify.sh` globs, without a new CI workflow.

## Connected-world design (planned, not yet a runtime feature)

### Storage boundaries and authorities

Keep three independent contracts rather than extending the Atlas manifest with game-world state:

1. `smi-hex-world/1` **world index** (future): world ID, grid specification, 32-cell chunk size, region IDs, region-index paths, portal references and Atlas pack dependencies. It should stay small even when the world grows; this is navigation metadata, not the game save.
2. `smi-hex-region/1` **region index** (future): a region ID and its chunk file references. This is the single authored listing for that region, so adding chunks does not require rewriting a giant global manifest. Per-chunk overview summaries are derived from chunk data, not separately edited geography. A region may eventually shard its index only after size measurements justify it.
3. `smi-hex-chunk/1` **terrain chunk** (future): immutable or authored terrain/decoration data. Use **global signed axial `q,r`** within each chunk, not screen coordinates or separate local gameplay origins. Chunk `(cq,cr)` contains `32*cq <= q < 32*(cq+1)` and similarly for `r`. It is an axial parallelogram, not a hexagonal radius, and may contain holes or empty cells. `chunkOf()` uses mathematical floor for negative coordinates.
4. **World runtime state**, with persistent **actor IDs, world position, region, altitude, conditions and object deltas** (later): a moving actor has a single ID and single position authority. Its tile/chunk is derived from its position. Never migrate or copy its full record into the next chunk when moving; chunk files hold static placements, not dynamic character health or authoritative monster state. Interactive Tabletop's vault/rules engine remains the authority for character stats, actions, HP, and effects.

An Atlas pack remains `smi-visual-pack/1`: stable asset IDs, textures, pivots, `region`, `sequence`, `state_set`, and `composition`. The world index lists pack dependencies; chunks refer to their stable asset IDs. Do not invent a competing texture, animation, or state-machine schema. A missing or disallowed pack should display a safe placeholder, not execute instructions from manifests.

**Proposed shape, not yet accepted/parsed by the runtime:**

```json
{
  "schema": "smi-hex-world/1",
  "id": "upper-peninsula-fantasy",
  "grid": {"orientation": "pointy", "coordinates": "axial", "feet_per_step": 5, "chunk_size": 32},
  "asset_packs": [{"pack_id": "smi.fantasy.terrain", "version": "1.0.0", "manifest": "assets/terrain/manifest.json"}],
  "regions": [
    {"id": "surface", "kind": "outdoor", "index": "regions/surface/index.json"},
    {"id": "underdeep", "kind": "underground", "index": "regions/underdeep/index.json"}
  ],
  "portals": [{"id": "cave-entrance", "from": {"region": "surface", "q": 7, "r": 4},
    "to": {"region": "underdeep", "q": 7, "r": 4}}]
}
```

A region index (separate from the root world file) maps coordinates to files, for example `{"schema":"smi-hex-region/1","id":"surface","chunks":[{"cq":0,"cr":0,"path":"chunks/surface/0_0.json"},{"cq":-1,"cr":0,"path":"chunks/surface/-1_0.json"}]}`. Only that index owns chunk references. A region is a **coordinate space**; a chunk is a **storage/loading unit** within it. Adjacent outdoor chunks share the same world coordinates automatically. Caves, rooms, interiors, ships, or other independent spaces connect through explicit portals, possibly with a coordinate transformation. A portal may represent a staircase, doorway, shaft, or hole; its destination must be validated and may require separate visibility/discovery permissions. A cave directly below an outdoor cell can use matching `q,r` but has a **different region ID**. Avoid using only `z` to distinguish physically overlapping interiors.

### Terrain materials, altitude, and exposed faces

The v1 scene **now** accepts optional integer `tile.elevation` in 5-foot vertical steps (bounded to -32..32 in the standalone lab). Terrain IDs may describe grass, dirt, rock, stone, water, or future materials; no special logic should depend on a particular name. `elevation=0` preserves prior scene files. A rock tile remains a top surface with normal grid identity.

The debug renderer draws cliff/dirt/stone faces only when a neighbor is lower or a **known** scene boundary is exposed. A same-height neighbor must not create an internal face. On a map boundary without a lower neighbor, the debug lab draws a short, cosmetic 0.7-world-unit skirt. This edge skirt is **not a floor, collision volume, or navigable underground space**. An unloaded adjacent chunk is not equivalent to empty space: the future streamer must query a complete neighbor or an explicit world-boundary marker before deciding whether to draw an edge face. Exposed edge faces are camera-facing and shaded independently of the terrain top, allowing distinct Atlas art for surface and cliff materials later.

The camera remains at a fixed 35.264° elevation, with six 60° yaw steps, free zoom/pan and one stable world coordinate system. Elevation affects projected screen Y but not axial `q,r`. Top-surface picking accounts for elevation. Ground-floor height and **actor altitude** are separate: a flying monster can occupy `(q,r)` with a positive altitude above that floor; neither being airborne nor being visible is decided by tile color.

A hole should eventually be an explicit traversability/portal feature, not simply a transparent terrain texture. For multiple floors in the same building, use distinct occupiable surfaces/region levels and explicit connectivity; visible front/back sprites alone do not establish movement geometry. The first release does **not** implement passage through holes, pathfinding, collision, fall damage, or occupancy at multiple elevations.

### Streaming and zoom

**World scale is immutable:** 1 hex step represents 5 ft regardless of how many pixels it occupies. A minimap, full-world map and normal camera are three views of the same coordinate model, not separate map databases.

Suggested loader contract (future): derive the view's axial footprint from the inverse camera transform, enumerate intersecting chunks plus a one-chunk prefetch margin, and retain an LRU cache of recently used chunks. Never load chunks just because an actor moves between them; the world state owns actors independent of rendering. At far zoom levels, render **derived per-chunk/region summaries** (terrain palette, discovered geometry, landmarks) instead of fetching thousands of full-res tiles and actors. A high-zoom overview can thus visualize an entire connected world without needing the full world in browser memory. Chunk summaries are rebuildable from authoritative chunks, never a second editable world source.

Start with 32x32 axial cells (max 1,024 positions per chunk) rather than 64x64. Gather loading/rendering measurements before changing that choice or adding background streaming. File boundaries do not draw visible seams or change movement distance. Each chunk file may be loaded, cached, or evicted without deleting the creatures that currently occupy it.

### Visibility, line of sight, and discovery

Do not equate **loaded**, **rendered**, **discovered**, **visible**, and **known to a player**. These are separate concepts:

- **Loaded:** the renderer has the chunk's data.
- **Discovered:** an observer has previously explored or been told about a location, persisted as observer/party-specific fog-of-war state.
- **Currently visible:** a gameplay rule calculates line of sight from observer position, obstacles, elevation, doors, and occlusion; this may depend on perception, darkness, senses, and other edition-specific rules.
- **Rendered:** visual presentation based on the observer's authorized knowledge, current camera, and scene-layer settings. Roof hiding and cutaway views are display policies, not player visibility permissions.

Interior roofs, cliffs and walls may obscure an actor from a viewer even though the actor is in the same loaded chunk. Falling underground or entering a house changes the actor's region/level or position; other viewers do not automatically follow or gain vision. For multiplayer, an **authoritative shared simulation** must decide what is allowed to be revealed; client-side fog is merely a visual effect and cannot enforce secrets. No multiplayer server, actual LOS calculation, persistence or fog-of-war has been implemented.

### Progressive implementation milestones

1. **Done in this terrain lab:** rock/stone/dirt/grass tops, exposed sides, integer raised terrain, top-surface picking, fixed-angle 2.5D projection, and pure signed 32-cell chunk coordinate math. No world streaming yet.
2. **Next:** formalize and validate world, region-index and chunk JSON schemas; load two neighboring chunks in one scene and assert no seams, no duplicate coordinates, safe path resolution, and negative-coordinate mapping.
3. **After that:** integrate real, licensed Atlas terrain/prop assets through the existing resolver and anchored renderer; test rotating all six camera views and animation timing.
4. **Then:** implement viewport-demand chunk loading and a derived minimap/full-map overview with strict scene cache bounds; benchmark before adding complex LOD schemes.
5. **Then:** establish authoritative actor IDs/position updates and tested cross-chunk movement; add portal traversal to interior/underground spaces.
6. **Later:** multiple surfaces/roofs, flying actors, walls/doors, visibility/LOS, individual discovery state, tabletop rules binding, and multiplayer/AI authoring only when their contracts and security tests are ready.

**Architecture acceptance requirements:** one actor ID survives crossing chunk edges; a viewport cache eviction cannot remove an actor; negative `q,r` map to the correct signed chunk; a roof cannot grant information a player has not discovered; a wall blocks only where an explicit geometry/visibility contract says so; a tile appearance cannot silently change movement or D&D rules; map/asset import never executes arbitrary pack-supplied code. Every later milestone must be tested against these invariants before it is integrated into the main tabletop UI.