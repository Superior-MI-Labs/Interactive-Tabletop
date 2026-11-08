# Interactive Tabletop architecture — v0.45.0

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

### v0.28 — Single qualification and deployment pipeline

Previously the separate Pages workflow could publish without exercising any of the 15 Chromium gameplay checks, and browser tests assumed an absolute local executable and screenshot folder. The single GitHub Actions workflow now runs `tools/qualify.sh` for all Python, JavaScript and browser tests in its `qualify` job, and only builds/deploys Pages from `main` after qualification succeeds. `tests/browser_support.py` is the single Chromium launch policy shared by local and CI execution. Screenshots are not part of automated assertions. The edition gate lives in `DndAction.planSpell`, not in the UI selection alone. No new runtime service or game-state store is introduced.

## v0.29 — Effect lifecycle and concentration integrity

- `DndAction.endEffect` is the single ownership-aware effect removal path. `endAllEffects` now delegates to it for each active effect and clears orphan concentration checks from legacy saves; long-rest UI must **not** clear `effects.active` or remove arbitrary manual conditions directly.
- Concentration check identity belongs to `character.effects.concentration_sequence`, a persistent monotonic counter. It is not derived from wall time or the current queue length, which previously permitted ID reuse when several checks occurred or resolved rapidly. Old queued IDs remain readable; no migration or extra vault is needed.
- Undo of damage that generated a concentration check is safe only while that *exact check* remains pending. Once the check has resolved or the effect has ended, HP alone cannot be restored without also reversing a player/DM decision, so the undo is rejected.
- The existing Empty Body ability now records `effects.empty_body_owned` to remove only Invisibility that **it** added, preserving a manually present condition. Advancing and undoing a turn restore that ownership state. This does not create a new status system or presume that a long rest cures every manual condition.
- UI and action engine remain separate: rest handles HP/resource restoration, and all effect state/lifecycle operations go through the existing `DndAction` module. The expanded Node and real-Chromium checks run in the existing qualification pipeline.

## v0.29 — Configurable action and resource pool contract

The per-character **vault** remains the only persistence owner. The combat action engine maintains a single turn ledger in `effects.combat.economy`, with `auto`, `spent` counts for `action`/`bonus`/`reaction`, an `attacks` sequence, and explicit one-turn `grants`. Old `effects.combat.used` flags remain a derived compatibility view, not an independent budget. No global/combat engine database was introduced.

- `combat_profile.action_pools` declares DM-approved per-turn pool quantities (default: 1 each; configured 1–3). `combat_profile.attacks_per_action` declares an explicit attack allowance (default 1, configured 1–4). Importing a Fighter or Monk label **never** infers Extra Attack. These settings survive a PDF reimport.
- All spells and configured abilities use the existing `verifyEconomy` / `commitUsage` planner. Auto mode validates and charges the appropriate pool at commit. Manual mode still debits real class resources, but skips automatic action charges and same-turn enforcement; players may mark pools manually. Changing modes does not refund spent actions.
- A physical weapon attack uses `verifyAttack` before dice preparation and `commitAttack` at **actual throw**, never at cursor pickup/preparation. The first attack spends one Attack action and creates its explicitly configured remaining attacks; follow-up attacks spend only that sequence. Unrestricted granted actions permit another sequence, whereas attack-only Haste-style grants allow one attack. Extra Attack is *not* another generic action.
- Custom ability records may declare `economy_units` (1–3), `requires_attack`, `grant_resource` + `grant_amount`, and `grant_economy` (`any` or `attack`). Costs, prerequisites and pool existence validate before anything is spent. Custom resource pools live under the existing `character.resources`, have explicit reset policies, and are capped at their configured maximum. Sky's prior Shield Stance and Empty Body controls are compatibility facades using the **same shared action plan**. Turn-undo includes the ledger and turn-reset resources.
- The three-action Pathfinder-2e-style pool is now **representable**; actual Pathfinder rules are **not** implemented. Future edition profiles must provide verified action traits, multiple-attack penalties, subordinate activities, reactions and timing, rather than assuming D&D Attack action semantics. Likewise this alpha does not infer Action Surge, Haste, Monk Flurry of Blows, proficiency level, or homebrew defensive-point triggers from imported prose.

Core invariants: one transaction for resource charges and action budget; no hidden rules inferred from a name; no effect duplicate store; canceled pending attack dice spend no action; manual adjustments are possible and explicit; unsupported/unknown mechanics remain DM-adjudicated.

## v0.30 — Restricted attack permissions share the existing economy owner

