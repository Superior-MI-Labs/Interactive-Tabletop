# Interactive Tabletop architecture — v0.18.0

The **character JSON document** remains authoritative for a given character. The **vault envelope** (`schema_version: 1`, `active_id`, `characters[]`) owns collection identity and persistence; it is not a second rules model.

- `web/character-import.js`: single D&D Beyond field-to-character normalizer, shared by desktop and browser.
- `web/browser-pdf.js`: browser PDF.js form-widget extraction; PDF bytes stay in the browser.
- `main.py`: desktop pypdf extraction and vault JSON read/write; no independent character normalization on this path. Old single-character GET is read-only for migration compatibility.
- `web/vault-store.js`: collection contract, legacy migration, conservative import reconciliation, IndexedDB and desktop API storage adapters.
- `web/app.js`: UI rendering, interactions, orchestration and dice scene. It reads/updates one active character in the vault; it must not maintain another character database.
- `web/dice-physics.js`: shared approximate dice simulation, independent of character vault selection.
- `web/styles.css`: only UI stylesheet, `web/theme-assets.json` is the visual manifest.
- `docs/`: generated site. Never edit the generated sources directly; run `tools/build_site.py`.

## Import/reimport rules

1. Import PDF fields, normalize once, match on character name and player identity (species fallback).
2. If a match exists, ask before merging. Imported stats, maximum HP, attacks, equipment and known spell records refresh.
3. Preserve current HP (clamped to new max), temporary HP, conditions, turn effects, note fields, roll history, manual actions, preparation and spell notes.
4. For resources, preserve the spent count when the maximum changes. Unknown resources are preserved rather than silently deleted.
5. The merge never invents action rules or changes D&D rules edition. For manually modified abilities, the manual entry wins over same-named imported text.
6. JSON vault restoration replaces the entire vault **only after explicit confirmation**. Users should export backups first.

## Deferred boundaries

No Pathfinder, generic system-pack registry, native desktop rewrite, network sync or rules engine is added in this milestone. Future game definitions must be configuration-driven and must not hardcode game rules in the shared dice engine. Existing UI/data remain D&D-only until a future design is validated.

## v0.12: D&D ability execution boundary

- `web/dnd-action.js` is a small **pure D&D action planner**, not a second character store. It validates configured roll expressions and resource costs before a use is confirmed.
- The browser controller owns confirmation, dice movement and user-visible effects. The action planner owns resource debiting and bounded healing only.
- PDF prose never configures an automated healing effect on its own. Only an explicitly edited `effect_kind=heal` on a character action enables the **Apply to HP** control after a settled roll.
- No automated damage, target HP, concentration or duration inference; the DM/player remains responsible.
- `web/manifest.webmanifest` and `web/service-worker.js` provide a cacheable installable **UI shell**. IndexedDB owns characters. PDF.js currently loads from a pinned CDN on first use; offline PDF import remains network-dependent.

## Deployment source of truth

- `web/` is the only authored frontend source. `docs/` is a generated output and git-ignored in new development.
- Pages CI tests the source, builds the one-ZIP desktop download and copies the site from `web/` during deployment. The hosted release and its download come from the same commit.
- The existing deployed `docs/` files can remain in older history; no one should edit them directly or use them as the current source of truth.

## v0.13 D&D spell and effect boundary

