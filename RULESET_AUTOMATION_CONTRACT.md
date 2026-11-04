# Ruleset and effect automation contract (v0.26 alpha)

## Source of truth

- Each character has one `rules_profile` setting. `manual` is the safe default; `srd-2014` selects only validated, edition-specific automation profiles from the shipped, offline SRD catalog.
- `system_edition` is the character's actual edition metadata, not a toggle for automation. A character explicitly marked 2024 cannot apply the 2014 profiles.
- A spell's `automation` is an **explicit override**. `manual` blocks global automation; `srd-2014` enables that supported profile for the specific spell even if the global preference is manual. An unset override defers to the character preference.
- No importer writes rule effects from prose. The PDF owns character facts; the reference catalog owns read-only qualified rules; active effects and resource mutations are owned by the shared D&D action engine.

## Qualification gate

1. A spell reference must match the exact edition and an unambiguous known alias.
2. Its effect profile must validate against the catalog schema, the imported spell level and the supported typed operations.
3. The D&D action engine plans before spending anything, checks resource pools and action economy, and requests confirmation before committing.
4. Physical dice results are resolved by stable die ID and only consumed when complete.
5. Only the final completed roll may consume a charge. If the effect expires first, discard its bonus.
6. Ending the final charge is an effect-state mutation: render the Effects bar immediately from that state.

Supported qualified SRD 2014 profiles in this alpha are **Cure Wounds (self healing)**, **Healing Word (self healing, bonus action)**, **Shield of Faith (derived AC)**, and **Guidance (single d4 on an ability check)**, **Resistance (single d4 on a saving throw)**, and **Bless (sustained d4 on self attacks and saves while concentrating)**. All other SRD spells stay reference-only, and custom or unrecognized mechanics remain manual. No inferred behavior, external executable rules code, or alternate character database is introduced.

## Dice gesture contract

A prepared cursor-follow roll captures the next primary pointer gesture **anywhere on the tabletop**, even in the space between dice or over an underlying sheet button. `pointerup` releases the entire prepared group; a click without a flick still throws. Right click can release an ongoing grab. Escape stops follow mode but leaves dice prepared on the table. Ordinary sheet controls remain interactive when no prepared gesture is awaiting pickup; the post-gesture click is suppressed so it cannot trigger a control underneath.

Regression gates: standalone d12 pickup; mixed d20+d4 cursor release; a short click; advantage with an extra bonus die; concurrent rolls; effect expiry and DOM repaint; manual per-spell override; old save import; 2024 edition refusal; full vault persistence; package/extraction/upgrade.

## Typed roll bonuses (v0.25)

- A validated catalog profile declares a `roll_bonus` with `dice`, `roll_scopes` and `consumption`. The supported self scopes are `ability-check`, `attack` and `save`. The supported consumption modes are `charge` and `sustained`. Unknown roll kinds and unsupported dice definitions fail validation.
- The shared effect state owns `bonus_scopes`, `bonus_mode`, `auto_use` and a unique effect-instance identity. A recast replaces the previous effect and invalidates any roll already in flight. Older Guidance `bonus_scope` saves are read without migration.
- Dice are prepared and associated with the originating roll by stable IDs. On settlement, the same effect instance and scope are validated again. Charged bonuses expire when spent; sustained bonuses apply repeatedly until concentration, expiry or manual end.
- Bless automation only represents the character selecting themself as an eligible target. The SRD allows multiple targets, but applying it to allies still requires DM handling until a shared multi-character targeting contract exists.
- The effect checkbox is UI for eligibility, not a duplicate source of truth. Importers, homebrew descriptions, and external APIs never execute arbitrary effect logic.

## Qualified healing and action timing (v0.26)

- Each automated profile declares its verified casting action (`action`, `bonus action` or `reaction`). Catalog validation rejects a mismatch with the spell reference casting time. No effect-type-to-action hardcoded mapping remains.
- The existing heal executor supports vetted `d4` and `d8` first-level healing profiles, with one extra base die for each higher-level slot and a validated spellcasting modifier. Healing Word is self-target only, even though tabletop rules allow another visible creature.
- A settled healing result still requires explicit HP application, and a canceled or blocked cast never spends a slot. The optional encounter tracker accounts for bonus action usage; complex bonus-action spellcasting restrictions and targeting others are not automated.

