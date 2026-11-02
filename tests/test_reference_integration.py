import json,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class TestReferenceIntegration(unittest.TestCase):
 def test_catalog_license_and_resources(self):
  doc=json.loads((ROOT/'web'/'dnd-2014-reference.json').read_text())
  src=doc['source'];self.assertEqual(src['id'],'srd-5.1')
  self.assertEqual(src['license'],'CC-BY-4.0')
  self.assertIn('https://creativecommons.org/licenses/by/4.0/legalcode',src['attribution'])
  self.assertIn(src['attribution'],(ROOT/'NOTICE-SRD.md').read_text())
  self.assertGreaterEqual(len(doc['spells']),30)
  self.assertGreaterEqual(len(doc['equipment']),100)
  self.assertEqual(len({item['id'] for typ in ('spells','equipment') for item in doc[typ]}),len(doc['spells'])+len(doc['equipment']))
  for typ,kind in [('spells','spell'),('equipment','equipment')]:
   for row in doc[typ]:
    self.assertEqual(row['source_id'],'srd-5.1');self.assertEqual(row['edition'],'dnd-2014');self.assertEqual(row['kind'],kind)
 def test_ui_contract(self):
  html=(ROOT/'web'/'index.html').read_text();js=(ROOT/'web'/'app.js').read_text();sw=(ROOT/'web'/'service-worker.js').read_text()
  for asset in ('reference-catalog.js','dnd-2014-reference.json'):
   self.assertIn(asset,sw)
  self.assertIn('reference-catalog.js',html)
  self.assertIn('id="about-open"',html)
  self.assertIn('id="reference-layer"',html)
  self.assertIn("['reference','Reference']",js)
  self.assertIn('function showAbout()',js)
  self.assertIn("sourceBadge(References?.match('equipment'",js)
  self.assertIn("sourceBadge(References?.match('spell'",js)
if __name__=='__main__':unittest.main()
