# Start coding with an AI agent

**Just copy one prompt, then tell the agent what to make.** Open this repository in Codex, VS Code Copilot, or another coding agent with access to its files. Replace the **one idea line** below. No custom framework or multi-agent setup is required.

## Copy and paste

```text
Repository: https://github.com/Superior-MI-Labs/Interactive-Tabletop

What I want to make or fix: [DESCRIBE YOUR IDEA HERE]

Read AGENTS.md and PROJECT_HANDOFF.md first. Inspect the current branch,
relevant existing code, architecture and tests before changing anything.

Treat this as an architecture decision, not a request to bolt on a patch.
Compare improving the existing system with adding a new one. Prefer the
simplest durable approach that preserves a single source of truth, protects
saved characters, and uses the existing rules/action/dice pipelines.
Push back if the request would create duplicate state or unsupported rules.

Implement a cohesive, tested change, including failure and edge cases.
Run bash tools/qualify.sh. Update relevant docs and PROJECT_HANDOFF.md
with what changed, the rationale, known limitations and where to resume.

If I authorize a push and you have repository access, commit/push safely;
then verify CI and deployment separately. Report the exact tests and
changes, and say clearly what could not be tested or published.
Never invent a test result, commit, or deployment.
```

You can write a feature, bug, cleanup, redesign, or **“continue from the handoff”** on that one line. Do not paste every repository document into the chat. The agent should open only what it needs for the work.

## What each file is for

| File | Purpose |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Short, automatically discoverable repository engineering contract |
| [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) | Last finished work, risks, decisions and next milestone |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Detailed system ownership, read when relevant |
| [`RULESET_AUTOMATION_CONTRACT.md`](RULESET_AUTOMATION_CONTRACT.md) | D&D edition/event/effect rules, read for gameplay changes |
| [`DND_EFFECT_CAPABILITY_AUDIT.md`](DND_EFFECT_CAPABILITY_AUDIT.md) | Which mechanics are genuinely qualified for automation |
| [`CHANGELOG.md`](CHANGELOG.md) | Historical releases, not the current agent's marching orders |

**Agent cannot access the files?** Give it a working checkout or source archive first. Without that, it cannot inspect, run tests or push. Keep credentials, unredacted character sheets and private vault saves out of prompts.

## Why we simplified this (2026-11-07)

The former `AGENTS.md` had grown into a release-by-release log, duplicated detailed architecture/rules contracts and retained a stale browser-test count. The stable requirements now fit in one short file, with details linked by relevance. The existing CI gate—not the prompt—is what verifies behavior.

This change audits **coding-agent instructions**, not a production AI engine. No new agent runner, dependency, skill tree, event bus or application subsystem was added.