## 2014 bonus-action casting and turn ownership (v0.27)

- For a character pinned to `dnd-2014` **and** with encounter tracking enabled, a committed bonus-action spell forbids any other spell on that tracked turn except a cantrip with an actual 1-action casting time. That exception works in either order; a prior nonqualifying spell also prevents casting a bonus-action spell. Cantrips whose casting time is bonus action or special do not qualify.
- All `kind: spell` plans (qualified SRD automation, manual and homebrew) go through the same check. A manually marked **ability** does not masquerade as a spell. Unknown/special cast times are conservatively tracked as nonqualifying spells, but the action budget remains under DM control.
- The flags belong to `effects.combat` and persist through the normal vault; changing the active character, importing a new PDF, and reloading the browser do not reset a tracked turn. Reset/undo use the same encounter pipeline. The UI only displays the existing flags.
- This guard assumes a tracked character turn. Reactions on other creatures' turns, Action Surge, special class traits, ritual casting and multi-character initiative are **not** automatically reconciled. When encounter tracking is disabled, no 2014 same-turn restriction is enforced.

## Strict edition gate (v0.28)

- The D&D 2014 effect planner requires `character.system_edition === 'dnd-2014'` for **every** automated profile, whether enabled by the character-level selection or an explicit per-spell override. Unspecified and 2024 editions cannot execute 2014 profiles. Manual spell planning always remains available. A rejected automated plan must not consume a slot, effect or turn resource.
- The catalog lookup and UI controls are advisory presentation; the planner enforces the final edition boundary independently of callers.

## Effect lifetime and damage undo (v0.29)

- Long-rest ending is a lifecycle operation, not raw array replacement. Call `DndAction.endAllEffects` so conditions introduced by effects, concentration queues, and derived modifiers are removed through their owner. Manually applied conditions persist until the player/DM clears them.
- Each pending concentration check has a per-character, persistent identity, independent of clock resolution and queue ordering. A completed check must never be recreated or selected by a later damage event.
- Damage undo is rejected once its associated concentration check has been resolved, interrupted, or removed. Restore HP/temp HP plus discard the pending check only when the check is still unresolved; otherwise the character's authoritative decision history wins.
- Legacy Empty Body invisibility is owned only when the ability actually introduced that condition. End/expiry does not delete independently present Invisibility.

## Player-configured action pools (v0.29)

`combat_profile` owns user-configured pool limits and attacks-per-Attack-action. `effects.combat.economy` owns current turn spending, attack sequences, manual/automatic selection, and scoped one-turn extra action grants. Ordinary expendable and custom homebrew points remain in the existing `character.resources`, with optional `reset: turn` policy. Any consuming action must pass the existing action planner, and custom abilities must declare exact costs/prerequisites/resource grants before use. Untyped dice throws are not combat actions; a configured weapon Attack action is charged when the physical dice launch, not when prepared. Confirmed spells and configured abilities charge on commit.

Do not equate an action-unit grant with an attack allowance. A Haste-style attack-only grant allows one additional attack; Action Surge-style unrestricted grants allow one new action. Monk-style bonus actions and homebrew abilities require a configured feature record and explicit resource costs; no edition or class-feature prose parsing is authorized. The optional manual-accounting switch leaves resource costs intact but disables automatic action-pool enforcement. Configurable three-point action pools are only a **foundation** for Pathfinder 2e; the Pathfinder rules profile and multiple-attack penalty model are not yet shipped.

## Player-approved bonus attack permission (v0.30)

`grant_attacks` is an explicitly configured ability output (0–4); `grant_attack_scope` restricts the resulting independent bonus strike allowances. A grant is **not** an action, an Attack action, or a full Extra Attack sequence. `verifyAttack` authorizes one physical strike based on its explicit `attack_type`; `commitAttack` consumes one grant only on dice launch. A template scoped to `dnd-2014` rejects other editions in the shared planner, including manual override attempts to enable it as an automated 2014 feature.

