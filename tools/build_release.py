"""Deterministic desktop ZIP, excluding web publication and private QA artifacts."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT=Path(__file__).resolve().parents[1]
VERSION=(ROOT/'VERSION').read_text().strip()
NAME=f'SkyBlueEyes-Tabletop-v{VERSION}'
DEST=ROOT/'docs'/'downloads'/f'{NAME}.zip'
FILES=['VERSION','INSTALL.sh','README.md','CHANGELOG.md','ARCHITECTURE.md','RULES_REFERENCE_DESIGN.md','RULESET_AUTOMATION_CONTRACT.md','NOTICE-SRD.md','DND_EFFECT_CAPABILITY_AUDIT.md','LICENSE','main.py','desktop.py','RUN-LINUX.sh','RUN-WINDOWS.bat','RUN-DESKTOP-LINUX.sh','RUN-DESKTOP-WINDOWS.bat']
folders=['web','vendor']
# Ship the exact source tests CI discovers; never hand-maintain test filenames.
test_paths=sorted((ROOT/'tests').glob('test_*.js'))+sorted((ROOT/'tests').glob('test_*.py'))
paths=[ROOT/f for f in FILES]
for folder in folders:paths.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and not p.name.endswith('.pyc'))
paths.extend(test_paths)
DEST.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(DEST,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(paths):
        assert p.is_file(),p
        z.write(p,f'{NAME}/{p.relative_to(ROOT).as_posix()}')
print('Built',DEST,DEST.stat().st_size,'bytes',len(paths),'files')
