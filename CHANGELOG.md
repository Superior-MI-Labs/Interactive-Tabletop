## v0.31.0 — Deferred optional-roll charges and vault-scoped dice ownership

- Counterthrow confirmation for a configured staged reaction now **previews** and prepares physical attack dice without spending the optional Ki/resource. The existing `DndAction.finishWorkflow` becomes the single final debit at **actual dice launch**, revalidating the same pending sequence, catch/free-hand confirmation and available resource. Replacing/canceling prepared dice, failed revalidation and stale/declined sequences never consume the optional resource. The initial reaction remains spent when first activated, and the follow-up never spends a second reaction.
- A prepared combat roll records its originating character vault ID. Switching characters discards prepared dice state instead of allowing a later throw to charge a different character. Rolls still in flight are removed from the physical pending queue at settlement **without** entering another character's history, damage, concentration, bonus effects, or HP; the original character's spent action is not refunded.
- Strengthen unit + Chromium tests for cancellation, resource depletion between preparation and launch, stale sequence resolution and two-character switching (including in-flight rolls). One shared action engine, one vault, one physical dice table, and the existing full-browser CI gate remain authoritative.

## v0.30.0 — Scoped bonus attacks and verified Flurry prerequisites

- Extend the *existing* `effects.combat.economy` ledger with restricted bonus-attack grants. No separate action store or class-feature interpreter is introduced.
- A player/DM-approved D&D 2014 Flurry template spends one bonus action and one Ki only after the Attack action is fully completed and no other tracked activity intervenes. It grants exactly two explicitly classified unarmed strikes; neither strike is a new Attack action or another bonus action.
- Attack rows expose qualifying Bonus Strike buttons. Physical attack dice consume one grant at launch, not at preparation; mixed weapon/unarmed attacks cannot borrow an unarmed-only grant.
- Preserve explicitly approved attack classifications across unambiguous PDF reimports without overwriting the PDF's bonuses or damage. Duplicate-name imports remain unclassified rather than guessed.
- Extend Node, vault, and real Chromium regressions (18 browser scenarios) for prerequisites, spending, grants, turn reset/undo, invalid plans, manual accounting, and UI behavior.

## v0.29.0 — Safe effects and configurable combat economy

- Reuse the existing effect end path for long-rest cleanup; preserve manual conditions, stable concentration-check IDs, resolved-check damage-undo safety, and Empty Body condition ownership.
- Add DM-configurable 1–3-unit action/bonus/reaction pools, 1–4 attacks per Attack action, scoped extra-action grants, and optional automatic or manual action spending; preserve legacy turn flags and saves.
- Consume a weapon Attack action only when physical dice launch. Extra Attack extends the same Attack action, unrestricted Action Surge-style grants enable another action, and Haste-style grants permit only one additional attack. Never infer features from PDF prose.
- Extend explicit custom ability records with action-pool cost, prior-attack prerequisite, custom resource grant, and scoped extra-action permission. Validate all resource mutations atomically; support resource pool creation and turn-reset policy from the UI.
- Route Sky's existing Shield Stance and Empty Body activation through the shared action planner, preserve their previous data, and retain manual condition ownership.
- Add comprehensive Node and Chromium tests, preserving the single Python/Node/browser CI gate. Pathfinder-style pool arithmetic is available as a **configurable primitive**, not a qualified Pathfinder ruleset.

## v0.28.0 — Qualified browser deployment and strict rule provenance

- Consolidate GitHub checks and Pages deployment into a single dependent workflow: a push or PR must pass Python, Node and all 15 Chromium gameplay smokes; only the qualified main branch may deploy.
- Use one pinned Playwright test runtime and one shared Chromium launcher across Linux and CI. Remove developer-specific screenshot paths, which were not tested assertions and broke portability.
- Require an explicitly D&D-2014 character edition for every validated SRD automation profile, including per-spell overrides; unspecified and 2024 characters can still cast manually. Add negative and non-mutation regression tests.
- Keep one canonical `web/` source, one QA command, and generated desktop/Pages distributions. No parallel rules, browser runner, or storage layer.

## v0.27.0 — Same-turn 2014 spellcasting contract

- Enforce the bonus-action spellcasting restriction for all confirmed spell plans inside the existing optional encounter turn tracker, without interpreting imported prose or expanding unsupported spell effects.
- Preserve the 1-action cantrip exception in either casting order. Reject leveled, reaction, special, and bonus-timed alternatives as required; keep verified action-cost and slot validation atomic.
- Persist two small spellcasting flags inside the existing combat state, with legacy-save defaults, turn advance/undo and encounter reset. No new rules store or public schema migration.
- Show a contextual hint in the existing action tracker and qualify both unit and live-browser scenarios.

