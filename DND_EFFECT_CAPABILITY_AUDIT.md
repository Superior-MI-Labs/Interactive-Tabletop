# D&D effect capability audit — v0.26

## Architecture decision

The imported character PDF and DM edits are character truth. The versioned **SRD 5.1 reference catalog** is read-only and is the source of *verified* optional automation profiles. The shared `dnd-action.js` plans, validates and executes these effects. The UI only previews and requests actions. The Character Vault persists changes. No second rules engine, separate spell database or hardcoded per-spell UI logic.

## Core effect components and interactions

| Component / contract | Present in v0.26 | Next required contract |
|---|---|---|
| Character vault and imported fields | Yes | Multi-edition source provenance per record |
| Spell-slot resources and costs | Yes; confirmed and atomic | Distinguish feat/item free castings from slot castings |
| Action, bonus action, reaction tracking | Yes, encounter opt-in | Ready actions, triggers, multi-round casting |
| Dice expression and physical throw | Single homogeneous dice group; completed rolls | Composite expressions, crits, advantage, disadvantage, per-target dice |
| Self-targeted direct healing | Yes; apply only after roll | Ally targets, healing over time, conditional amounts |
| Derived AC modifier buffs | Yes for SRD Shield of Faith | Numeric typed buffs, nonstacking rules, diverse defenses |
| Buff/debuff UI | Yes: compact status tokens with timer and end controls | Icons, localization and richer tooltips |
| Concentration | Yes: replacement, DC prompt, save, failure ends effect | Conditions automatically break concentration, per-hit death saves |
| Charges | Yes: Guidance single-use d4 spent on completed throw | Multiple charges, recharge triggers, automatic check-total combination |
| Timed effects | Yes: rounds advanced manually | Real-time, minute/hour clocks, turn-start/end triggers |
| Conditions | Configured self-condition ownership | Targeted status, immunities, saving throw at end of turn |
| Targeting | Self only for automated SRD spells | Ally, enemy, area, line of sight, range and resistance |
| Save resolution | CON concentration check; other checks remain manual | Spell DC, success/failure degree, half/no damage, multi-target |
| Damage | Manual rolls and HP damage | Resistance, vulnerability, immunity, damage type and target HP |
| Concentration checks on damage | Persistent queued DC(s) from damage button | Physical dice integration into damage-to-save workflow |
| 2014 vs 2024 edition | 2014 only, explicit per-spell opt-in | Separate 2024 verified profiles; never infer by name |
| Homebrew and item charges | Preserved in vault | User-configured triggers, stacking policy, attunement and equipment modifiers |
| Undo | One turn advance; character backups | Atomic undo for cast/effect/resource/use with event provenance |

## Automated 2014 SRD spells (explicit opt-in only)

| Spell | Mechanics | Activation / target | End conditions |
|---|---|---|
| Cure Wounds | `1d8 + spellcasting modifier`, +1d8 per slot above 1st; apply to self after roll | Action / self | Instantaneous |
| Healing Word | `1d4 + spellcasting modifier`, +1d4 per slot above 1st; apply to self after roll | Bonus action / self | Instantaneous |
| Shield of Faith | Derived AC +2; concentrate up to 100 combat rounds | Bonus action / self | Concentration breaks, expiry or manual end |
| Guidance | d4 once for an ability check; one charge | Action / self | Charge spent after throw, concentration ends, 10 rounds or manual end |
| Resistance | d4 once for a saving throw; one charge | Action / self | Charge spent after throw, concentration ends, 10 rounds or manual end |
| Bless | d4 on each self attack and save while active; sustained | Action / self (other targets manual) | Concentration ends, 10 rounds or manual end |

**Important limits:** Manual/DM-approved overrides remain authoritative. These are the 2014 SRD versions, not default behavior for 2024 D&D. Self-target support does not authorize automatic changes to an ally. Spell-specific targets and components still require table adjudication. Spellcasting modifier is inferred from an explicit class/ability source, or the player sets an override.

## Full reference coverage and review queue

Exactly **112 2014 SRD spell reference records** are currently bundled. Only the six profiles above are executable; all other spell effects remain *reference-only*. The list below is a complete inventory of the current **catalog**, not of all officially published D&D spells. Non-SRD, 2024, and homebrew spells are outside this inventory.

