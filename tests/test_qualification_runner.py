"""Exercise qualification modes and fail-closed behavior without running the app twice."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class QualificationRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ('tools', 'tests', 'web', 'bin'):
            (self.root / directory).mkdir()
        shutil.copyfile(ROOT / 'tools/qualify.sh', self.root / 'tools/qualify.sh')
        for name in ('web/app.js', 'tests/test_a.js', 'tests/browser_a_smoke.py',
                     'tests/browser_support.py'):
            (self.root / name).touch()
        for command in ('python3', 'node'):
            stub = self.root / 'bin' / command
            stub.write_text('#!/bin/sh\nprintf "%s %s\\n" "${0##*/}" "$*" >> "$TRACE"\n'
                            '[ "$*" != "$FAIL_ARGS" ] || exit 7\n')
            stub.chmod(0o755)

    def invoke(self, *args, fail=''):
        trace = self.root / 'trace'
        trace.write_text('')
        env = dict(os.environ, PATH=str(self.root / 'bin') + os.pathsep + os.environ['PATH'],
                   TRACE=str(trace), FAIL_ARGS=fail)
        result = subprocess.run(['bash', str(self.root / 'tools/qualify.sh'), *args],
                                cwd=self.root.parent, env=env, capture_output=True, text=True)
        return result, trace.read_text().splitlines()

    def test_default_and_explicit_full_run_the_same_checks(self):
        default, calls = self.invoke()
        explicit, explicit_calls = self.invoke('--full')
        self.assertEqual(default.returncode, 0, default.stderr)
        self.assertEqual(explicit.returncode, 0, explicit.stderr)
        self.assertEqual(calls, explicit_calls)
        self.assertEqual(calls, [
            'python3 tools/build_physics.py',
            "python3 -I -S -m unittest discover -s tests -p test_*.py -v",
            'node --check web/app.js', 'node tests/test_a.js',
            'python3 tests/browser_a_smoke.py',
        ])
        self.assertIn('FULL PASS', default.stdout)

    def test_fast_is_only_the_non_browser_prefix(self):
        _, full = self.invoke()
        fast, calls = self.invoke('--fast')
        self.assertEqual(fast.returncode, 0, fast.stderr)
        self.assertEqual(calls, full[:-1])
        self.assertIn('Not release-qualified', fast.stdout)
        self.assertNotIn('FULL PASS', fast.stdout)

    def test_failure_stops_and_never_claims_pass(self):
        for fail in ('tools/build_physics.py', 'tests/test_a.js', 'tests/browser_a_smoke.py'):
            with self.subTest(fail=fail):
                result, calls = self.invoke(fail=fail)
                self.assertEqual(result.returncode, 7)
                self.assertTrue(calls[-1].endswith(fail))
                self.assertIn('>>> ', result.stdout)
                self.assertNotIn('FULL PASS', result.stdout)
        fast, _ = self.invoke('--fast', fail='tests/test_a.js')
        self.assertEqual(fast.returncode, 7)
        self.assertNotIn('FAST PASS', fast.stdout)

    def test_bad_arguments_fail_before_work(self):
        for args in (('--unknown',), ('--fast', '--full')):
            result, calls = self.invoke(*args)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(calls, [])


if __name__ == '__main__':
    unittest.main()
