#!/usr/bin/env bash
# Source of truth for automated qualification before publication.
set -euo pipefail
cd "$(dirname "$0")/.."

mode=${1:---full}
if (( $# > 1 )) || [[ "$mode" != --full && "$mode" != --fast ]]; then
  echo 'Usage: bash tools/qualify.sh [--full|--fast]' >&2
  exit 2
fi

run() {
  printf '\n>>> %s\n' "$*"
  "$@"
}

run python3 tools/build_physics.py
run python3 -I -S -m unittest discover -s tests -p 'test_*.py' -v
for file in web/*.js; do run node --check "$file"; done
for file in tests/test_*.js; do run node "$file"; done

if [[ "$mode" == --fast ]]; then
  echo 'FAST PASS: Python and JavaScript only; browser qualification NOT RUN. Not release-qualified.'
  exit 0
fi

for file in tests/browser_*.py; do
  [[ "$file" == tests/browser_support.py ]] && continue
  run python3 "$file"
done
echo 'FULL PASS: Python, JavaScript and browser qualification.'
