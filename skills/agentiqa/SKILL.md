---
name: agentiqa
description: "Use Agentiqa — an AI QA agent that tests web apps in a real browser — from any of its four surfaces: the CLI (agentiqa explore / agentiqa run), the web app, the desktop app, or the GitHub Action. Load this when the user wants to QA/test a web app with Agentiqa, run an Agentiqa test plan locally or in CI, wire Agentiqa into a GitHub Actions workflow, mint a CLI service key, or parse the machine-readable JSON result envelope / exit codes. Triggers on 'agentiqa', 'agentiqa explore', 'agentiqa run', 'test my app with Agentiqa', 'run Agentiqa in CI', 'agentiqa github action', 'agentiqa service key', 'parse the agentiqa result'."
---

# Agentiqa — using the AI QA agent

Agentiqa is an AI-powered testing platform for **web apps**. An LLM agent drives a
real browser, discovers what matters, executes test plans, and reports bugs with
screenshots and repro steps. It runs on four surfaces that all drive the same
agent: the **CLI**, the **web app**, the **desktop app**, and a **GitHub Action**.

This skill teaches an agent (you) how to drive Agentiqa correctly. It is
progressive-disclosure: the essentials are here; open a bundled reference file for
detail; for anything not bundled, fetch the live docs (see Staying current).

## Pick the surface

- **Automating / CI / scripting** → the **CLI** (`agentiqa run` in CI, `agentiqa
explore` for ad-hoc QA) or the **GitHub Action**. This is what you'll use most.
- **A human wants to test interactively** → point them at the **web app**
  (`web.agentiqa.com`, cloud execution) or the **desktop app** (built-in headed
  browser, can test `localhost`). You cannot drive those from a shell.

## CLI — the two commands

Needs Node.js 18+. Use `npx -y` (the `-y` matters in CI: bare `npx` prompts and
hangs a non-interactive shell).

```bash
# Explore: agent-led discovery of a URL, reports findings
npx -y agentiqa@latest explore "Find bugs on the signup page" --url https://example.com

# Run: replay saved test plans, deterministic pass/fail (this is the CI command)
AGENTIQA_SERVICE_KEY=sk_... npx -y agentiqa@latest run --engine https://engine.agentiqa.com
```

- No `--engine` → the CLI runs an engine **in-process** (downloads Chromium; can
  test `localhost`; BYOK Gemini via `GEMINI_API_KEY`).
- `--engine https://engine.agentiqa.com` → **hosted** cloud engine (managed LLM,
  no local Chromium). `AGENTIQA_SERVICE_KEY` alone authenticates.
- Select plans: `--plan-id tplan_…`, or `--label-ids a,b` (csv), else all plans in
  the key's project. `--mode parallel` to run concurrently.

Full flag/env/exit-code detail: `references/cli.md`. Auth (service keys):
`references/service-keys.md`.

## Running in CI — the contract

Two things make Agentiqa CI-safe, both governed and versioned:

1. **Exit codes** — `0` pass · `1` plan failure · `2` usage/config error · `3`
   infra/runtime error (safe to retry). Branch on the exit code, never on stdout.
   Detail + a retry-on-3 loop: `references/exit-codes.md`.
2. **JSON envelope** — add `--json` or `AG_OUTPUT=json` to get exactly one JSON
   document on stdout (`schemaVersion: 1`); all logs go to stderr. Shape + fields:
   `references/json-envelope.md`.

Prefer the **GitHub Action** over hand-rolled `run:` steps — it pins the argv, the
JSON capture, the artifact upload, and the exit-code gating:

```yaml
- uses: agentiqa/qa-action@v1
  with:
    service-key: ${{ secrets.AGENTIQA_SERVICE_KEY }}
    # fail-on: plan-failure (default) | never | any
```

Setup, cloud-vs-self-hosted, and the full input/output list: `references/github-action.md`.

## Quickstarts for all four surfaces

`references/quickstarts.md` has the fastest first-run path for CLI, GitHub Action,
web app, and desktop app.

## Staying current

This skill bundles the stable essentials. For anything not covered here — a specific
feature page, a flag you don't see, the newest reference — fetch the live docs, which
are generated from the code and kept fresh:

- Machine index: `https://docs.agentiqa.com/llms.txt`
- Full corpus (every page as one document): `https://docs.agentiqa.com/llms-full.txt`
- Any page as markdown: append `.md` to its URL (e.g.
  `https://docs.agentiqa.com/docs/ci.md`).

When the bundled references and the live docs disagree, trust the live docs (they
track the current release).
