"""Prevent qualification paths from drifting into separate release gates."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class QualificationContract(unittest.TestCase):
    def test_one_workflow_gates_deploy(self):
        flows = list((ROOT / '.github/workflows').glob('*.yml'))
        self.assertEqual([p.name for p in flows], ['pages.yml'])
        workflow = flows[0].read_text()
        for phrase in ('pull_request:', 'needs: qualify', "github.ref == 'refs/heads/main'",
                       'TABLETOP_CHROMIUM: managed', 'bash tools/qualify.sh',
                       'python -m playwright install --with-deps chromium'):
            self.assertIn(phrase, workflow)
        self.assertIn('bash tools/qualify.sh', (ROOT/'PUBLISH-LINUX.sh').read_text())

    def test_browser_qualification_is_complete_and_portable(self):
        runner = (ROOT/'tools/qualify.sh').read_text()
        self.assertIn('tests/browser_*.py', runner)
        self.assertIn('tests/test_*.js', runner)
        self.assertIn("discover -s tests -p 'test_*.py'", runner)
        browser_tests = sorted((ROOT/'tests').glob('browser_*_smoke.py'))
        self.assertEqual(len(browser_tests), 23)
        for test in browser_tests:
            content = test.read_text()
            self.assertIn('from browser_support import launch_chromium', content, test.name)
            self.assertIn('launch_chromium(', content, test.name)
            self.assertNotIn('/usr/bin/chromium', content, test.name)
            self.assertNotIn('/mnt/data/', content, test.name)
            self.assertNotIn('page.screenshot(', content, test.name)


if __name__ == '__main__':
    unittest.main()
