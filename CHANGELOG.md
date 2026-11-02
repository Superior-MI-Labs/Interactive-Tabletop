# v0.18.0 — SRD comparison and safe gameplay templates

- Added source-pure comparison of imported spell level, casting time, range, components, and duration with matched 2014 SRD references. Missing fields are labeled as such and never auto-corrected.
- Added navigation from matched reference spells to the authoritative imported spell editor instead of generating duplicate spell entries.
- Added an explicitly confirmed, inert **custom action draft** for SRD spell references absent from the character spellbook. No spell is granted, no slot is spent, and no roll/effect/resource cost is guessed.
- Blocked duplicate reference drafts and cross-edition 2024 draft suggestions. Kept full SRD attribution and the bundled offline catalog.
- Fixed the reference/confirmation overlay order; extended model and browser interaction tests, including cancellation and resource preservation.
- Canonical `web/` source builds both the GitHub Pages site and desktop archive; existing vault and dice systems remain unchanged.

# v0.18.0 — Expanded 2014 SRD reference and safer lookup (release candidate)

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

## v0.16.0 — Accurate dice grabbing and overlapping physical throws (release candidate)

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