The optional `requires_attack_complete` gate additionally requires the Attack action to have exhausted its configured sequence and to be the most recent tracked activity. A long-rest or new turn does not carry attack permissions forward. Persisted grants remain in the existing character vault. Manual accounting never invents grants or auto-spends action units. Configuring the Flurry template is opt-in and preserves the original imported description; generic imports never acquire it automatically.

## Staged optional costs and character-scoped dice (v0.31)

A confirmed reduction reaction spends its initial reaction once. Its optional child counterattack has two phases: `previewWorkflowFollowup` validates eligibility without spending, and the existing `finishWorkflow` validates again and spends only when its physical dice **launch**. Never spend optional Ki at button-confirmation/roll preparation; do not refund an already used reaction because follow-up dice are canceled. If the pending sequence expires, changes identity, is declined, or the point pool becomes insufficient, the launch is denied without a new spend. No separate workflow executor or queue is authorized.

Every prepared combat roll belongs to a character's vault ID. Switching away clears it; an in-flight group from that character cannot settle into the new character's history, conditions, HP, resources, targets or buffs. Cross-character roll routing is unsupported until there is a deliberately designed multi-character combat contract.

## Trigger-aware ability qualification (v0.32)

- `action.trigger_event` is an optional **explicitly configured** enumerated prerequisite: `incoming-attack` (before the incoming attack roll), `ranged-hit` (confirmed ranged-weapon hit on self), or `melee-hit` (own confirmed qualifying melee hit). No imported text is parsed into these fields. A configured reaction requires the right event type, not simply a free reaction pool. The damage-reduction staged workflow defaults to `ranged-hit` even for old saves.
- `recordCombatEvent`, `combatEvent` and `verifyCombatEvent` are the single entrypoint and read contract. The active character's existing combat record owns the current event. It is consumed only after successful `commitUsage`, invalidated at the next turn/encounter reset, and never transferred between characters. Auto/Guided disable unavailable abilities; Manual leaves adjudication with the DM while still charging specified point costs.
- The Stunning Strike example is **not** an automatic Stunned application: a qualifying melee hit opens the option, spending Ki starts an attempted stun, and the DM must resolve the target Constitution save and duration. The Warding Flare example requires a pre-roll incoming attack event and explicitly configured limited-use resource; line of sight, range, susceptibility to blindness and disadvantage remain table-verified. These are player-approved templates, not unrestricted SRD catalog automation.
- Physical dice right-click/Escape cancels only **unthrown** preparation or a held die; there is no retroactive refund after action commit. Cancellation and UI gestures must never mutate resource pools or combat records.

## Verified on-hit provenance (v0.33)

A fully resolved `target-attack` physical roll can create a typed `melee-hit` window **only** when the recorded attack has explicitly configured both an eligible attack type (`weapon`/`unarmed`) and `melee` range, the original source is unchanged, the target is a non-self tracked creature, and the hit is confirmed. Auto rechecks against entered AC; Guided always requires the user's explicit Hit choice; Manual never automatically produces it. Unknown AC in Auto also requires the Guided confirmation. The window records roll/source/target identity, is one-use, and is not a resource spend. Correct 2014 Stunning Strike still needs explicit activation and a DM-adjudicated save. Incoming attacks and incoming ranged hits remain explicit until an opponent attack pipeline can provide equally trustworthy timing and target provenance.

## Event window lifetime and recipient binding (v0.34)

- A resolved melee hit is tied to its original roll/source and encounter target. A DM-confirmed melee hit is associated with the selected creature. On-hit ability execution in Auto/Guided cannot be redirected to another target; removing the original target invalidates it.
- Event IDs and their turn stamps are authoritative in the single combat state. A plan made while a window is open cannot be applied to a replacement event of the same kind. The next unrelated **committed** action or attack closes the old window; merely preparing or canceling dice, rolling its damage, or displaying the sheet does not.
- In Manual mode the DM retains responsibility for eligibility; costs remain explicit. This is intentionally not an interpreter for arbitrary prose, nor a timer based on real-world milliseconds.

## Incoming attack provenance and response timing (v0.35)

