# Interactive Tabletop — agent working contract

Read `ARCHITECTURE.md`, `RULESET_AUTOMATION_CONTRACT.md`, and `DND_EFFECT_CAPABILITY_AUDIT.md` before changing gameplay rules. This is an early-alpha, local-first D&D tabletop application. Preserve user character data and explicit DM/player confirmation above feature count.

## Source-of-truth boundaries

- `web/` is the authored browser/desktop UI. `docs/` and the downloadable desktop ZIP are **generated** by `tools/build_site.py` and `tools/build_release.py`. Do not patch generated code or ship a different code path for desktop.
- The per-character vault (`web/vault-store.js`) owns imported facts, inventory, resources, selected ruleset, effects, and encounter state. Never maintain parallel gameplay state in UI globals or storage adapters.
- `web/dnd-action.js` is the sole planner, validation and commit path for actions, spells, and their resource/effect mutations. `web/app.js` owns display, confirmation and physical dice orchestration; it does not infer rule mechanics.
- `web/dnd-2014-reference.json` provides read-only, **edition-scoped**, explicitly qualified SRD behavior. `web/reference-catalog.js` validates the catalog. Never execute rules inferred from spell descriptions, PDF prose, names, user-homebrew text, or dynamic code.
- A missing validated profile is **manual**, not an error, under global 2014 ruleset preference. An explicit automation override without a qualified profile must fail safely. Do not introduce another rule engine to support one spell.
- Action economy and 2014 casting restrictions belong to `effects.combat`, never a separate subsystem. Validate again immediately before committing costs. Respect manual and 2024/unspecified edition boundaries.

## Before implementation

1. Locate and test the current capability. Compare extending the existing contract with adding a new subsystem; default to extending the existing one.
2. Write the behavioral invariant, the mutation owner, and the failure/rollback behavior. Prefer a small stable contract over adding more states, flags, managers or adapters.
3. Cover positive and negative cases: cancellation, duplicate action/charge, stale rules, disabled tracking, legacy vault, edition mismatch, empty resources, turn advance/undo, and frontend gesture interference if relevant.
4. Keep browser/desktop behavior identical and source assets canonical. Do not commit private PDFs, character saves, test screenshots, caches, or generated ZIPs to `main`.

## Qualification before push

The same test command gates every pull request, push, and Pages deployment. No browser tests are allowed to remain local-only.

```bash
python3 -m pip install -r tools/requirements-qa.txt
# On a machine without /usr/bin/chromium:
python3 -m playwright install chromium
bash tools/qualify.sh
python3 tools/build_release.py && python3 tools/build_site.py
```

`TABLETOP_CHROMIUM=managed` forces Playwright's downloaded Chromium; alternatively provide an absolute executable path. Browser tests must not write screenshots to repository paths, assume `/mnt/data`, or bypass `browser_support.launch_chromium`. Tests use the real DOM, real JS modules, and in-memory API stubs, with no external network calls. Pull requests run full qualification but never deploy; `main` deploys **only if** qualification passes. Record exact failures; never claim Pages succeeded until the deployment check reports success.

Update `VERSION`, launcher/site version references, `CHANGELOG.md`, and architecture/contracts together. Only the canonical `web/` is edited; `docs/` and desktop ZIPs remain generated.

## Lifecycle review rule

No UI operation may assign directly to `character.effects.active` to end effects. All removal must go through `DndAction.endEffect`/`endAllEffects` to preserve condition ownership and concentration cleanup. Check damage previews, associated concentration saves, damage undo, and turn undo as one transactional behavior; don't blindly restore HP after a saved outcome has already been resolved.

## Action economy contracts (v0.29)

- Do not add a Pathfinder engine or duplicate turn ledger. `effects.combat.economy` is the sole spending state; `effects.combat.used` is a compatibility projection. `combat_profile` is explicit user/DM configuration, `character.resources` owns class/homebrew points, and `DndAction` validates and commits them.
- Preserve the difference between action-pool units, extra attacks within an Attack action, and restricted action grants. No class feature (Extra Attack, Haste, Flurry of Blows, Action Surge, Sky homebrew) may activate by name/prose parsing. Explicit custom ability cost, activation, permissions and prerequisite must be validated before resource mutation.
- Physical attacks debit at dice **throw**, not when the dice are prepared or cursor-follow is canceled. Check manual mode, no-encounter mode, full pool, variable three-action pools, failed costs, partial multiattack, granted-action limits, turn undo and PDF reimports. `tests/test_economy_pools.js` and `tests/browser_economy_smoke.py` protect these contracts.
- Custom resource pools use the vault's existing resources object and reset policy. Pathfinder rules remain unavailable pending a complete, edition-pinned rule profile including multiple-attack penalties, activities and reactions. Do not claim that support merely because the pool primitive is configurable.

## Attack-permission regression contract (v0.30)

