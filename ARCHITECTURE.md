# Interactive Tabletop architecture — v0.27.0

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
- Damage and target HP handling were added later under the explicit v0.20 contract below; no mechanics are inferred from PDFs or SRD summaries.
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

## v0.19 spell effect profiles

`web/dnd-2014-reference.json` holds verified, edition-scoped effect metadata (six SRD 5.1 spells only). `web/reference-catalog.js` validates reference provenance; `web/dnd-action.js` plans, validates and commits the effect in the same existing action pipeline. `web/app.js` only displays opt-in, confirmation, roll and status. Character Vault stores the opt-in, active effects, pending concentration checks and live resources. Derived AC never mutates imported `character.ac`. See `DND_EFFECT_CAPABILITY_AUDIT.md` for full references and capability gates.

## v0.20 — Target and damage contract

The single `web/dnd-action.js` operation model now owns encounter targeting, typed damage evaluation and derived modifiers. **There is no new target engine or parallel action/spell pipeline.** `character.effects.targets[]` is a small manual target roster scoped to one character vault entry. Its `id`, name, AC, `hp` (current/max/temp), six saving-throw modifiers and explicit damage traits are saved alongside the player's encounter state. The hero itself is addressed by the reserved `self` ID and uses the existing authoritative `character.hp` and `character.ac`.

- `planDamage(character,targetId,spec)` is a read-only preview of raw damage, optional explicit save rule, damage type, immunity, resistance, vulnerability and temp HP. Do not guess enemy traits, saving-throw results, or spell damage from names or imported prose.
- `commitDamage` revalidates that entire preview immediately before mutation. It changes exactly one target's HP and, for self, queues the existing concentration check from damage that was actually taken. An explicit `undoLastDamage` is available only while the target HP has not changed and no later saved mutation has invalidated the snapshot.
- `evaluateAttack` and `evaluateSave` return outcomes from the actual settled dice result. Natural 1/20 auto fail/hit applies to attack rolls only, not 2014 saving throws. Critical damage is **not** automatically doubled; damage application remains a player/DM decision.
- Active effects may contain `modifiers: [{stat:'ac', amount:2}]` and `stack_key`. Derived AC combines different explicit sources and suppresses duplicate instances of the same named effect. Legacy `ac_bonus` remains readable; imported base AC is not rewritten. Other statistic modifier types require their own vetted rule contracts.
- `web/app.js` contains only target display, user confirmation, physical dice routing, and error reporting. The pending damage/saving throw UI is **ephemeral**; only the confirmed HP and target roster are persisted. Pending damage is scoped to the originating character and target so switching vault entries or removing a target cannot transfer it to another character.
- The 2014 reference catalog remains read-only and licenses unchanged. The user must explicitly configure `effect_kind=damage`, a supported formula, and `damage_type` for generic spell or homebrew damage automation; no SRD descriptions grant powers or slots.

**Known limits:** no automatic multi-target spell damage, monster statblock importer, terrain, advantage/disadvantage adjudication, automatic critical doubling, death-save workflow, comprehensive condition effects, or background initiative order. The user is responsible for entering correct manual target stats and validating rules with the DM. This D&D-only release does not add other TTRPG rules.


## v0.21 — Spell-slot identity and roll resolution

`web/dnd-slots.js` is the **single semantic resolver** for standard D&D Spellcasting resource names. It maps the user's old `First-level Spell Slots` and new `Level 1 Spell Slots` to *one* pool identity. PDF import writes canonical labels; vault read/reconciliation normalizes older labels; `DndAction.spellSlots` and `planSpell` call the same resolver. The planner returns the actual resource key that `commitUsage` spends. A normalized vault never duplicates 1st-level slots under two aliases. Conservative migration selects the smaller remaining count when duplicate aliases exist; it never sums them.

Pact Magic / separate class-limited resources are intentionally excluded: they are not interchangeable names for standard spell slots, and their use requires an explicit future contract. Spell preparation and edition-specific effects are independent from resource identity.

`DndAction.resolveD20` is the pure face-selection model for advantage/disadvantage. The shared dice table physically rolls either one or two d20s. `DndAction.criticalDamageExpression` transforms *only the dice count* when a completed natural-20 attack matches the same source and selected target. Hit, save, and critical outcomes are reports; HP changes still require a separate approved damage operation. Manually applied target conditions live inside the character's saved encounter and do not trigger inferred rules.

