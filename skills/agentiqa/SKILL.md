---
name: agentiqa
description: "Use Agentiqa — an AI QA agent that tests web apps in a real browser — from any of its four surfaces: the CLI (agentiqa explore / agentiqa run), the web app, the desktop app, or the GitHub Action. Load this when the user wants to QA/test a web app with Agentiqa, create or switch an Agentiqa project, run an Agentiqa test plan locally or in CI, wire Agentiqa into a GitHub Actions workflow, mint a CLI service key, or parse the machine-readable JSON result envelope / exit codes. Triggers on 'agentiqa', 'agentiqa explore', 'agentiqa run', 'test my app with Agentiqa', 'create an agentiqa project', 'agentiqa project', 'which agentiqa project am I in', 'switch agentiqa project', 'run Agentiqa in CI', 'agentiqa github action', 'agentiqa service key', 'parse the agentiqa result'."
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

## CLI — the commands

Needs Node.js 18+.

**Type `agentiqa`, not `npx agentiqa`.** This plugin installs the CLI globally and
checks its version at session start, so the binary on your PATH is the one these
skills document. `npx -y agentiqa@latest` re-resolves the package from the registry
on every call: it is slower, it can silently run a *different* build than the one the
version check just vetted, and it bypasses any local install a harness has put on
PATH. Use it only on a machine where `command -v agentiqa` finds nothing — a CI
runner that does not load this plugin — and keep the `-y` there (bare `npx` prompts
and hangs a non-interactive shell).

```bash
# Explore: agent-led discovery of a URL; reports findings and a draft plan
agentiqa explore "Find bugs on the signup page" --url https://example.com

# Run: replay saved test plans, deterministic pass/fail (this is the CI command)
AGENTIQA_SERVICE_KEY=sk_... agentiqa run

# Only where the binary is absent (bare CI runner):
#   npx -y agentiqa@latest run
```

The verbs split into three jobs:

- **Choose where the work lands** — the `project` verbs (`list` / `use` / `current` /
  `get` / `create` / `update`). Everything else operates inside exactly one project,
  so this comes first. See **Projects** below.
- **Explore & author** — `explore` (discovery + a draft plan) and the plan verbs
  `plan list` / `plan get <id>` / `plan save --file <path>`, plus `runs get <id>` to
  read a plan's verdict history. This is the interactive authoring loop below.
- **Run & gate** — `run` replays saved plans for deterministic pass/fail. Wire this
  into CI.

Engine for `run`: with `AGENTIQA_SERVICE_KEY` set, `run` **defaults to the hosted
cloud engine** derived from your API base (see Environments), so no `--engine` is
needed and the run persists to the account. Pass `--embedded` to force an in-process
engine on your machine (downloads Chromium, reaches `localhost`, offline — but does
not persist to the account); `--engine <url>` overrides both and is only needed when
you self-host the engine itself.

Select plans: `--plan-id tp_…`, or `--label-ids a,b` (csv), else all plans in the
key's project. `--mode parallel` to run concurrently. See Labels for how a plan
acquires the ids that `--label-ids` matches on.

Full flag/env/exit-code detail: `references/cli.md`. Auth (service keys):
`references/service-keys.md`.

## Environments

The CLI defaults to Agentiqa **production** (`agentiqa.com`) — nothing to configure.
If your organization uses a non-default or self-hosted Agentiqa environment, set
`AGENTIQA_API_URL` to that environment's base URL; the hosted engine is derived from
that base automatically, so you do **not** pass `--engine` unless you are self-hosting
the engine itself.

## Projects

A **project** holds a target URL, its saved test plans, labels, run history and
credentials. `run`, `plan`, `runs` and `labels` all operate inside exactly one
project, so "which project?" is the first question of any Agentiqa task — and the one
a coding agent most often gets wrong by guessing.

```
agentiqa project <list | use <id|name> | current | get <id|name> | create --url <url> | update <id|name>> [--json]
```