- Differentiate `action` attacks from `bonus` strikes in the same `DndAction.verifyAttack/commitAttack` pipeline; `attackActionMade` alone qualifies Attack-action prerequisites. Bonus strike grants must never increase this counter or create a new Extra Attack sequence.
- `grant_attacks` and `grant_attack_scope` are explicit configured feature metadata, never inferred from spell/class/attack names. User-approved attack classification is `attack_type`, with ambiguous PDF reimport matches rejected safely.
- `Flurry of Blows (2014)` requires a completed Attack action immediately before the bonus-action/1-Ki activation. Never charge Ki before prerequisites pass or spend another bonus action for the two strikes.
- Test all three combat modes, old vaults, action-grant contention, multiple attacks per action, late/duplicate activations, unarmed-vs-weapon scope, prepared-but-unthrown dice, turn reset, undo, and imported attack identities. See `tests/test_attack_permissions.js` and `tests/browser_attack_permissions_smoke.py`.

## Physical roll ownership and optional follow-ups (v0.31)

- Keep `DndAction.previewWorkflowFollowup` and `finishWorkflow` as the shared eligibility and commit boundary. The browser only prepares/throws dice; optional costs are **not** spent until launch. A stale, declined or underfunded sequence must fail without affecting resources or turn accounting. The initial reaction is still spent on activation.
- Every combat roll must be associated with the active vault character. On character switches, clear prepared rolls and never resolve previous-character physical rolls into the new character's history/effects/HP. Do not create cross-vault sync by convenience.
- Regression gates: `tests/test_staged_abilities.js`, `tests/browser_staged_smoke.py`, `tests/browser_roll_ownership_smoke.py`; keep browser-test coverage count and the unified qualification command current.

## Reaction/event and input ownership (v0.32)

- All reaction abilities must have a verified trigger timing, not merely `activation: 1 reaction`. Only typed event windows in `effects.combat` qualify configured events; `DndAction` owns opening, eligibility and consumption. Imported text must not be interpreted as runnable rules; profiles must be opted into and edition-qualified.
- Never award a Stunned condition on mere hit: target saving throw still needs resolution. Never place a pre-roll ability after an attack has already hit. Do not use an automatic hit-result without known target AC, attack type and player/DM confirmation.
- Right-click/Escape cancels pending physical dice; these gestures cannot undo committed gameplay transactions. Preserve active-roll ownership, cursor capture cleanup, and charged resources. Regression gates: `tests/test_combat_events.js` and `tests/browser_event_cancel_smoke.py`.

## Resolved-hit event contract (v0.33)

Use the existing typed event-window store (`effects.combat.event_window`) rather than introducing an event bus or an attack-outcome store. Only physical d20 settlement and explicit Guided Hit confirmation may create a `resolved-attack` window. Capture the source identity/type/range when dice are prepared and revalidate at settlement. Do not infer melee/ranged from names or PDFs; invalid source, self target, miss, wrong mode, or duplicate settled roll must not create an event. Never spend optional ability resources just because a trigger became available. Test Auto, Guided, Manual, critical/miss, duplicate IDs, turn advance/undo, safe PDF reimport and real-browser UI eligibility.

## Event-window expiry regression (v0.34)

Treat an event as one turn-scoped, optionally target-scoped opportunity. Only the existing D&D action/attack transaction boundaries can retire it. On-hit plans snapshot event identity; commit must reject a stale window or different target without consuming Ki, reaction or other resources. Preparation, canceled dice and damage rolls do not constitute new actions. Target deletion, combat-mode changes and turn advancement expire the opportunity; test undo and legacy saves. Never add per-ability event timers or a second event bus. Regression gates: `tests/test_event_window_lifecycle.js`, `tests/browser_resolved_attack_event_smoke.py`.

## Incoming attack event sequencing (v0.35)

Use the existing `recordIncomingAttack`/`resolveIncomingAttack` contract. A typed pre-roll window must identify a present encounter attacker and an explicit attack category; only confirmed ranged-weapon Hit may transition to the linked post-hit Deflect Missiles event. Spend Warding Flare before result adjudication, never retroactively; resolving an attack neither grants nor refunds a reaction. Do not infer attacks from names, imported prose, or make opponent dice/positions up. Stale ID and removed attacker must reject safely. Test both browser action controls and the pure planner; keep the manual override path explicitly labeled.

## Verified save and damage results (v0.36)

Never associate the most recently rolled saving throw with later damage simply because its target matches. Saving throw evidence lives in the existing `effects.combat.last_save` record and must be explicitly chosen for damage mitigation; `planDamage` and `commitDamage` both reject stale save IDs/changed targets. Commit `save-success`/`save-failure` only from confirmed dice outcomes; emit `damage-taken` only after actual applied self-damage, never during a preview. A damage-triggered event that was consumed or replaced blocks undo. Preserve complete provenance, turn and target validation when extending any event. Add both unit and Chromium regressions.

## Event-predicate and modal transaction gate (v0.37)

Represent verified save/damage conditions as bounded declarative fields in approved action definitions, evaluated only in `DndAction.verifyCombatEvent` against the single character-owned event window. Do not parse natural language or introduce per-feature callbacks. Reactions may filter by `event_save_ability`, `event_damage_type`, `event_min_damage`, or `event_min_hp_loss`; only the appropriate verified event origin can satisfy a nonempty filter. Missing/wrong evidence, stale event ID, different selected target, changed turn or previously spent reaction fails before resource mutation. Action confirmation must retain the **original** planned event token, including staged workflows; never silently replan against a replacement event. Both Node and real Chromium tests guard this.
