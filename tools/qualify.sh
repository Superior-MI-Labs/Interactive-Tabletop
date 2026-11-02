#!/usr/bin/env bash
# Source of truth for automated qualification before publication.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -I -S -m unittest discover -s tests -p 'test_*.py' -v
for file in web/*.js; do node --check "$file"; done
for file in tests/test_*.js; do node "$file"; done
for file in tests/browser_*.py; do python3 "$file"; done