The character vault remains authoritative; `DndAction` now distinguishes **Attack-action attacks** (`attackActionMade` and `attacks.remaining`) from **bonus strikes granted by configured features** (`economy.attackGrants`). Grants record `source`, `scope` (`unarmed`, `weapon`, or explicit `any`), and `remaining` charges. Normal attack budget/extra attacks and scoped bonus attacks are checked by the same `verifyAttack` / `commitAttack` functions. There is no second combat store or dedicated Monk executor.

An ability may declare `grant_attacks` (1–4), `grant_attack_scope`, `requires_attack`, and `requires_attack_complete`. For the explicitly applied 2014 Flurry template, an Attack action must finish first and remain the last tracked activity. A physical bonus-attack roll consumes exactly one grant at **throw**, not during cursor preparation. The original feature invocation is what spends its one bonus action/Ki. `advanceTurn` clears grants; `undoTurn` restores the saved ledger. Ability text is never parsed for permissions, and an unrelated or unclassified attack cannot claim an unarmed-only grant.

The PDF reimport merges attack classifications only on unique, unambiguous name matches. The incoming PDF remains authoritative for attack bonuses and dice. Classification is an explicit player/DM decision shown in the existing attack editor.

Remaining boundaries: the implementation does not yet model full initiative timing, movement between actions, off-turn interruptions, or every edition-specific attack activity. The 2014 'immediately after' constraint is enforced against tracked abilities/spells and Attack-action completion; the UI cannot observe out-of-band movement/DM narration. Pathfinder profiles remain future work.

## v0.31 — Physical-roll transaction boundary and character ownership

The existing `DndAction` staged workflow holds the only pending reaction sequence. `previewWorkflowFollowup` is a non-spending eligibility check; `finishWorkflow` revalidates and debits optional class points **when the physical prepared dice launch**. The browser prepares dice through its existing `queueRoll` and carries the pending workflow ID to `startDiceGroup`; a replaced or canceled throw cannot commit. `beginWorkflow` continues to charge the **initial** reaction on confirmed activation. The optional follow-up remains part of that original reaction and cannot be used twice.

`pendingRoll.characterId` tracks the prepared roll's originating character. Changing the vault selection clears the pending dice linkage; in-flight groups can finish animating but are discarded at resolution if their owner is no longer active. This prevents effect charges, target damage, HP healing and roll history from leaking into another sheet. We intentionally do not invent cross-character result routing or a second global dice store. Existing attack action costs still commit at throw. The UI's dice animation is not a gameplay source of truth.

### v0.32 — Explicit trigger windows, not another combat engine

Two approaches were evaluated: a universal trigger/event bus operating over imported prose, and a small declarative event window owned by the existing `effects.combat` state. The latter avoids an unbounded rules interpreter and duplicated state. `DndAction.recordCombatEvent` validates one DM-confirmed event type and per-character sequence. `plan` validates `trigger_event`; `verifyEconomy` checks event phase, reaction/action availability and costs; only `commitUsage` marks the event consumed. Windows expire at turn advancement or encounter reset; persisted IDs cannot be reused once consumed. Manual mode provides a DM override but retains configured resource costs. There is no automatic enemy turn simulator. Explicit `incoming-attack` occurs before roll resolution; `ranged-hit` means a confirmed ranged-weapon hit on this character; `melee-hit` means this character struck with a qualifying melee attack. Future authoritative attack events can route into the same `recordCombatEvent` contract when identity, target and timing are available.

Physical dice cancellation is also one owner: `cancelPreparedRoll` clears unthrown dice and pending effects, and `cancelGrab` restores physically held dice to their saved state. Neither operation reverses an already committed combat action. This is intentional: undoing a committed action must go through a validated gameplay transaction, never through pointer handling.

## v0.33 — Verified resolved attack events (same owner, no event bus)

- `DndAction.recordResolvedAttack` is the single entrypoint for a completed attack qualifying an `melee-hit` event. It validates the originating roll identity, current attack identity/type/range, target (another tracked creature), natural d20, and result. Auto mode re-evaluates the result against entered target AC; Guided mode requires an explicit **Hit** confirmation; Manual mode has no inferred event. A ranged/unclassified/self attack never gains a melee trigger.
- `web/app.js` owns physical dice and the Guided confirmation, calling the existing action engine only at the completed-hit boundary. The event window remains in `character.effects.combat`, storing source/target/roll provenance and consumed status. Its bounded recent-result IDs reject duplicate event grants from replayed dice. They reset on a new turn and are included in turn undo.
- `attack_range` is an explicit attack classification (`melee`, `ranged`, or unspecified), orthogonal to `attack_type` (`weapon`, `unarmed`, unspecified). No attack names, class descriptions or weapon text are parsed. The safe one-to-one PDF reimport retains both explicit classifications while the PDF still owns dice/bonuses. An in-flight roll whose source changes cannot unlock an ability or prepare stale automatic damage.
- A confirmed on-hit window exposes the configured ability but does not automatically consume Ki or apply conditions; the player confirms the ability, and any save/Stunned result remains DM-controlled. Unknown AC in Auto mode falls back to the already-existing Guided prompt. Other event kinds remain explicit manual/DM confirmations until matching incoming-attack/out-of-turn provenance exists.