## v0.26.0 — Verified casting times and Healing Word self-healing

- Qualify 2014 SRD Healing Word for explicitly confirmed, self-only healing: `1d4 + spellcasting modifier`, upcast +1d4 per slot, no allied HP changes.
- Move automation action timing into each vetted reference profile and require exact agreement with the SRD casting time. Spell effects no longer hardcode whether they consume an action or bonus action.
- Keep one shared planner and pending-healing pipeline, with no inferred homebrew behavior or automatic HP writes.
- Extend unit/browser checks for action economy, slot consumption, successful roll settlement, manual/2024 guards and tampered catalog metadata. The full 2014 bonus-action spellcasting restriction still requires DM enforcement.

## v0.25.0 — Validated typed roll bonuses: Bless and Resistance

- Qualify 2014 SRD Bless as a sustained concentration-linked d4 on self attack rolls and saving throws; automated ally targets remain unsupported.
- Qualify 2014 SRD Resistance as a single d4 on a saving throw; its final charge ends the effect and concentration.
- Move Guidance to the same data-driven `roll_bonus` schema. Retain compatibility for old Guidance buff records and saves.
- Generalize typed roll scopes and settlement-time effect validation, including recast protection and sustained bonuses for concurrent rolls.
- Route self attacks, self saving throws, and concentration saves through explicit roll types; reject applying self bonuses to other encounter targets.
- Test contract qualification, charges, concentration, stale effects, UI roll composition, and damage-independent compatibility.

## v0.24.0 — Rules profiles and dice cursor fixes

- Fixed mixed-dice cursor follow: click between dice grabs the entire prepared group instead of clicking the sheet.
- Pointer capture, drag/release, right-click and Escape are handled in the shared table controller.
- Effect bar re-renders when Guidance consumes its last charge.
- Per-character Rules selector enables all **qualified** D&D 2014 SRD spell automation profiles; unsupported spells remain manual.
- Preserves per-spell manual overrides and the rules profile during PDF reimports.
- No rules inferred from arbitrary descriptive text.

## v0.23.0 — Effect-local auto-use bonus dice

- Move charged roll bonuses from a separate Use button into a per-effect checkbox, enabled by default for active effects including legacy saves.
- Bind extra dice to the originating skill/ability-check roll, including physical d20+d4 and advantage/disadvantage (2d20+d4).
- Consume once after the dice settle, with in-flight charge reservation; preparing, replacing or canceling an unthrown roll never spends the charge.
- Explicit roll compatibility: only ability and skill checks use the current Guidance bonus, never attacks or saves.
- Keep die roles stable using die IDs across depth sorting, with separate base and bonus totals in roll history.
- Add Node contract and browser simulation regressions covering toggles, 2014 Guidance compatibility, legacy saves, in-flight throws and double consumption.

## v0.22.0 — consolidated release and compatibility gates

- Bundle v0.19–v0.21 combat, effect, roll, and slot fixes into one deployable update over public v0.18.
- Correct an unmigrated, duplicate spell-slot alias display to use the conservative remaining count, matching the casting validation path. No extra slot pool or source of truth.
- Centralize the release number in `VERSION` for CI/build/publishing; retain the bootstrap installer version inside its own extracted archive.
- Make CI execute all JavaScript `tests/test_*.js` without a manually maintained list.
- Add asset/import-order and release metadata regression tests to prevent broken Pages publication.
- Ensure the publisher checks both Python and JavaScript tests before preparing a Git commit.

# v0.22.0 — Shared spell-slot identity, d20 roll modes and critical damage (local candidate)

- **Root cause:** older Sky Blue Eyes saves used `First-level Spell Slots`, while the current casting engine only recognized `Level 1 Spell Slots`. Both previously rendered but only one could be spent. A single `web/dnd-slots.js` module now identifies standard spell slots by level and is used by the PDF importer, vault normalization/reimport, spellbook listing, and spell planning. This applies to levels 1–9 and documented legacy labels.
- Migration normalizes legacy aliases and conservatively merges duplicate labels for the same pool (never adds their totals). Spent slots carry forward across reimports, without silently granting extra resources; normal spells and other resource pools are not reclassified as spell slots.
- Added physical d20 roll modes in the Dice panel: normal, advantage, disadvantage. The resolver selects the correct die face for total and natural 1/20; other dice remain ordinary summed rolls.
- Added validated critical damage dice calculation for a *resolved* critical attack on the same selected target and imported weapon. It doubles only base dice, not flat modifiers, and consumes the critical association once. Extra feature dice, multipliers, and DM rulings remain manual.
- Added manually toggled conditions on encounter targets, using the existing combat-state model; no duration or automatic saves are invented.
- Regression tests cover the v0.9 starter save alias, 1st–9th-level parsing, duplicates, upcasting, reimport preservation, canceled casts, browser advantage/critical flows, and legacy save migration, alongside old gameplay suites.
- This is a local release candidate, **not** a claim that the public GitHub Pages alpha has been updated.