## v0.23 — Effect-local bonus roll orchestration

- `DndAction.compatibleBonuses(character, rollKind, reservedIds)` is a **pure selector**. It reads active effect records in the Character Vault and recognizes only explicitly supported roll kinds. The existing 2014 Guidance charge defaults to `ability-check`.
- `DndAction.setAutoUse` toggles a property on the effect record, not a second preference or per-user state. `auto_use!==false` preserves compatibility with legacy effects.
- The UI calls `queueRoll` with an explicit `ability-check` kind for skills and ability scores. Attack and save routes never infer compatibility from roll labels.
- `queueRoll` adds bonus dice to the same pending physical group without spending charges; `startDiceGroup` owns stable die IDs, primary count, bonus attribution and character ID. Render-layer sorting does not reorder results.
- `finishRollIfSettled` resolves the base d20 (including advantage/disadvantage) independently of bonus dice, then commits each still-active bonus once. In-flight IDs reserve effects against a second roll. If an effect ends before resolution, the bonus isn't counted.
- Neither the vault schema version nor the 2014 SRD spell source is changed. No added rules engine or independent dice simulation.


### v0.24 input and rules contracts

- A pending cursor-follow roll captures the next tabletop pointer gesture even when the cursor lies between its dice, before any sheet control handles the event. Only prepared dice in that group are thrown.
- Completed rolls repaint active-effect controls whenever charges change; last-charge consumption ends concentration and removes the corresponding token.
- `character.rules_profile` is the single character-level ruleset selection. `srd-2014` only selects catalog-validated profiles; an explicit `spell.automation="manual"` overrides it. Imported text and 2024 content cannot gain unverified 2014 automation.

### v0.25 typed roll bonuses

`DndAction.planSpell` validates one edition-scoped `roll_bonus` profile (`roll_scopes`, `consumption`, `dice`) against its reference identity. `startEffect` writes the validated semantics and a unique effect instance into the single Character Vault. `compatibleBonuses` is a pure selector for `ability-check`, `attack`, or `save` operations; `resolveRollBonus` revalidates the same instance/scope at dice settlement and atomically spends a charge if applicable. Sustained Bless-style effects are never consumed by a single roll and may serve concurrent rolls. Legacy Guidance records with `bonus_scope` retain their semantics. No generic prose interpreter, extra database or new dice engine.

Attack and saving throw action paths now tag their roll *type* explicitly. Target saving throws only qualify for a self buff when the target is the character; other encounter targets never inherit the player's Bless or Resistance. The same d20 role identity controls advantage/disadvantage and bonus dice composition.

### v0.26 verified healing automation and activation

Qualified spell profiles now declare an `activation` matched against their read-only SRD `casting_time` by the reference validator. The planner uses that validated timing, not a hardcoded mapping from effect type. Healing accepts the vetted `d4` / `d8` dice family with its configured per-slot scaling, using the existing self-heal roll/confirmation/pending-HP pipeline. Healing Word remains self-only; other creatures and bonus-action spellcasting restrictions beyond basic turn-economy tracking require DM adjudication. No new effect executor or character store is introduced.

### v0.27 single-turn spellcasting contract

- `DndAction.verifyEconomy` is the single eligibility check used at dialog preview and commit. It enforces the 2014 bonus-action casting restriction for **all** spell plans on explicitly `dnd-2014` characters, including manual/custom entries; the catalog only provides optional vetted spell effects. This does not execute any new effect or import rules from prose.
- `effects.combat.spellcasting = {bonus, restricted}` belongs to the existing optional per-character turn tracker. `bonus` records any bonus-action spell this turn; `restricted` records any non-qualifying other spell. A qualifying 1-action cantrip does not set `restricted`. No separate rules engine, action-log table, migration, or parallel vault state is added.
- The shared `commitUsage` validates before spending slots. Ending/starting an encounter and advancing a tracked turn resets both flags; turn undo restores them. Old vaults initialize missing flags safely. Outside tracked encounters these restrictions are intentionally not enforced.
- Casting-time text marked `special` is not invented as a standard action: it conservatively counts as a restricting spell for same-turn bonus spell decisions. Reaction spells cast outside the character's tracked turn, extra actions, and full initiative rules still require DM accounting.