## v0.34 — Short-lived event windows, not a message bus

The existing `effects.combat.event_window` remains the sole pending trigger. It now carries a turn identifier, and a melee-hit window may carry the exact tracked target. The action planner snapshots the current window identity and selected target; the commit path revalidates both. Only committed gameplay actions retire a window (`commitAttack`, unrelated `commitUsage`, manual `markAction`). A queued or canceled physical die is not a transaction. A damage roll generated by the same already-committed attack likewise does not retire its hit window. Switching combat assistance mode or removing the tracked target retires stale opportunities. Starting a new encounter and advancing turns still reset them. No wall-clock timeout, attack-name inference, global event bus, or second state store.

Old event windows without a turn stamp are rejected on read rather than silently gaining new eligibility; no migration of character records or new vault schema. A DM can still confirm abstract events explicitly, but the UI binds newly confirmed melee-hit events to the currently selected encounter target.

## Incoming attack windows (v0.35)

`DndAction.recordIncomingAttack` and `resolveIncomingAttack` form one two-phase **DM-confirmed** transaction over the existing `effects.combat.event_window`, not a new event log. A pre-roll event records `attackerId`, `targetId: self`, `attackKind` and a stable event ID. Warding Flare-style reactions may commit during that window. Adjudicating Hit/Miss after the roll either closes the window or replaces it with a descendant `ranged-hit` window, preserving `parentEventId` and attacker identity. Only `attackKind: ranged-weapon` and Hit can produce the descendant; a spell attack is not Deflect Missiles.

The `used` bit indicates whether the pre-roll reaction opportunity was consumed; it does **not** mean the hostile attack was canceled. The current reaction ledger remains spent after outcome adjudication. Removal of the original attacker or expiration of the old event rejects pending confirmation. Manual event buttons remain an explicit override for an external DM adjudication, but never become facts derived from physical enemy dice until a real enemy-attack pipeline is deliberately designed. No extra action economy, state store or rules interpreter is added.

### v0.36 — Saving throw provenance and committed damage events

- `DndAction.recordResolvedSave` is the sole commit point for physically settled target saves. The canonical `effects.combat.last_save` record contains roll identity, creature ID, ability, DC, total, derived outcome and encounter turn. `recentSave` validates this persisted evidence; there is no separate UI result store. A verified save may emit a target-scoped `save-success` or `save-failure` in the existing single event window. The 40-ID replay guard survives the vault and turn undo; a new turn clears stale save evidence.
- **A save does not automatically apply to damage.** The player must explicitly associate the exact recent saved result with a damage roll and choose the DM-approved half/negates-on-success policy. `planDamage` stores `saveId`; `commitDamage` recomputes the entire plan against that exact current evidence and target before spending HP. Manual DM-confirmed outcomes can still use the existing explicit input contract. Saving throws by themselves never change HP or conditions.
- `commitDamage` is the sole origin for tracked `damage-taken` events; the event names its self target, actual damage type, post-trait damage and HP loss. Immunity/zero damage and attacks on other creatures cannot open a self-damage trigger. An unfinished staged workflow is never displaced by damage reporting. No trigger is emitted by a preview. Undo is disallowed if the resulting event was consumed or replaced and retires its own unspent window when reversing HP.
- Future saving-throw or damage-dependent class features must provide approved structured triggers and validate target, provenance, timing, cost and resource limits in the existing `verifyEconomy`/`commitUsage` pipeline. No inference from spell text, class names, or PDF prose.

## v0.37 event predicates and binding

An ability's optional `event_save_ability`, `event_damage_type`, `event_min_damage` and `event_min_hp_loss` are **explicit approved configuration**, not imported rule inference. `DndAction.plan` validates these fields by trigger kind and snapshots a frozen filter plus the current combat event/target identity. `verifyEconomy` consults the one existing event window through `verifyCombatEvent`, checking trusted physical-save or applied-damage origin and numerical evidence *before* costs and effect mutations. Empty filters retain existing DM-confirmed manual event behavior. Manual combat mode remains advisory for the same canonical action rules.