# v0.20.0 — Typed damage, encounter targets and safe resolution (local candidate)

- Extended the **existing** `DndAction` model with explicit encounter targets (per-character saved combat state), six saving throw bonuses, current/max/temp HP and configurable damage resistance, vulnerability and immunity. This is a small manual roster, not a second character database or monster rules engine.
- Added purely evaluated 2014-style attack hit/critical and save-versus-DC results. A roll never applies damage automatically; the player must preview and confirm the proposed target HP change.
- Added validated damage planning for explicit 13 D&D damage types or untyped damage. Saving throw half/negates policies are opt-in, resistance/vulnerability are applied once each, immunities prevent damage, and temporary HP absorbs before current HP. Damage into concentration prompts a check via the existing effect engine.
- Added typed effect modifiers on tracked buffs, with same-source stacking protection and compatible reading of legacy `ac_bonus` records. Imported base AC is never edited.
- Added **Undo last damage** with stale-state guard, deleted-target guard, and cleanup of still-pending concentration checks. Any subsequent saved mutation invalidates that undo.
- Connected manual/configured spell and ability damage rolls to the shared physical dice result pipeline, with target selection captured before the throw. No spell effect is inferred from narrative text or reference summaries.
- Extended vault reimport to preserve an explicitly configured spell `damage_type` and the entire active encounter state. No live character data or PDFs are included in this release.
- Added target model, save, damage, undo, stacking and browser smoke tests, with older gameplay test gates retained. No new database, physics engine, framework or RPG rules package.

# v0.19.0 — D&D effect capability milestone (local release candidate)

- Three verified 2014 SRD spell profiles, explicitly opt-in: Cure Wounds (self healing/upcast), Shield of Faith (+2 derived AC, concentration), Guidance (one-use d4 charge).
- Compact buff/debuff strip with effect durations, charge control, end effect, pending concentration saves; imported AC is unchanged.
- Concentration DC is max(10, half damage rounded up), and uses the existing physical dice system; failures expire the linked buff.
- Presets stored in the canonical offline catalog; pure D&D planner executes all effects. Reimport keeps spell opt-in and modifier overrides.
- New pure-model and browser interaction tests and full 112-reference capability audit.
- This does not automate every D&D spell or other editions; no live deployment is claimed.

# v0.18.0 — SRD comparison and safe gameplay templates (release candidate)

- Added source-pure comparison of imported spell level, casting time, range, components, and duration with matched 2014 SRD references. Missing fields are labeled as such and never auto-corrected.
- Added navigation from matched reference spells to the authoritative imported spell editor instead of generating duplicate spell entries.
- Added an explicitly confirmed, inert **custom action draft** for SRD spell references absent from the character spellbook. No spell is granted, no slot is spent, and no roll/effect/resource cost is guessed.
- Blocked duplicate reference drafts and cross-edition 2024 draft suggestions. Kept full SRD attribution and the bundled offline catalog.
- Fixed the reference/confirmation overlay order; extended model and browser interaction tests, including cancellation and resource preservation.
- Canonical `web/` source continues to build both the GitHub Pages site and desktop archive; existing vault and dice systems remain unchanged.

# v0.17.0 — Expanded 2014 SRD reference and safer lookup (release candidate)

- Extended the bundled 2014-compatible SRD catalog from 35 to **112 spells**, retaining all 149 equipment records. No 2024 material or non-SRD premium spells were added.
- Added casting level, school, timing, range, components, ritual and concentration fields for the new entries, with concise summaries and visible source/attribution.
- Implemented exact-name matching with only two reviewed D&D Beyond naming variants and the `[R]` ritual annotation suffix. No fuzzy matching, no homebrew substitution, no character-state writes.
- Added compact reference search across names, aliases, school, equipment properties and summaries; filter by spell level; show filtered counts and explicit ritual/concentration data.
- Expanded browser and model tests for catalog filtering, licensing, edition isolation, PDF variants, and non-SRD guards. Existing vault, combat, spell and dice tests remain release gates.
- Source changes are unpublished until reviewed; the existing public GitHub Pages site is left untouched.

