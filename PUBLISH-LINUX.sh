#!/usr/bin/env bash
# Publish thechecked Interactive Tabletop public-alpha package to its GitHub repo.
set -Eeuo pipefail

REPO="Superior-MI-Labs/Interactive-Tabletop"
REMOTE="https://github.com/${REPO}.git"
ZIP="${1:-}"
if [[ -z "$ZIP" ]]; then
  for candidate in"$HOME/Downloads/Interactive-Tabletop-Public-Alpha.zip" "$HOME/Downloads/Phoenix-Tabletop-GitHub-Pages-Alpha.zip"; do
    if [[ -f "$candidate" ]]; then ZIP="$candidate"; break; fi
  done
fi
TMP="$(mktemp -d)"
trap 'rm -rf -- "$TMP"'EXIT
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || fail "git is required. Install git and authenticate with GitHub first."
command -v unzip >/dev/null || fail "unzip is required."
command -v python3 >/dev/null|| fail "Python 3 is required for release checks."
command -v node >/dev/null || fail "Node.js is required for JavaScript checks."
[[ -f "$ZIP" ]] || fail "Could not find $ZIP. Put the ZIP in Downloads or pass its path as an argument."

printf'Checking public-alpha archive...\n'
unzip -tqq "$ZIP" || fail "ZIP integrity test failed."
# Reject absolute or traversing archive paths before extraction.
if unzip -Z1 "$ZIP" | grep -Eq '(^/|(^|/)\.\.(/|$)|\\)'; then fail "Unsafe ZIP pathsfound."; fi
unzip -q "$ZIP" -d "$TMP/source"
ROOT="$TMP/source"
[[ -f "$ROOT/docs/index.html" && -f "$ROOT/docs/app.js" && -f "$ROOT/README.md" ]] || fail "Not a complete Interactive Tabletop alpha archive."
[[ -f"$ROOT/docs/downloads/SkyBlueEyes-Tabletop-v0.10.0.zip" ]] || fail "Desktop download is missing."
if find "$ROOT" -type f \( -iname '*.pdf' -o -name 'character.json' -o -name '_private_fields_*' \) | grep -q .; then fail "Private charactercontent detected. Refusing publication."; fi

printf 'Running release checks...\n'
(cd "$ROOT" && python3 -I -S -m unittest discover -s tests -p 'test_*.py' -q)
(cd "$ROOT" && node tests/test_import_model.js && nodetests/test_dice_physics.js)
for js in "$ROOT"/docs/*.js; do node --check "$js"; done

printf 'Cloning %s...\n' "$REPO"
GIT_TERMINAL_PROMPT=1 git clone --quiet "$REMOTE" "$TMP/repo" || fail "Cannot clone GitHub repository. Check networkaccess and permissions."
cd "$TMP/repo"
[[ "$(git branch --show-current)" == "main" ]] || fail "Expected main branch. No changes published."
[[ -z "$(git status --porcelain)" ]] || fail "Remote checkout was unexpectedly dirty."

# Do notoverwrite another project's existing application sources.
for protected in docs/index.html web/app.js main.py; do
  if [[ -e "$protected" ]] && ! cmp -s "$protected" "$ROOT/$protected"; then
    fail "Existing '$protected' differs from thisalpha. Reconcile instead of replacing blindly."
  fi
done

# Preserve files already in the repository; overlay only our own package paths.
cp -a "$ROOT"/. .
# The repository's public README should match this release.
git add -A
if git diff--cached --quiet; then
  printf 'All release files are already present on main.\n'
else
  git commit -m "Publish Interactive Tabletop v0.10.0 public alpha"
  git push origin main || fail "GitHub rejected the push. No force pushattempted."
fi
printf '\nRepository: https://github.com/%s\n' "$REPO"
printf 'Pages URL: https://superior-mi-labs.github.io/Interactive-Tabletop/\n'
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  if ! gh api"repos/$REPO/pages" >/dev/null 2>&1; then
    gh api -X POST "repos/$REPO/pages" -f 'source[branch]=main' -f 'source[path]=/docs' >/dev/null 2>&1 || true
  fi
fi
printf 'Verify GitHub Settings > Pages: Deploy from a branch, main, /docs.\n'
printf'Important: the public Pages URL is not verified live by this script.\n'