The UI only exposes the settings and acts on `verifyEconomy`; on confirmation it uses the **original** planned transaction, not a freshly generated plan that might bind to a different intervening event. The same rule applies to staged reactions. There is no second event subscriber, rules parser, queue, or client-side budget ledger. Test boundaries: before-event previews, same-kind replacement, foreign targets, temporary HP, invalid imported settings, resource atomicity, cancel/confirm, vault round-trip and turn undo.

### v0.38 — One staged workflow ledger, two declarative sequences

The existing `DndAction.plan` validates either `damage-reduction` (reaction, d10 reduction, optional counterthrow) or `save-condition` (verified event, one activation cost, explicitly configured saving throw, optional DM-confirmed target condition). `beginWorkflow` commits the initial action once and stores the source, event ID, target, DC and stage in the **existing** `effects.combat.pending_workflow`. It never derives feature mechanics from text. The regular target-save physical dice route carries a workflow ID to `recordResolvedSave`; that recorder verifies the exact sequence and saves a single replay-protected result without creating a competing event window. Save success closes the sequence; save failure moves to `await-effect`. `finishWorkflowCondition` revalidates the original failed saved result and applies the approved condition to that same target exactly once. Canceling pending dice allows a rethrow without a second Ki expenditure. A deleted target or advanced turn ends the sequence; as of v0.39 undo does not reopen an interrupted stage. The application does not claim to know precise monster initiative or when an externally imposed condition expires: the DM ends it manually. No new event bus, rules engine, condition store or source-of-truth state exists.

### v0.39 — One lifecycle owner for staged workflows

`DndAction.pendingWorkflow` is the sole live-stage read for both `damage-reduction` and `save-condition`. `beginWorkflow` stamps the original turn and assistance mode in the existing `effects.combat.pending_workflow`; every reduction, follow-up, save result, effect application and decline goes through the same live-stage validation. A mode change retires that record, as do encounter ending, target deletion and advancing to the next turn. Turn undo restores prior action-pool accounting and ordinary effects but deliberately does **not** resurrect staged work whose physical roll might already have been canceled or interrupted. Activation costs are not refunded. Old v0.38 records acquire a compatible stamp on first access.

The UI still owns transient physical dice. `abandonCharacterDice` discards prepared and in-flight rolls whenever their source character changes, the encounter/mode changes or the turn advances. Switching back reuses the saved workflow but requires a fresh dice throw. The shared modal callback binds its original character identity, closing the last cross-vault confirmation gap. These are input/transaction boundaries, **not** another game-state store or ability executor.

## v0.40 — Condition provenance, not a second condition system

- The existing `target.conditions` and `character.conditions` arrays remain the visible on/off state and the compatibility contract for imported characters. The existing `effects.combat.condition_grants` array adds **source provenance and optional expiry only**, not another status store. A grant is `{id,targetId,condition,sourceId,owned,expiry}`. `owned=false` means an independent manual or imported condition existed first and must outlive the grant. When multiple approved sources overlap, ownership transfers to the survivor, including an active self-effect from `activeEffects`; condition effects never stack by merely repeating their label.
- Only `DndAction.grantCondition`, `endConditionGrant`, `setTargetCondition`, `advanceTurn`, and `advanceTargetTurn` mutate this condition lifecycle. `endEffect` transfers ownership instead of blindly deleting a still-granted condition. The UI supplies explicit DM confirmation and cannot remove/expire a grant directly. One identifier covers each source; malformed vault metadata never becomes a runnable timer.
- `expiry` is `null` for DM-managed conditions, or `{anchorId,endTurn}` with `anchorId='self'` for source next-turn end and an encounter target ID for that target's next-turn end. Every turn N's **end** is the boundary when advancing from N to N+1; a grant applied during N with next-turn-end expires on the transition N+1 to N+2. Player turns are already tracked in `effects.combat.turn`; encounter targets get only a counter incremented by the explicit, DM-confirmed `advanceTargetTurn` action. This is not initiative order or a scheduler.
- Personal `advanceTurn` and `undoTurn` preserve the complete condition-grant snapshot plus current target-condition projections. Ending/restarting an encounter conservatively de-anchors still-active grants to DM-managed, rather than inventing lost turn history. Source removal through the encounter roster removes the affected grants. Legacy v0.38-v0.39 save-condition workflows lacking expiry remain DM-managed.
- The 2014 Stunning Strike template pins `source-next-turn-end` by explicit configuration; no runtime character-name or class-text inference. Other configured staged abilities can opt in to the small, validated timing vocabulary. The application does **not** yet automate concentration breakdown for arbitrary target effects, creature-specific reaction resets, whole-party initiative, or ruleset-specific interrupts.