# v0.16.0 — SRD references and licensing

- Added 35 selected SRD 5.1 spells and 149 equipment records with source metadata.
- Integrated a searchable read-only Reference tab, spell/item source buttons, and a permanent About & licenses dialog.
- Kept PDF values, DM overrides and character saves authoritative; no equipment or spell value mutations.
- Bundled catalog in PWA offline shell; added validation, edition guards, license notice and tests.
- Catalog remains partial and 2014-only; no external API dependency or 2024 cross-edition mixing.

## v0.15.0 — Accurate dice grabbing and overlapping physical throws (release candidate)

- Centralized hit testing in the existing dice physics module, using the actual projected polygonal faces, including d12 and dice hovering above form controls.
- Capture dice at the tabletop ancestor before buttons and inputs; preserve ordinary controls when no die is hit.
- Suppress tabletop right-click menu and unintended text selection; right-click to release a grabbed die, left drag/release still works.
- Track independently active dice groups; the user can throw new dice while old groups settle or catch/rethrow one already moving. No new physics engine or forced rollout timeout.
- Scope pending healing effects to their own rolling group. Only one unapplied healing result is permitted at a time; explicit HP application remains required.
- Added rendered-face unit tests and browser acceptance of overlapping button, right release, concurrent throws and independent results.
- Documented license-safe, offline-first SRD reference data design without adding a second character-data source of truth.

## v0.14.0 — D&D encounter economy and explicit conditions (release candidate)

- Added optional encounter turn state with action, bonus action, and reaction markers in the **existing Actions** workspace. No second combat UI or database.
- Confirmed spells and abilities share atomic resource + turn-economy validation; failed attempts never debit spell slots or Ki.
- Added explicitly configured **self-conditions** to abilities/spells, with source-aware removal when tracked effects expire. Existing conditions remain untouched.
- Next Turn advances both the original effect timers and combat economy once; Undo Turn reverses that one step, until a later mutation occurs.
- Preserved legacy Empty Body and Shield Stance behavior; raw attack/damage roll buttons remain roll-only, with manual action markers.
- Expanded Node, Playwright browser, CI, migration and packaging coverage. No new dependencies or changes to hosted Pages.

# Change log

## v0.13.0 — Confirmed spellcasting and active effects (early alpha)

- Slot-specific spell casts, preparation checks, cantrip support, upcast choice and preflight confirmation. No spell slot changes on canceled or invalid casts.
- Concentration and player-configured timed effects live on the character document, not in UI-local state. One concentration effect replaces another; turn advance decrements only finite durations.
- Editable homebrew durations and spell execution expressions, kept across PDF reimports without overwriting updated PDF-owned statistics.
- The healing result is tied to exactly the corresponding dice request. Manual dice replacement cannot leak healing into an unrelated roll.
- Active-effects panel and concentration saving-throw dice shortcut. Damage displays only a reminder, with no automatic DM ruling.
- Expanded pure-model and Chromium-browser regression tests for spells, concentration and timed effects.



## v0.12.0 — D&D action contract + installable shell (early alpha)

- Unified action usage: validate first, show cost and dice in confirmation, then spend resources once and prepare the existing physical dice.
- Optional, **explicitly configured healing** can be applied to HP after the dice settle. No automatically inferred damage/healing or homebrew rules.
- User-edited imported actions now become manual overrides so PDF reimport preserves DM adjustments.
- PWA manifest and locally cached application shell; external PDF.js still requires a first online load.
- Added bounded pure-action tests and continued all vault, importer and physics regression gates.
- D&D-only. Other games and editions remain future architectural considerations.



## v0.11.0 — D&D Character Vault foundation (early alpha)

- IndexedDB browser vault replaces the one-active-character save without deleting legacy localStorage data.
- Desktop `vault.json` store with read-only migration from the original `character.json`; one canonical vault endpoint for updates.
- Character picker, switch, single export, full-vault backup/restore, explicit deletion confirmation.
- Reimport confirmation and conservative data reconciliation: newer PDF stats, current HP/resources, notes, preparation, manual actions preserved.
- D&D-only system marker (`dnd5e`, edition unspecified). No new game systems or rule engine.
- Automated vault/model/migration tests and installer backup of both old and new formats.

This milestone does not claim live multi-user sync, rules edition automation, PWA installation, or validated physical dice fairness.
