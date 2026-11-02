"""Recreate generated GitHub Pages docs/ from the canonical web/ assets."""
from pathlib import Path
import shutil
root=Path(__file__).resolve().parents[1]
web=root/'web';docs=root/'docs'
zipfile=docs/'downloads'/'SkyBlueEyes-Tabletop-v0.10.0.zip'
archive=zipfile.read_bytes() if zipfile.exists() else None
if docs.exists():shutil.rmtree(docs)
shutil.copytree(web,docs,ignore=shutil.ignore_patterns('starter.json','portrait.jpg'))
html=docs/'index.html';text=html.read_text()
text=text.replace('<script src="./character-import.js" defer></script>', '<script>window.__STATIC_TABLETOP__ = true;</script>\n  <script src="./character-import.js" defer></script>')
text=text.replace('</head>','<meta name="description" content="Phoenix Tabletop — early alpha. Import a D&D Beyond PDF and play with an interactive sheet and dice.">\n</head>')
text=text.replace('<div class="top-actions">','<div class="top-actions"><a class="button subtle" href="./downloads/SkyBlueEyes-Tabletop-v0.10.0.zip" download>Download desktop ZIP</a>')
html.write_text(text)
(docs/'.nojekyll').write_text('')
if archive:
 zipfile.parent.mkdir(parents=True,exist_ok=True);zipfile.write_bytes(archive)
