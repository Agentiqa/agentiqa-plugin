# Agentiqa CLI reference (essentials)

Commands: `explore`, `run`, `plan` (`list` / `get` / `save`), `runs get`, `login`,
`logout`, `whoami`. The authoritative, always-current flag list is the generated
reference at `https://docs.agentiqa.com/docs/cli/reference` (or append `.md`).

## explore

```
agentiqa explore "<prompt>" [flags]
```

Agent-led discovery of a web URL; reports findings and returns a draft plan (the
`--json` envelope's `testPlan`). Key flags:

- `--url <url>` — the target (optional when logged in with a single project).
- `--feature <text>`, `--hint <text>` (repeatable), `--known-issue <text>`
  (repeatable) — steer what to test / not report.
- `--credential <name:secret>` (repeatable) — a login credential for the agent.
- `--auto-approve` — auto-approve exploration's runtime checkpoints (required
  non-interactively). NOT approval to save a plan.
- `--json` / `--format <text|json>` — machine output.

## run

```
agentiqa run [--plan-id <id> | --label-ids <a,b,c> | --plan <path.json> --url <url>] [flags]
```

Replays saved plans; deterministic pass/fail. Key flags:

- `--plan-id tp_…` — one saved plan; `--label-ids <a,b,c>` — plans by label (csv,
  OR match); neither → all plans in the service key's project. `--plan <path.json>`
  (with `--url`) runs a local plan file without a service key.
- `--mode <sequential|parallel>` (default sequential).
- `--embedded` — force an in-process engine on your machine (downloads Chromium,
  reaches `localhost`, offline); embedded runs do NOT persist to the account.
- `--engine <url>` — pin a specific engine (overrides the default and `--embedded`).
- `--artifacts-dir <path>`, `--no-artifacts`.
- `--share` — mint a public, revocable share link per cloud run (adds `shareUrl` to
  the envelope). Also `AG_SHARE=1`.
- `--json` / `AG_OUTPUT=json` — see `json-envelope.md`.

Engine default: with `AGENTIQA_SERVICE_KEY` set, `run` defaults to the hosted cloud
engine for your API host (`agentiqa.com` → `engine.agentiqa.com`) — no `--engine`
needed, and the run persists to the account. `--embedded` opts out to the local
in-process engine.

## plan — author and manage saved plans

```
agentiqa plan list [--json]
agentiqa plan get <id> [--json]
agentiqa plan save --file <path|-> [--json]
```

- `plan list` — the service key's project plans (`--json` → a `plans` array).
- `plan get <id>` — one plan by id (`--json` → a `plan` object).
- `plan save --file <path>` — upsert a TestPlanV2: **creates** when the JSON has no
  `id` (a `tp_…` is minted), **edits in place** when it does. A non-empty `title` is
  always required. Use `--file -` to read JSON from stdin (so `plan get --json |
plan save --file -` round-trips). On edit, top-level fields you omit are preserved
  from the stored plan; `steps` is always taken from your JSON. `--json` → the saved
  `plan` plus `lintWarnings`.

Never hand-author a criterion's `expectedValue` / `matchType` / `grounding` — those
are engine-authored. See the authoring loop in `SKILL.md`.

## runs — read verdicts

```
agentiqa runs get <plan-id> [--limit <n>] [--json]
```

Verdict/history for one saved plan. `--limit <n>` caps the newest-first list
(default 5). `--json` → `runs` (a `TestPlanV2Run` array) plus `issues` (bugs found
for the plan).

## Auth commands

`agentiqa login` (opens browser) / `logout` / `whoami`. For unattended/CI use, set
`AGENTIQA_SERVICE_KEY` instead of logging in (see `service-keys.md`).

## Key environment variables

`AGENTIQA_SERVICE_KEY` (CI auth + hosted-engine access), `AGENTIQA_API_URL`
(control-plane override), `AG_OUTPUT` (`json`), `AG_SHARE`. Full list: the generated
CLI reference (link above).
