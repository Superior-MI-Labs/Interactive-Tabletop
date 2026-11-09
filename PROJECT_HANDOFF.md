# Interactive Tabletop — development handoff

> **Living project checkpoint.** Read this before planning the next patch. Update it after every meaningful code release and whenever priorities change. This is a practical continuity record, not a second architecture specification or a substitute for tests.

**Last verified application release:** `v0.51.0`  
**Release commit:** Verify v0.51.0 main SHA, qualification and Pages before claiming it live. Previous verified release: v0.50.0 `c658699` (Actions `42522797327`).  
**Handoff reviewed:** 2026-11-08  
**Project:** [Superior-MI-Labs/Interactive-Tabletop](https://github.com/Superior-MI-Labs/Interactive-Tabletop)  
**Live Pages:** https://superior-mi-labs.github.io/Interactive-Tabletop/  
**Current worktree:** v0.51.0 reconciles imported inventory by safe unique-name identity and reports old notes at risk in the PDF preview. Verify CI/Pages before marking it live.

## 1. Why this file exists / how to resume

This file answers five questions for a fresh contributor or coding agent: **What exists? What was last finished? Why was it built this way? What is still unsafe or absent? What should happen next?**

1. Confirm `git status --short`, `git log -1 --oneline`, and `cat VERSION`. If `main` or the release version has advanced, inspect the diff and **reconcile this checkpoint before coding**; never trust this snapshot over actual source.
2. Read `AGENTS.md` for invariant rules and qualification, `ARCHITECTURE.md` for system ownership, `RULESET_AUTOMATION_CONTRACT.md` for rule semantics, `DND_EFFECT_CAPABILITY_AUDIT.md` for automation boundaries, and `CHANGELOG.md` for prior releases. These files remain authoritative in their own domains.
3. Inspect actual functions, call sites, and relevant tests before proposing a patch. Verify the bug or behavior directly. Compare **extending the existing owner** with **introducing a separate subsystem** and justify any new state.
4. Use the *Next milestone* section as a hypothesis, not an instruction to implement all of it blindly. Record better discoveries and change the plan as evidence warrants.
5. After a qualified release, update this checkpoint's baseline, completed work, open risks, and next concrete task **in the same commit** as the release.

### Documentation roles — no duplication

| Document | Sole purpose |
| --- | --- |
| `PROJECT_HANDOFF.md` (this file) | Latest known state, design rationale, immediate priorities, outstanding risks, next-agent instructions |
| `AGENTS.md` | Binding engineering rules, ownership boundaries, pre-commit/CI gates |
| `AI_START_HERE.md` | Short, copy/paste onboarding prompt for future coding agents |
| `ARCHITECTURE.md` | Durable subsystem contracts and why they exist |
| `RULESET_AUTOMATION_CONTRACT.md` | Exact D&D/edition, event, resource and dice rules |
| `DND_EFFECT_CAPABILITY_AUDIT.md` | What is actually qualified for automation |
| `CHANGELOG.md` | Historical shipped changes, not a future task board |
| `README.md` | Public entry point, setup, features, limitations |

Author code in `web/`. `docs/` is **generated Pages output**, not a place for hand-authored notes; generated desktop ZIPs are also not source.

## 2. What was completed, and where we stopped

**Status at v0.51.0:** An early-alpha, local-first, browser and Python-based desktop D&D tabletop. It supports multi-character vaults, D&D Beyond fillable-PDF imports, interactive physical dice, typed combat/effect handling, explicit event-triggered ability eligibility, and qualified portions of the **2014** SRD. Unsupported or ambiguous rules remain manual/DM-adjudicated. No universal TTRPG engine or complete initiative scheduler is claimed.

Recent development sequence (consult `CHANGELOG.md` for full detail):

- **v0.28–v0.31:** One CI/browser qualification gate; shared action-economy and attack-grant model; staged reaction costs and character-owned dice.
- **v0.32–v0.37:** Explicit attack/save/damage evidence, event windows and expiry, correct reaction timing, target identity, consent-based save/damage linkage, and declarative event predicates. Event evidence is not guessed from PDF prose.
- **v0.38–v0.39:** Existing `pending_workflow` ledger extended for activate → resource cost → physical save → optional condition. Character switching, turn changes, stale dialogs, and interrupted dice cannot commit the wrong character's resources or outcomes.
- **v0.40:** Independent condition-source grants and DM-confirmed creature turn boundaries, without falsely assuming full initiative. Existing manual/imported conditions survive unrelated grant expiry.
- **v0.41:** Original **Mara Vale (Demo)**, a level-5 Fighter with Training Dummy, created only for genuinely new browser vaults; manual add/reset for others. Real imports never merge into demos by name.
- **v0.42:** Contextual, **state-derived** practice flow for Mara and read-only creature-turn overview. Practice controls route to normal action/dice handlers. Pointer priority fixed for controls obscured by resting dice.
- **v0.43:** Three-stage manual 2014 character creation (identity, scores/proficiencies, combat). Uses `CharacterImport.createManual` plus the existing vault; no inferred class features or second rules engine. New Node and Chromium tests cover validation, cancellation, vault isolation and narrow layouts.
- **v0.44:** Derived manual character setup with editable attacks, feature notes, equipment and optional spells.
- **v0.45:** Manual spell-slot and resource configuration routes through canonical owners with validation.
- **v0.46:** Casting ability selection and a bounded fixed modifier are available on spell records. Unambiguous PDF source changes preserve configuration; mixed sources fail closed.
- **v0.47:** Authored `manual-spell-*` / legacy `custom-*` records survive reimport by stable ID even if a PDF record has the same name/source/level. PDF matching excludes authored rows; manual-only deletion is confirmed and identity-guarded.
- **v0.48:** Read-only PDF spellbook preview shares imported-spell identity decisions with vault reconciliation. It lists added/removed imported spells, ambiguity warnings and safely matched source changes before the player confirms.
- **v0.49:** Offensive actions require a real selected creature; Auto applies typed weapon damage after a verified hit only if the target's defenses have been explicitly approved. The roll group retains original target identity, existing Undo stays intact and other modes continue through review.
- **v0.50:** The original fast tooltip owns hover/focus cards for status icons, hearts, action controls, and effects. Active conditions display once in Effects; their manual picker is nested there. Condition descriptions live in a read-only, 2014-edition-checked SRD catalog and do not introduce gameplay automation.
- **v0.51:** Imported equipment notes carry forward only across names unique on both PDF versions; duplicates never inherit guessed annotations. The identical vault matcher drives a read-only preview with notes at risk, while player-authored items remain independent.

v0.50.0 passed GitHub qualification and Pages deployment at commit `c658699` (Actions run `42522797327`). Check v0.51 independently before claiming it deployed.

## 3. Architecture choices and rationale

**Decision A — character vault is the single persisted gameplay truth.** `web/vault-store.js` owns character storage, migration and reimport reconciliation; `web/dnd-action.js` owns validated combat plans, transactional cost/effect mutations, event evidence, condition sources and workflows; `web/app.js` owns views, user confirmations and transient physical dice. **Why:** a second combat ledger or ad-hoc UI resource counter would drift from imported data, undo, vault switching and reloading.

**Decision B — automation is explicit and edition-qualified.** The readonly `web/dnd-2014-reference.json` catalog plus validated user configuration determine supported effects. **Why:** class/ability text, homebrew and imported descriptions are not machine-verifiable rules. Wrong automation is more damaging than a clear DM-managed step. The 2024 edition and other TTRPGs are not silently treated as 2014.

**Decision C — gameplay is event- and transaction-driven, not button-specific.** Attack type, source/target IDs, roll identity, phase and event expiration are checked when an action actually commits. Optional costs and conditions use the same plan/confirm/commit and workflow ledger. **Why:** Warding Flare, Deflect Missiles, Stunning Strike and future homebrew share trigger timing but not identical effects. Adding per-ability handlers would recreate the same timing and rollback defects.

**Decision D — canceled input is not a committed game action.** Right-click/Escape cancel prepared dice; dice launch and settlement have distinct ownership. A committed reaction or Ki cost is not refunded just because its next stage was interrupted. **Why:** consistency and prevention of double spending, late roll settlement and cross-character mutations.

**Decision E — conditions have independent provenance.** A visible condition can have several approved source grants with distinct timing. Other creatures' turns require explicit DM confirmation. **Why:** one status flag or one inferred initiative clock would incorrectly delete overlapping effects. Do not build an initiative scheduler until all required turn/interrupt semantics are specified and tested.

**Decision F — onboarding is normal gameplay, not a tutorial engine.** `web/demo-character.js` creates an ordinary editable vault character. The practice UI derives its prompt from the current character, target, encounter and dice state; nothing persists a separate tutorial progression. **Why:** one interaction path exercises the real engine and avoids a second source of truth.

### Alternatives considered but not adopted

- A new **tutorial state machine**: duplicates action/dice progress; instead extend state-derived guidance.
- A global **event bus** or per-class execution system: duplicates combat provenance; instead extend the existing planner/`pending_workflow` contract.
- Automated **initiative** solely to expire a few effects: insufficient source/target and interrupt evidence; retain DM-confirmed creature turns.
- Seed a demo in **every empty vault**: would resurrect deleted data; seed only brand-new static storage, keep manual opt-in for everyone else.

These are engineering judgments based on current contracts, not eternal prohibitions. Revisit only with a concrete failing scenario and a simpler verified design.

## 4. Known limits, risks and things not to claim

- The site is **early alpha**; it does not automatically execute every D&D ability or faithfully adjudicate every homebrew rule. Unqualified cases require DM/player confirmation.
- **Initiative order is not implemented.** The creature roster displays independently tracked turns; clicking End turn confirms one creature boundary only. Reactions across every creature and arbitrary interrupts are not globally scheduled.
- **Condition-source lifecycle** needs special care around overlapping sources, legacy/manual flags, creature removal, encounter resets, concentration, undo and reload. A visually correct status chip is not proof of correct game state.
- **Physical-dice lifecycle** is asynchronous. Test cancellation, ownership, character switching, roll duplication, modal confirmation, stale outcomes, and input hit testing whenever editing the relevant paths.
- Browser vault data is local IndexedDB, not cloud-synced. PDF.js may require CDN access; PDF input coverage is limited and imports are conservative. Back up character JSON before changing data migrations. Windows launcher runtime testing remains unverified.
- Dice physics is approximate, not a certified fairness simulation. The sample Fighter is demonstration data, not a comprehensive rules fixture.
- A GitHub push is **not** equivalent to a live deployment. Check Actions qualification and Pages deployment separately; do not guess run IDs or report success prematurely.

## 5. Suggested next milestone — die pointer ownership and accurate roll totals

**Goal:** A resting die should never take a click intended for a visible gameplay button. Settled results must distinguish physical faces from modifier-adjusted totals and bonus dice.

**Audit first:** Study the existing stage pointer hit-testing, click/pointer ownership, dice ready/held state, overlay controls, and existing roll-group total/bonus contract. Reproduce controls overlapping dice on desktop/mobile before modifying renderer behavior.

**Two approaches:** (1) Give actual visible controls priority through the existing pointer owner, then render results from the settled roll-group data; (2) add ad hoc CSS hit-test exclusions, new z-index layers or a second total calculator in the canvas. Prefer (1) with regression tests, no shims.

**Acceptance criteria:** Attack, damage, target and save controls activate reliably with resting dice underneath; dice pickup still works on unobstructed tabletop; natural die faces and final roll totals remain clearly distinguished across multiple dice groups. Preserve combat target-safety, damage Undo and edition guards.

**Later:** Extend read-only licensed SRD and Visual Atlas imagery for equipment cards without changing imported facts or homebrew records. Isometric encounter view should use existing encounter IDs and combat state.


## 6. Execution and publication checklist

```bash
git status --short
git log -1 --oneline
cat VERSION
python3 -m pip install -r tools/requirements-qa.txt
# If Chromium is absent: python3 -m playwright install chromium
bash tools/qualify.sh
python3 tools/build_release.py
python3 tools/build_site.py
```

- Inspect tests alongside implementation. The CI owner is `.github/workflows/pages.yml`. Source is `web/`, with `docs/` generated for Pages. Do not hand-edit generated JS.
- Update/rebase only against the current branch head; never force-push over another agent's work.
- Run meaningful regression suites before a release. If local Chromium batches timeout, run missing tests separately and state what actually passed.
- After push, verify **exact changed files**, Actions qualification and Pages success. Provide the commit URL, run URL and actual result; keep local and remote status distinct.

## 7. Handoff update protocol / next-agent note

Update this file **at the end of each qualified feature batch** (same commit as the change):

1. Change **Last verified application release**, commit SHA if known, review date, and *where stopped*. Do not pretend a future commit hash is known at authoring time; a release SHA may be filled by a subsequent docs-only checkpoint if necessary.
2. Summarize new behavior, relevant modules and regression tests in **What was completed**. Move detailed history to `CHANGELOG.md`; don't let this file turn into another full changelog.
3. Capture each material **decision and rationale**: chosen approach, rejected alternative, safety invariant, observed tradeoff; no unsupported guesses about why prior authors did something.
4. Record real **open bugs/risks** separately from wishlist ideas. Give repro evidence and test names where possible.
5. Replace **Next milestone** with one actionable, bounded plan, alternatives considered and acceptance criteria. Leave enough information for a new agent with no chat history.
6. Keep `AGENTS.md` and this file discoverable from `README.md`. The small `tests/test_handoff_contract.py` gate verifies the version and those links, preventing silent drift.

**v0.48 checkpoint:** `matchImportedSpells` is the sole matching decision used by `Vault.reconcile` and `Vault.spellReimportPreview`; the latter is pure and reports added/removed/ambiguous imported spells, safe source changes, and separately preserved manual spell count. `Vault.importSummary` formats the bounded preview and the existing confirmation UI displays it as escaped, scrollable text. Cancel has no gameplay mutation. Regression owners: `tests/test_spell_reimport.js` and `tests/browser_vault_smoke.py`. Next audit: duplicate inventory identity and manual item preservation, not a separate importer.

**v0.49 checkpoint:** Engine-level `requireOffensiveTarget`, `canAutoEvaluateAttack`, `setTargetAutoDamage`, and `canAutoApplyAttackDamage` are the sole qualification contracts. The UI requires an opponent before offensive dice or costs; only verified-hit, typed weapon/unarmed damage with source-qualified damage type and explicit target permission auto-commits through the same planner and Undo. Pending review offers typed selection and one-step Guided/Auto application, while Manual keeps a dialog. Tests: `tests/test_combat_target_safety.js`, `tests/browser_target_smoke.py`, `tests/browser_attack_permissions_smoke.py`, and `tests/browser_economy_smoke.py`. Next: unify hover/status presentation.

**v0.50 checkpoint:** `web/app.js` has one shared `hudTip` renderer for immediate native-title/data-tip quick hints and optional detail/source cards. Active `character.conditions` use `conditionIcon()` in `buffBar()`; `conditionRail()` is now only the panelState-owned picker. All effects, independent grants and condition toggles stay on the existing model. `ReferenceCatalog.match('condition', ...)` looks up 15 read-only 2014 SRD summaries; revised-edition users never see them as qualified rules. Test owners: `tests/test_reference_catalog.js`, the extended `tests/browser_effects_smoke.py`, and existing condition-source browser tests. Next: inventory duplicate identity/reimport audit; avoid a second import engine.

**v0.51 checkpoint:** `matchImportedInventory` in `web/vault-store.js` is the only item matching decision used by reconciliation and preview; normalized names must be unique in both old/new PDF rows. Positional IDs, quantity, weight and order cannot disambiguate same-name items. Import confirmation warns when previous annotated rows won't safely transfer; custom item IDs survive independently. Regression owners: `tests/test_inventory_reimport.js` and extended `tests/browser_vault_smoke.py`. Next: pointer ownership and dice totals, not a second import engine.