- An explicitly selected encounter creature and classified hostile attack create one `incoming-attack` event **before** its attack roll is resolved. A Warding Flare reaction must commit during that window; range, line of sight and blindness applicability remain DM-confirmed.
- Outcome resolution must name the exact event ID and provide a boolean Hit/Miss decision. Only a confirmed **ranged weapon** hit may open a child `ranged-hit` event. Melee weapon, spell or unclassified attacks and misses close the original window without granting Deflect Missiles.
- Consuming a pre-roll Warding Flare opportunity does not skip resolving the incoming attack, refund the reaction, or create a second reaction. Removed attacker, stale ID, ended turn and edited/unknown classification fail safely; no character resource is spent for invalid events.
- This is a DM-confirmed incoming-attack workflow, **not** enemy attack automation, a visibility/position solver or a generic narrative interpreter. Legacy DM override buttons remain manual provenance and are labeled as such.

## v0.36 — Save / damage event contract

`save-success`, `save-failure`, and `damage-taken` are short-lived character combat windows, not automatic abilities. A save is recorded from a settled physical roll, with a unique roll ID, exact target, chosen ability, DC and derived outcome. In Auto/Guided encounter tracking, it may satisfy an explicitly configured event prerequisite. A failed save never automatically applies an enemy condition, and a successful save never implicitly reduces an unrelated later damage roll.

Damage reduction requires the DM/player to choose that particular recorded save and a policy (`half` or `negates`). Plan and commit both verify save ID, target, active turn and result; stale associations reject without HP mutation. Manual DM determinations remain a supported explicit path. Nonzero damage applied to the active character can open a `damage-taken` event using post-resistance damage and exact HP loss. Undo cannot roll back HP after that event is consumed or replaced. The single per-character combat ledger remains authoritative.

## Verified outcome filters (v0.37)

Only user/DM-configured ability records may specify `event_save_ability` (CON/DEX/etc. for `save-success` or `save-failure`), `event_damage_type` (listed type for `damage-taken`), `event_min_damage` (final applied damage, which may include temporary HP loss), or `event_min_hp_loss` (real HP decrement after temporary HP). Thresholds are nonnegative bounded integers and unsupported trigger/field combinations fail before any spending. A filtered save must originate in the `recordResolvedSave` ledger; filtered damage must originate in `commitDamage`. A DM-only generic event does not fabricate those measurements.

Every planned event ability carries the current event ID and the relevant selected target or self recipient. A plan prepared before the event or under a replaced event is not eligible to commit later—even if the new event has the same kind and satisfies the same filters. No resource or action charge occurs on failed validation. The reviewed plan is the one committed after confirmation, and a dice cursor may be canceled before throw without spending its roll-bound costs. Manual combat mode leaves event eligibility to the DM, without silently synthesizing automated evidence.

## Staged saving throws and conditional conditions (v0.38)

`workflow: {kind: 'save-condition', save: {ability: 'CON', dc: 15}, on_failure: {condition: 'Stunned'}}` is **explicit, approved configuration** attached to a normal action plan with a verified target-bound event. The engine validates the DC (integer 1–99), saving throw ability, condition and event identity before the original resource expense. The target rolls its own save using the existing physical dice and one common save recorder, pinned to the exact workflow ID and original target. A successful save ends it. A failed save only enables a separate DM-confirmed target-condition mutation. Dismissal and dice cancellation do not refund a committed initial cost. No follow-up can reroute to another target, reuse a save from an unrelated ability, or apply twice. A DM manually ends imposed conditions at their legally appropriate duration; single-hero turn tracking is insufficient to infer all opponent initiative timings. A template is opt-in, edition-pinned and never parsed from imported prose.

## Interrupted staged workflow contract (v0.39)

A configured, committed staged ability is tied to the character’s active encounter turn, combat mode, original target and unique sequence. The initial action/reaction and Ki or other resource cost remain spent when the player declines, switches modes, changes turns, loses the target or ends the encounter. No old pending saving throw or reduction die may settle after those interruptions, and undoing the turn must not revive an interrupted stage. Character switching is different: the persisted stage can be resumed on return, but any prepared or in-flight physical dice are discarded so the player must explicitly roll again. An opened confirmation modal may never transfer authority to a different active character. These rules apply equally to 2014 templates and explicitly configured homebrew staged workflows; no capability is inferred from imported descriptions.
