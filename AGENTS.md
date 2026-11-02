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

```bash
python3 -I -S -m unittest discover -s tests -p 'test_*.py' -v
for f in web/*.js; do node --check "$f" || exit; done
for test in tests/test_*.js; do node "$test" || exit; done
# With Playwright Python and system Chromium installed:
for smoke in tests/browser_*.py; do python3 "$smoke" || exit; done
python3 tools/build_release.py && python3 tools/build_site.py
```

GitHub Actions currently gates the Python/Node tests and the Pages build; Chromium smoke tests are additional local release qualifications, **not** automatically run in CI. Record explicitly which were run. Update `VERSION`, launcher/site version references, `CHANGELOG.md`, and architecture/contracts together. Push only after qualification and verify the pushed GitHub Actions checks and Pages status. Do not claim deploy success until the workflow confirms it.
