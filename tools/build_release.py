"""Deterministic desktop ZIP, excluding web publication and private QA artifacts."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
ROOT=Path(__file__).resolve().parents[1]
VERSION='0.18.0'
NAME=f'SkyBlueEyes-Tabletop-v{VERSION}'
DEST=ROOT/'docs'/'downloads'/f'{NAME}.zip'
FILES=['INSTALL.sh','README.md','CHANGELOG.md','ARCHITECTURE.md','RULES_REFERENCE_DESIGN.md','NOTICE-SRD.md','LICENSE','main.py','desktop.py','RUN-LINUX.sh','RUN-WINDOWS.bat','RUN-DESKTOP-LINUX.sh','RUN-DESKTOP-WINDOWS.bat']
folders=['web','vendor']
tests=['test_core.py','test_dice_physics.js','test_dice_interaction.js','test_import_model.js','test_layout_contract.py','test_pdf_action_import.py','test_vault.js','test_vault_server.py','test_dnd_action.js','test_spell_actions.js','test_combat_state.js','test_pwa.js','test_reference_catalog.js','test_reference_comparison.js','test_reference_integration.py']
paths=[ROOT/f for f in FILES]
for folder in folders:paths.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and not p.name.endswith('.pyc'))
paths.extend(ROOT/'tests'/name for name in tests)
DEST.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(DEST,'w',ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(paths):
        assert p.is_file(),p
        z.write(p,f'{NAME}/{p.relative_to(ROOT).as_posix()}')
print('Built',DEST,DEST.stat().st_size,'bytes',len(paths),'files')
