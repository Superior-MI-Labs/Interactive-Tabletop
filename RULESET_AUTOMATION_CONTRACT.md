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