### v0.41 — First-visit demo and turn-bound event ownership

- `web/demo-character.js` is a **pure, original, versioned sample character factory**, not a rules engine, an importer, or a second persistence source. It is consumed only by `web/vault-store.js` through the same `upsert`, `normalize`, and browser IndexedDB adapter as real characters. The sample's `demo_id` is an explicit marker; it is not derived from the character name. The importer must ignore demo entries when matching real PDF identity.
- Only the **initial** IndexedDB initialization on the static Pages site auto-creates a demo, and only if there is no legacy localStorage sheet. An existing empty vault records deliberate deletion and stays empty. The regular welcome and character vault offer manual demo creation for desktop users and anyone returning later. A confirmed demo reset only replaces that exact demo entry; it never overwrites other characters.
- The Fighter's two attacks per Attack action, extra-action grant, resources and healing use existing `combat_profile`, ability plans and typed pools. These sample values are never inferred from imported text. A generic extra-action grant requires an active encounter before any charge can be spent.
- `advanceTargetTurn` retires only events, save evidence and pending workflows associated with the creature whose boundary the DM confirmed. It does not infer any global initiative order or refund an earlier action; existing target condition clocks still own condition expiration.


### v0.42 — Derived practice guidance and creature-turn projection

The onboarding callout is a projection of the active demo's existing `DndAction.combat`, selected encounter target and physical-dice state. Each contextual action uses the normal `data-action` dispatch (`toggle-encounter`, `attack`, `auto-throw`, `advance-turn`) or the existing UI target selection. It never persists tutorial steps, fabricates attack outcomes or creates a parallel gameplay controller. Dice launch is still the only Attack action debit; canceled preparations are reversible. A specific `data-pointer-priority="control"` annotation gives instructional/turn-control buttons priority over die pickup when their hit regions overlap, leaving normal sheet/dice gestures unchanged.

`DndAction.creatureTurns(character)` exposes a read-only, derived roster of each target's existing `condition_turn` and the condition grants anchored to it. This is presentation data, not a second turn ledger. Only `advanceTargetTurn` mutates it, only with explicit DM confirmation. The guard against a numeric turn-clock overflow must reject before expirations or event retirement. Unit and browser regression owners: `test_creature_turn_overview.js`, `browser_practice_turns_smoke.py`.

### v0.43 — Manual creation reuses the existing import/vault contract

`CharacterImport.createManual` is a pure alternative source of **explicit** character v1 data, alongside D&D Beyond `fromFields`. It computes only standard 2014 ability/skill/save modifier arithmetic from entered values; class/species names do not grant mechanics. The three-stage UI is a temporary DOM form displayed in the existing vault layer, **not** saved gameplay or tutorial progress. Only a fully validated submission calls `Vault.upsert` with a fresh ID, then saves via the existing storage adapter. Canceling must not mutate the vault. Existing character editing is the follow-on for equipment, spellcasting and homebrew; automated class/level progression and other editions remain deferred. Unit and Chromium regressions cover invalid fields, vault isolation, manual status and narrow layouts.

### v0.44 — Setup is a character-sheet projection

`web/app.js` derives a post-creation checklist only for the existing manual creation provenance marker, using the character's attacks, features/actions, inventory and optional spells. Nothing persists completion flags; it cannot change rule eligibility. The normal tab/edit machinery receives setup links. New attacks, feature notes and spell drafts remain ordinary character-v1 records. Notes never grant an action, spells never grant slots from a name, and only `DndAction` validates spending and effects. Regression owners: `tests/test_character_setup_contract.js`, `tests/browser_character_setup_smoke.py`.

## v0.45 — One validated manual resource editing path

- Standard Spellcasting slot identity/legacy aliases remain in `web/dnd-slots.js`; `configure` returns a normalized new resource map, rejecting invalid totals atomically. Zero total explicitly removes a standard slot level; Pact Magic is not treated as ordinary slots.
- `web/dnd-action.js` owns generic pool settings, standard-slot commits and quick current-use changes. UI does not write resource amounts directly. Existing names and character vault storage are preserved; edit fields cannot authorize class mechanics.
- `web/character-import.js` validates manual attack/spell dice and attack bonuses for both initial creation and later edits. Invalid edits are rejected before mutation; imported records remain editable without inferring new features. The UI uses the same existing `setPath` persistence flow.
- `tests/test_manual_resource_configuration.js` and the extended `tests/browser_character_setup_smoke.py` protect slot identity, resource limits, negative inputs, vault persistence and editor wiring. No second spell-slot store or class-progression engine was added.
