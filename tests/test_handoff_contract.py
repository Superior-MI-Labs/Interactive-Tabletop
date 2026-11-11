"""Guard against an outdated or undiscoverable development handoff."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ProjectHandoffContractTests(unittest.TestCase):
    def test_checkpoint_matches_application_version(self):
        version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
        handoff = (ROOT / "PROJECT_HANDOFF.md").read_text(encoding="utf-8")
        self.assertTrue(
            f"**Last verified application release:** `v{version}`" in handoff or
            f"**Candidate application release:** `v{version}`" in handoff,
            "Handoff must identify current version as verified or an explicit candidate"
        )
        for heading in (
            "## 2. What was completed, and where we stopped",
            "## 3. Architecture choices and rationale",
            "## 4. Known limits, risks and things not to claim",
            "## 5. Suggested next milestone",
            "## 7. Handoff update protocol",
        ):
            self.assertIn(heading, handoff)

    def test_copy_paste_agent_entry_point(self):
        starter = (ROOT / "AI_START_HERE.md").read_text(encoding="utf-8")
        agent = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("What I want to make or fix:", starter)
        self.assertIn("AGENTS.md and PROJECT_HANDOFF.md", starter)
        self.assertEqual(starter.count("```text"), 1)
        self.assertIn("AI_START_HERE.md", readme)
        self.assertIn("AI_START_HERE.md",
                      (ROOT / "PROJECT_HANDOFF.md").read_text(encoding="utf-8"))
        self.assertLess(len(agent), 6000)
        self.assertIn("bash tools/qualify.sh", agent)
        self.assertIn("web/dnd-action.js", agent)
        self.assertIn("web/vault-store.js", agent)
        self.assertNotRegex(agent, r"(?m)^## .*v0[.][0-9]+")

    def test_checkpoint_is_in_agent_and_reader_entry_points(self):
        for name in ("AGENTS.md", "README.md"):
            self.assertIn("PROJECT_HANDOFF.md",
                          (ROOT / name).read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
