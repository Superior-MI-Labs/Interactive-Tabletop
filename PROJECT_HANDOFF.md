# Interactive Tabletop — development handoff

> **Living project checkpoint.** Read this before planning the next patch. Update it after every meaningful code release and whenever priorities change. This is a practical continuity record, not a second architecture specification or a substitute for tests.

**Last verified application release:** `v0.43.0`  
**Release commit:** This checkpoint is part of the v0.43.0 release commit on `main`; check `git log -1 --oneline` for the exact SHA.  
**Handoff reviewed:** 2026-11-08  
**Project:** [Superior-MI-Labs/Interactive-Tabletop](https://github.com/Superior-MI-Labs/Interactive-Tabletop)  
**Live Pages:** https://superior-mi-labs.github.io/Interactive-Tabletop/  
**Current worktree:** The v0.43.0 manual character builder is locally qualified; check the corresponding GitHub Actions qualification and deployment before describing it as live.

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
| `ARCHITECTURE.md` | Durable subsystem contracts and why they exist |
| `RULESET_AUTOMATION_CONTRACT.md` | Exact D&D/edition, event, resource and dice rules |
| `DND_EFFECT_CAPABILITY_AUDIT.md` | What is actually qualified for automation |
| `CHANGELOG.md` | Historical shipped changes, not a future task board |
| `README.md` | Public entry point, setup, features, limitations |

Author code in `web/`. `docs/` is **generated Pages output**, not a place for hand-authored notes; generated desktop ZIPs are also not source.

## 2. What was completed, and where we stopped

**Status at v0.43.0:** An early-alpha, local-first, browser and Python-based desktop D&D tabletop. It supports multi-character vaults, D&D Beyond fillable-PDF imports, interactive physical dice, typed combat/effect handling, explicit event-triggered ability eligibility, and qualified portions of the **2014** SRD. Unsupported or ambiguous rules remain manual/DM-adjudicated. No universal TTRPG engine or complete initiative scheduler is claimed.

Recent development sequence (consult `CHANGELOG.md` for full detail):

- **v0.28–v0.31:** One CI/browser qualification gate; shared action-economy and attack-grant model; staged reaction costs and character-owned dice.
- **v0.32–v0.37:** Explicit attack/save/damage evidence, event windows and expiry, correct reaction timing, target identity, consent-based save/damage linkage, and declarative event predicates. Event evidence is not guessed from PDF prose.
- **v0.38–v0.39:** Existing `pending_workflow` ledger extended for activate → resource cost → physical save → optional condition. Character switching, turn changes, stale dialogs, and interrupted dice cannot commit the wrong character's resources or outcomes.
- **v0.40:** Independent condition-source grants and DM-confirmed creature turn boundaries, without falsely assuming full initiative. Existing manual/imported conditions survive unrelated grant expiry.
- **v0.41:** Original **Mara Vale (Demo)**, a level-5 Fighter with Training Dummy, created only for genuinely new browser vaults; manual add/reset for others. Real imports never merge into demos by name.
- **v0.42:** Contextual, **state-derived** practice flow for Mara and read-only creature-turn overview. Practice controls route to normal action/dice handlers. Pointer priority fixed for controls obscured by resting dice.
- **v0.43:** Three-stage manual 2014 character creation (identity, scores/proficiencies, combat). Uses `CharacterImport.createManual` plus the existing vault; no inferred class features or second rules engine. New Node and Chromium tests cover validation, cancellation, vault isolation and narrow layouts. **This is the latest functional patch.**

The v0.42 release was verified by GitHub qualification and Pages deployment. v0.43 passed the local gate (19 Python tests, the JavaScript suite and 30 Chromium browser scenarios); independently check GitHub CI and deployment for the new release. Recheck live CI on any later commit rather than treating old green runs as evidence for new code.

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

## 5. Suggested next milestone — verify before implementing

**Goal:** Make newly created manual sheets genuinely playable without guessing class, species or spell rules.

**Inspect before coding:** Use a brand-new manually created character, a filled PDF import, and the Mara demo to compare editing and first-session discoverability. Test Auto/Guided/Manual, resource-free attacks, modifiers, encounter setup, cross-character selection, and mobile layouts. Verify existing feature/spell editing capabilities before proposing new forms.

**Approaches to compare:** (1) improve existing sheet editing and reference-assisted **explicit** user configuration versus (2) introduce a comprehensive class/level progression engine. Prefer (1) until the required edition-specific class, spell and species rules are verified and the additional state is justified.

**Candidate next batch:** show a focused post-creation checklist for DM-reviewed features, equipment, spells and first combat session using **derived** character state, with clear editing routes and no stored tutorial progress. Address the most consequential missing existing UI actions before adding new modules. If choosing to automate a class feature, require an explicit, qualified 2014 profile and regression tests.

**Release acceptance:** no change to legacy vaults or demo seeding; no class/trait mechanics inferred from names; validation of generated character schema; cancellation and failed saves do not leave ghost characters; real Node and Chromium regressions; `bash tools/qualify.sh` and GitHub CI green; update `VERSION`, `CHANGELOG.md`, `ARCHITECTURE.md` and this handoff in the same change.

**Deferred:** complete automated character leveling and feat/trait selection, 2024 or Pathfinder creation, arbitrary homebrew parsing, multiplayer or a separate tutorial engine.

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

**Coding-agent instruction audit (2026-11-07):** Added [`AI_START_HERE.md`](AI_START_HERE.md), a one-line-customizable coding prompt. Consolidated `AGENTS.md` into version-neutral rules and linked detailed system contracts instead of accumulating versioned instructions. Updated `tests/test_handoff_contract.py` to check the starter, file links and document size. This was **documentation/process only**, not a new application version; the v0.42.0 implementation checkpoint and next gameplay milestone are unchanged.

**Checkpoint note (2026-11-07):** Documentation/process update only. No code behavior or release version changed. Last completed application work remains v0.42.0 (Mara demo guided practice and independent creature-turn overview). Next person should inspect current production behavior before implementing the candidate navigation/onboarding patch.

**v0.43 release note:** The manual-creation form is transient UI state. Its committed output is a character-v1 document via the existing vault. No separate creator database, tutorial progress or automated class feature inference was introduced. A failed storage write rolls back the draft in memory. The next agent should inspect the delivered browser behavior before expanding it.
