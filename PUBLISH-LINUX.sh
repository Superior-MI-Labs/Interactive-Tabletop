#!/usr/bin/env bash
set -Eeuo pipefail
REPO="Superior-MI-Labs/Interactive-Tabletop"
ZIP=""
if [[ $# -gt 0 ]]; then ZIP="$1"; else
  for candidate in "$HOME/Downloads/Interactive-Tabletop-Public-Alpha.zip" "$HOME/Downloads/Phoenix-Tabletop-GitHub-Pages-Alpha.zip"; do
    if [[ -f "$candidate" ]]; then ZIP="$candidate"; break; fi
  done
fi
fail(){ printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -n "$ZIP" && -f "$ZIP" ]] || fail "Download the public alpha ZIP to ~/Downloads or pass its path."
for dep in git unzip python3 node; do command -v "$dep" >/dev/null || fail "Missing $dep"; done
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"' EXIT
unzip -tqq "$ZIP" || fail "ZIP integrity check failed"
if unzip -Z1 "$ZIP" | grep -Eq '(^/|(^|/)\.\.(/|$)|\\)'; then fail "Unsafe ZIP paths"; fi
unzip -q "$ZIP" -d "$TMP/source"
ROOT="$TMP/source"
[[ -f "$ROOT/docs/index.html" && -f "$ROOT/docs/app.js" && -f "$ROOT/README.md" ]] || fail "Not the full public-alpha package"
[[ -f "$ROOT/docs/downloads/SkyBlueEyes-Tabletop-v0.10.0.zip" ]] || fail "Desktop download missing"
if find "$ROOT" -type f \( -iname '*.pdf' -o -name 'character.json' -o -name '_private_fields_*' \) | grep -q .; then
  fail "Private character content found. Refusing publication."
fi
printf 'Running release tests...\n'
(cd "$ROOT" && python3 -I -S -m unittest discover -s tests -p 'test_*.py' -q)
(cd "$ROOT" && node tests/test_import_model.js && node tests/test_dice_physics.js)
for js in "$ROOT"/docs/*.js; do node --check "$js"; done
git clone --quiet "https://github.com/$REPO.git" "$TMP/repo" || fail "GitHub clone failed; check authentication"
cd "$TMP/repo"
[[ "$(git branch --show-current)" == "main" ]] || fail "Expected main branch"
[[ -z "$(git status --porcelain)" ]] || fail "Checkout was unexpectedly dirty"
for p in docs/index.html web/app.js main.py; do
  if [[ -e "$p" ]] && ! cmp -s "$p" "$ROOT/$p"; then
    fail "Existing $p differs; reconcile before publishing"
  fi
done
cp -a "$ROOT"/. .
git add -A
if git diff --cached --quiet; then
  echo "Release already present."
else
  git commit -m "Publish Interactive Tabletop v0.10.0 public alpha"
  git push origin main || fail "Push rejected; no force push attempted"
fi
echo "Pushed: https://github.com/$REPO"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  if ! gh api "repos/$REPO/pages" >/dev/null 2>&1; then
    gh api -X POST "repos/$REPO/pages" -f 'source[branch]=main' -f 'source[path]=/docs' >/dev/null 2>&1 || true
  fi
fi
echo "Check Settings > Pages: Deploy from a branch, main, /docs"
echo "Expected URL once deployed: https://superior-mi-labs.github.io/Interactive-Tabletop/"