### Cantrips — 16 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Acid Splash | No | 1 action | Reference-only · manual resolution |
| Druidcraft | No | 1 action | Reference-only · manual resolution |
| Eldritch Blast | No | 1 action | Reference-only · manual resolution |
| Fire Bolt | No | 1 action | Reference-only · manual resolution |
| Guidance | Yes | 1 action | **Opt-in self automation** |
| Light | No | 1 action | Reference-only · manual resolution |
| Mage Hand | No | 1 action | Reference-only · manual resolution |
| Mending | No | 1 minute | Reference-only · manual resolution |
| Minor Illusion | No | 1 action | Reference-only · manual resolution |
| Prestidigitation | No | 1 action | Reference-only · manual resolution |
| Resistance | Yes | 1 action | **Opt-in self automation** |
| Sacred Flame | No | 1 action | Reference-only · manual resolution |
| Shocking Grasp | No | 1 action | Reference-only · manual resolution |
| Spare the Dying | No | 1 action | Reference-only · manual resolution |
| Thaumaturgy | No | 1 action | Reference-only · manual resolution |
| Vicious Mockery | No | 1 action | Reference-only · manual resolution |

### Level 1 — 39 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Alarm | No | 1 minute | Reference-only · manual resolution |
| Animal Friendship | No | 1 action | Reference-only · manual resolution |
| Bane | Yes | 1 action | Reference-only · manual resolution |
| Bless | Yes | 1 action | **Opt-in self automation** |
| Burning Hands | No | 1 action | Reference-only · manual resolution |
| Charm Person | No | 1 action | Reference-only · manual resolution |
| Command | No | 1 action | Reference-only · manual resolution |
| Comprehend Languages | No | 1 action | Reference-only · manual resolution |
| Create or Destroy Water | No | 1 action | Reference-only · manual resolution |
| Cure Wounds | No | 1 action | **Opt-in self automation** |
| Detect Evil and Good | Yes | 1 action | Reference-only · manual resolution |
| Detect Magic | Yes | 1 action | Reference-only · manual resolution |
| Detect Poison and Disease | Yes | 1 action | Reference-only · manual resolution |
| Disguise Self | No | 1 action | Reference-only · manual resolution |
| Entangle | Yes | 1 action | Reference-only · manual resolution |
| Expeditious Retreat | Yes | 1 bonus action | Reference-only · manual resolution |
| Faerie Fire | Yes | 1 action | Reference-only · manual resolution |
| Feather Fall | No | 1 reaction | Reference-only · manual resolution |
| Find Familiar | No | 1 hour | Reference-only · manual resolution |
| Fog Cloud | Yes | 1 action | Reference-only · manual resolution |
| Guiding Bolt | No | 1 action | Reference-only · manual resolution |
| Healing Word | No | 1 bonus action | **Opt-in self automation** |
| Hex | Yes | 1 bonus action | Reference-only · manual resolution |
| Hideous Laughter | Yes | 1 action | Reference-only · manual resolution |
| Hunter's Mark | Yes | 1 bonus action | Reference-only · manual resolution |
| Identify | No | 1 minute | Reference-only · manual resolution |
| Inflict Wounds | No | 1 action | Reference-only · manual resolution |
| Jump | No | 1 action | Reference-only · manual resolution |
| Longstrider | No | 1 action | Reference-only · manual resolution |
| Mage Armor | No | 1 action | Reference-only · manual resolution |
| Magic Missile | No | 1 action | Reference-only · manual resolution |
| Protection from Evil and Good | Yes | 1 action | Reference-only · manual resolution |
| Purify Food and Drink | No | 1 action | Reference-only · manual resolution |
| Sanctuary | No | 1 bonus action | Reference-only · manual resolution |
| Shield | No | 1 reaction | Reference-only · manual resolution |
| Shield of Faith | Yes | 1 bonus action | **Opt-in self automation** |
| Silent Image | Yes | 1 action | Reference-only · manual resolution |
| Sleep | No | 1 action | Reference-only · manual resolution |
| Thunderwave | No | 1 action | Reference-only · manual resolution |