- `web/dnd-action.js` remains **the one pure operation planner**, extended with `planSpell` and shared `commit`, `startEffect`, `advanceEffects` and `endEffect`. No parallel spell engine.
- Only `character.resources["Level N Spell Slots"]` is used for spell slot debits; a missing resource must be corrected explicitly, never invented. Casts check preparation; cantrips cost no slot; a requested slot must be at or above the spell level.
- A spell's structured `duration` may indicate **concentration**; `concentration` boolean is an explicit user override. `duration_rounds` is opt-in. No time/turn estimates are inferred from arbitrary feature descriptions or spell text.
- Character `effects.active` is the only persistence location for tracked timed effects and concentration, adjacent to legacy `effects.empty_body_rounds` (preserved for older saves). Active-effect records are `{id,name,concentration,rounds_remaining}`. `null` means untimed; no scheduling/background clocks.
- Import reconciliation preserves only player-authored executable spell overrides (`roll`, `effect_kind`, `duration_rounds`, `concentration`) while still updating PDF-owned source metadata.
- `web/app.js` performs UI confirmation, validates a fresh plan on confirmation, then calls the shared commit and physical dice request. It never commits a resource cost when the dice table is full or a throw is already active.
- A queued healing effect is scoped to the exact pending dice request. No automatic damage targets, saving throw outcomes, spell DC logic, advantage rules or comprehensive 2014/2024 mechanics.
- Do not create a second action engine when adding spell features, conditions, or other systems.

## v0.14 — Consolidated D&D encounter state

- `web/dnd-action.js` owns optional per-character `effects.combat` state alongside previously tracked concentration and timed effects. It does **not** create a separate combat database.
- `setEncounter` starts or ends optional action-economy tracking (action, bonus action, reaction). `verifyEconomy` validates configured activation when tracking is on; `commitUsage` validates remaining resources **and** action economy before mutating either. The existing `commit` alias calls the same implementation.
- Only exact recognized activation types (`action`, `bonus action`, `reaction`, and `1 ...`) are counted. Longer casting times and special or ambiguous activations are deliberately not guessed. Simple attack/damage/ability dice buttons remain *roll-only*: the player can mark a basic action, bonus action, or reaction manually.
- Player-configured `effect_kind=condition` plus `effect_condition` can attach a **self-condition only** on confirmed action or spell use. The effect record owns the condition only when it adds it; expiration/manual effect ending transfers that ownership to any remaining source or leaves pre-existing conditions unchanged. Never infer conditions from imported narrative.
- `advanceTurn` performs one deliberate round tick, refreshes tracked action economy, expires timed effects through the same `endEffect` path, and advances the legacy Sky Empty Body duration. `undoTurn` restores only that last advance and is invalidated by the next saved mutation.
- Character JSON and vault reconciliation remain authoritative. The combat state is saved inside each character's existing `effects` object and preserved on PDF reimport; no external clocks or background processes.
- This is **player-centric turn tracking**, not an encounter initiative-order tracker for a multi-character party. It does not automate target selection, enemy stats, action surge, spell-specific exceptions, legendary actions, or adjudicate D&D 2014 vs 2024 differences.


## v0.15 — Independent dice interaction

- `web/dice-physics.js` owns the **same projected faces** used for rendering and hit testing. There is no second hitbox geometry or per-die CSS overlay.
- `web/app.js` captures actual dice hits at the shared tabletop ancestor *before* underlaid controls. The canvas remains non-interactive so a miss passes through to its actual target. Text selection is suppressed inside the tabletop, except text input editing.
- `activeRolls` is an in-memory collection of throw groups, each with die IDs, expression, modifier and optional pending healing effect. `activeRoll` is a compatibility alias for existing alpha smoke checks only; the groups are authoritative. All dice share one scene and one physics step loop.
- Catching a die in an active group suspends that die but does not cancel or reroll its siblings. A new manual throw uses a separate group without consuming a staged ability roll.
- Once all dice in a group rest, the group computes its independent result; it does not wait on unrelated dice. No future completion timeout is used.
- Reference content remains **read-only contextual metadata**; game state and DM overrides remain in the vault. See `RULES_REFERENCE_DESIGN.md`.

## v0.18 reference-to-character boundary

`ReferenceCatalog.compareSpell()` is a pure field-level comparison; it never writes to the vault. For an SRD spell matched to an imported spell, the UI navigates to the existing spellbook entry. Only catalog spells absent from the character may produce a confirmed **inert** `source:manual` action draft, with no configured dice, resource cost, spell preparation, or effect. This is a manual homebrew note, not a duplicated spellbook record. Edition guards and explicit provenance remain enforced.