Always pass `--json`: every verb then emits one document on stdout with
`schemaVersion: 1` plus `target: { apiBase, env, projectId, name }`, and every failure
carries a stable `error.code`. Full envelope, flag list and error-code table:
`references/cli-projects.md`.

**Create the first project.** Read the id back out of the envelope — never invent it:

```bash
agentiqa project create --url https://staging.shop.dev --name shop-staging --json
# → { ok, schemaVersion: 1, project: { id: "proj_…", name, defaultUrl, … }, created: true, target }
```

`--url` is required; `--name` is optional and defaults to the URL's host label
(`https://app.example.com` → `example`), echoed back in `project.name`.

**Re-running the same request must not mint a twin.** Names are unique per owner
(case-insensitive) and a collision is a 409, never a silent rename. Two correct
shapes:

- Declare the intent: add `--if-not-exists`. The existing project comes back with
  `"created": false` and exit 0.
- Or recover from the failure you already have: without the flag a collision exits 2
  with `error.code: "name_conflict"` **and** `existing: { id, name }` in the same
  envelope. Take `existing.id` and carry on — do NOT fire a `project list` to look up
  the id the error just handed you.

**Switch.** Four rungs, highest first — `--project <id|name>` (this command only) >
`AGENTIQA_PROJECT_ID` > `agentiqa project use <id|name>` (remembered) > the account's
single project. `agentiqa project current --json` answers
`{ projectId, name, source, valid }` where `source` names the winning rung
(`flag | env | stored | single-project | service-key | none`), so you never infer it.
`valid: false` means the remembered project is gone — re-select instead of letting
the next command fail with a bare 404. `project use --clear` forgets it.

**Inspect / retarget.** `project get <id|name> --json` adds `access.isOwner`,
`sharedVia`, `archived` and `activeRuns`. `project update <id> --url <new-url> --json`
is a PATCH — omitted flags are preserved — which is how you point a project at a
preview deploy. Editing settings is owner-only (exit 2 `owner_only` on a shared
project).

**Under `AGENTIQA_SERVICE_KEY` the question is already answered.** The key is scoped
to ONE project: `project current` reports `source: "service-key"`, `project use`
exits 2 `service_key_pinned`, and `project create` exits 2
`service_key_cannot_create` while issuing zero requests — creating a project needs
`agentiqa login`. Say that plainly rather than working around it.

**Hard rules.**

1. **Drive the CLI, never the API.** No `curl`/`fetch` against Agentiqa endpoints to
   create or read a project — and drive it as the `agentiqa` binary on PATH, not as
   `npx -y agentiqa@latest` (see **CLI — the commands**).
2. **Never invent a flag.** If it is not in `agentiqa project --help` or
   `references/cli-projects.md`, it does not exist and exits 2.
3. **Never grep the customer's repo for a `proj_…` id.** One found in a config or CI
   file may belong to another account or environment. `agentiqa project list --json`
   is the only source of truth for what this account can reach.
4. **Never create a project because a command failed.** Read `error.code` first — a
   stale selection is fixed by re-selecting, not by minting a duplicate.
5. Report the project id, its name and `target.env` when you tell the user what you
   did.

Project verbs never exit `1` — that code is reserved for a real plan verdict from
`run`. They use `0` / `2` (usage, denied, conflict — retrying cannot help) / `3`
(infra — retry).

## Authoring a test plan (the curation loop)

Agentiqa's model is **the agent proposes, the user curates**. When the user asks you
to build or change a saved plan, you are the coordinator — run this loop and keep the
user in control. A service key is scoped to ONE project; all plan reads/writes and
runs land in that project.

1. **Explore.** Run `agentiqa explore "<goal>" --auto-approve --json`
   (add `--url` when given) as a long-lived background command. Keep stdout as one
   JSON document (no `2>&1`). Take
   the success envelope's `testPlan` array as the engine-authored draft steps. If it
   is absent or empty, tell the user and refine — never invent steps.
