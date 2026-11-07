"""Guard against an outdated or undiscoverable development handoff."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ProjectHandoffContractTests(unittest.TestCase):
    def test_checkpoint_matches_application_version(self):
        version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
        handoff = (ROOT / "PROJECT_HANDOFF.md").read_text(encoding="utf-8")
        self.assertIn(f"**Last verified application release:** `v{version}`", handoff)
        for heading in (
            "## 2. What was completed, and where we stopped",
            "## 3. Architecture choices and rationale",
            "## 4. Known limits, risks and things not to claim",
            "## 5. Suggested next milestone",
            "## 7. Handoff update protocol",
        ):
            self.assertIn(heading, handoff)

    def test_checkpoint_is_in_agent_and_reader_entry_points(self):
        for name in ("AGENTS.md", "README.md"):
            self.assertIn("PROJECT_HANDOFF.md",
                          (ROOT / name).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
