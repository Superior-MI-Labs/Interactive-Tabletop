"""Guard deployment metadata and referenced assets against drift."""
import re
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class ReleaseContract(unittest.TestCase):
    def test_release_version(self):
        version=(ROOT/'VERSION').read_text().strip()
        self.assertRegex(version,r'^0\.\d+\.\d+$')
        self.assertIn('v'+version,(ROOT/'INSTALL.sh').read_text())
        builder=ROOT/'tools/build_release.py'
        # Desktop ZIPs contain runtime files and tests, but not source build tools.
        if builder.is_file():
            self.assertIn("VERSION=(ROOT/'VERSION').read_text().strip()",builder.read_text())
        else:
            self.assertTrue((ROOT/'main.py').is_file())
            self.assertTrue((ROOT/'web/dnd-slots.js').is_file())
        self.assertIn('v'+version,(ROOT/'web/service-worker.js').read_text())
        self.assertIn('v'+version,(ROOT/'web/index.html').read_text())
    def test_script_references_and_order(self):
        html=(ROOT/'web/index.html').read_text()
        files=re.findall(r'<script[^>]*\bsrc=["\']\./([^"\']+)',html)
        self.assertTrue(files)
        for file in files:self.assertTrue((ROOT/'web'/file).is_file(),file)
        self.assertLess(files.index('dnd-slots.js'),files.index('dnd-action.js'))
        self.assertLess(files.index('dnd-action.js'),files.index('app.js'))
    def test_offline_asset_manifest(self):
        js=(ROOT/'web/service-worker.js').read_text()
        match=re.search(r'const ASSETS=\[(.*?)\];',js,re.S)
        self.assertIsNotNone(match)
        for asset in re.findall(r'["\']\./([^"\']+)["\']',match.group(1)):
            self.assertTrue((ROOT/'web'/asset).is_file(),asset)
if __name__=='__main__':unittest.main()