2. **Review.** Present the draft in chat: a clear, non-empty title, then each
   numbered step, its type, and its criteria. Do not save yet.
3. **Approve.** Wait for the user's explicit approval of the exact plan shown. The
   original request, silence, prior approval, and `--auto-approve` are NOT save
   approval (`--auto-approve` only clears exploration's runtime checkpoints).
4. **Save.** Serialize the approved plan (non-empty `title`, complete `steps`) and
   pipe it in: `printf '%s\n' "$PLAN_JSON" | agentiqa plan save --file - --json`.
   Omit `id` to create (the CLI mints a `tp_…`); include it to edit in place. Report
   the saved `plan.id` and every `lintWarnings` entry — never suppress a warning.
5. **Run.** `agentiqa run --plan-id "<id>" --json` (hosted by default
   with a service key). Surface each plan's outcome, summary, and `runUrl` when
   present. Add `--share` only if the user asks for a public link.
6. **Read & revise.** `agentiqa runs get "<id>" --json` reads the
   verdict history and discovered issues. To change a plan, start from
   `agentiqa plan get "<id>" --json`, edit the envelope's `plan` (keep
   its `id` and a complete `steps` array), present it, and get explicit approval
   again before re-saving.

**Never hand-author criteria.** The engine owns each criterion's `expectedValue`,
`matchType`, and `grounding`. You curate title, labels, step text, and ordering —
never those typed fields. When a criterion's _meaning_ must change, re-explore; do
not rewrite the assertion by hand. On edit, omitted top-level fields are preserved
from the stored plan; `steps` is always taken from your JSON.

**Plan ids are the shared handle.** A `tp_…` id works identically in the web app and
from the CLI. Receive a web-authored id and `plan get` it; hand back the id you
saved. Never make the user copy a whole plan between surfaces.

Exit codes for these verbs: branch on the process exit code, not log text — see
`references/exit-codes.md` (`run` adds `1` for a real failing verdict).

## Labels

Labels group a project's plans so a CI job can select a subset:
`agentiqa run --label-ids <a,b,c>` runs every plan whose `labels` include ANY of the
given ids (omit the flag to run all plans in the key's project). Labels are **opaque
ids** shaped `lbl_…`, not free text — you curate which plan carries which label, the
same "agent proposes, user curates" model.

- **Discover ids.** `agentiqa labels list --json` returns the project's labels as
  `{ id, name, color }` (the project is inferred from the service key). Or read a
  sibling plan's `labels` array from `agentiqa plan get <id> --json`.
- **Mint one when none fits.** `agentiqa labels create <name> [--color '#rrggbb']`
  prints the new `lbl_…` id (`--json` → `label`); `labels update <id>` renames or
  recolors, `labels delete <id>` removes it and detaches it from every plan. Prefer
  an EXISTING label — creating near-duplicates ("smoke" vs "smoke-tests") splits the
  CI subsets a human curated. Names are unique per project (case-insensitive): a
  duplicate is a usage error (exit 2), not a silent no-op.
- **Attach.** A label is attached by including its `lbl_…` id in the plan's `labels`
  array when you `plan save`. On an **edit**, an omitted `labels` field is preserved
  from the stored plan; on a **create** without `labels`, the plan is stored with
  none.
- **A fresh plan is unlabeled.** A newly created plan has NO labels until you attach
  them — fine for ad-hoc `--plan-id` runs, but it will **never** be picked up by a CI
  job that selects via `--label-ids`. Attach the right label(s) before wiring it in.
- **Bad ids fail the attach.** An unknown or typo'd id yields an `UNKNOWN_LABEL_IDS`
  entry in the `plan save` response's `lintWarnings` — treat it as a **failed
  attach**, not a soft note: fix the id and re-save.

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

Setup, plan selection, gating, and the full input/output list: `references/github-action.md`.

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