### Level 2 — 28 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Acid Arrow | No | 1 action | Reference-only · manual resolution |
| Aid | No | 1 action | Reference-only · manual resolution |
| Alter Self | Yes | 1 action | Reference-only · manual resolution |
| Animal Messenger | No | 1 action | Reference-only · manual resolution |
| Arcane Lock | No | 1 action | Reference-only · manual resolution |
| Blur | Yes | 1 action | Reference-only · manual resolution |
| Darkness | Yes | 1 action | Reference-only · manual resolution |
| Darkvision | No | 1 action | Reference-only · manual resolution |
| Detect Thoughts | Yes | 1 action | Reference-only · manual resolution |
| Heat Metal | Yes | 1 action | Reference-only · manual resolution |
| Hold Person | Yes | 1 action | Reference-only · manual resolution |
| Invisibility | Yes | 1 action | Reference-only · manual resolution |
| Knock | No | 1 action | Reference-only · manual resolution |
| Lesser Restoration | No | 1 action | Reference-only · manual resolution |
| Levitate | Yes | 1 action | Reference-only · manual resolution |
| Locate Object | Yes | 1 action | Reference-only · manual resolution |
| Mirror Image | No | 1 action | Reference-only · manual resolution |
| Misty Step | No | 1 bonus action | Reference-only · manual resolution |
| Moonbeam | Yes | 1 action | Reference-only · manual resolution |
| Pass without Trace | Yes | 1 action | Reference-only · manual resolution |
| Prayer of Healing | No | 10 minutes | Reference-only · manual resolution |
| Scorching Ray | No | 1 action | Reference-only · manual resolution |
| See Invisibility | No | 1 action | Reference-only · manual resolution |
| Shatter | No | 1 action | Reference-only · manual resolution |
| Spider Climb | Yes | 1 action | Reference-only · manual resolution |
| Suggestion | Yes | 1 action | Reference-only · manual resolution |
| Web | Yes | 1 action | Reference-only · manual resolution |
| Zone of Truth | No | 1 action | Reference-only · manual resolution |

### Level 3 — 15 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Beacon of Hope | Yes | 1 action | Reference-only · manual resolution |
| Bestow Curse | Yes | 1 action | Reference-only · manual resolution |
| Counterspell | No | 1 reaction | Reference-only · manual resolution |
| Daylight | No | 1 action | Reference-only · manual resolution |
| Dispel Magic | No | 1 action | Reference-only · manual resolution |
| Fireball | No | 1 action | Reference-only · manual resolution |
| Fly | Yes | 1 action | Reference-only · manual resolution |
| Gaseous Form | Yes | 1 action | Reference-only · manual resolution |
| Haste | Yes | 1 action | Reference-only · manual resolution |
| Hypnotic Pattern | Yes | 1 action | Reference-only · manual resolution |
| Revivify | No | 1 action | Reference-only · manual resolution |
| Sending | No | 1 action | Reference-only · manual resolution |
| Spirit Guardians | Yes | 1 action | Reference-only · manual resolution |
| Tiny Hut | No | 1 minute | Reference-only · manual resolution |
| Water Breathing | No | 1 action | Reference-only · manual resolution |

### Level 4 — 6 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Banishment | Yes | 1 action | Reference-only · manual resolution |
| Death Ward | No | 1 action | Reference-only · manual resolution |
| Dimension Door | No | 1 action | Reference-only · manual resolution |
| Greater Invisibility | Yes | 1 action | Reference-only · manual resolution |
| Polymorph | Yes | 1 action | Reference-only · manual resolution |
| Stoneskin | Yes | 1 action | Reference-only · manual resolution |

### Level 5 — 1 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Hold Monster | Yes | 1 action | Reference-only · manual resolution |

### Level 6 — 2 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Mass Suggestion | No | 1 action | Reference-only · manual resolution |
| True Seeing | No | 1 action | Reference-only · manual resolution |

### Level 7 — 2 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Forcecage | No | 1 action | Reference-only · manual resolution |
| Teleport | No | 1 action | Reference-only · manual resolution |

### Level 8 — 1 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Glibness | No | 1 action | Reference-only · manual resolution |

### Level 9 — 2 references

| Spell | Concentration | Casting | Automation |
|---|---|---|---|
| Astral Projection | No | 1 hour | Reference-only · manual resolution |
| Foresight | No | 1 minute | Reference-only · manual resolution |

## Further implementation gates

1. Before adding a profile, check the exact edition, SRD provenance, allowed target category, action economy, components, material cost, concentration, upcasting and outcome semantics.
2. Compile it into the existing reference catalog and validate via the same planner. No spell-specific branches in `app.js`.
3. A failed plan, canceled confirmation or failed dice preparation must not spend resources or mark actions.
4. Ensure persistent effects do not modify the imported AC/ability scores. Removal must restore derived stats exactly.
5. Add one pure-model test, one browser interaction test and a persistence/reimport test for every new effect type.
6. Keep unverified imported/homebrew spells as narrative/manual entries, not guessed automations.

## Source and license

SRD 5.1 metadata and the project’s existing shortened summaries. See `NOTICE-SRD.md` for the prescribed CC BY 4.0 attribution. This feature inventory records which data is available; it is not a reproduction of the full rules.
