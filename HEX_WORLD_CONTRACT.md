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
- `hex-world-demo.json` is deliberately *not* an Atlas pack and does not invent asset IDs. An Atlas binding will be introduced only after testing a real published asset pack and resolver. This scene version contains flat terrain only; there is no elevation, multi-hex collision footprint, or wall-edge model yet.

## Geometry and camera

`web/hex-world-core.js` is the authoritative, DOM-free implementation of axial-to-world, cube rounding, distance, neighbor lookup, projection and inverse projection. `web/hex-world-lab.js` owns only Canvas 2D drawing and camera controls. Camera yaw rotates in exact 60° increments; tilt is bounded at 25°–70°; zoom anchors to the mouse position; middle/right mouse drags pan. UI selection uses the inverse camera transform, not the location of a drawn sprite. The v1 lab uses non-Atlas debug shapes to prove geometry, **not** production artwork.

Camera zoom and rotation are view state and do not change tile IDs or character values. Moving objects or actors and triggering D&D actions is **out of scope** for this first milestone.

## Future Atlas integration

Visual Atlas already defines `smi-visual-pack/1` assets: `region`, `sequence`, `state_set`, `composition`, and pivot-aware drawing via its shared renderer. Keep that manifest authoritative. The world loader should eventually resolve a stable asset ID through a validated pack, draw at the object's anchored position, and choose directional sprites according to camera facing; it must not copy frames, create a parallel animation schema, or infer a renderer from tags. Terrain, props and actors will be distinct scene concepts, but game actors will reference Tabletop-owned character identities rather than duplicating HP, skills or rules.

The current prototype does **not** download Atlas artwork, implement animation state machines, network synchronization, persistent maps, pathfinding, elevation or AI generation. Avoid adding those until the world geometry, scene file and sprite placement have a demonstrated contract.

## Qualification

`node tests/test_hex_world.js` verifies math/scene invariants and invalid input. `python tests/browser_hex_world_smoke.py` checks the actual lab in Chromium, including loading JSON files, mouse interactions and the initial fit-to-screen layout. Both are picked up by the existing `tools/qualify.sh` globs, without a new CI workflow.