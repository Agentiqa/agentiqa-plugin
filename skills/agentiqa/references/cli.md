# Agentiqa CLI reference (essentials)

Commands: `explore`, `run`, `project` (`list` / `use` / `current` / `get` / `create` /
`update`), `plan` (`list` / `get` / `save`), `runs get`, `labels` (`list` / `create` /
`update` / `delete`), `login`, `logout`, `whoami`. The authoritative, always-current
flag list is the generated reference at
`https://docs.agentiqa.com/docs/cli/reference` (or append `.md`).

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
- `--share` (and `AG_SHARE=1`) — DEPRECATED no-op, still accepted. Public share
  links were retired 2026-07 for org-member team access: every cloud run's deep
  link is already in the envelope as `runUrl` and printed as
  `[<plan title>] Run: <url>`, and it opens for members of the run owner's org.
- `--json` / `AG_OUTPUT=json` — see `json-envelope.md`.

Engine default: with `AGENTIQA_SERVICE_KEY` set, `run` defaults to the hosted cloud
engine derived from your API base — no `--engine` needed, and the run persists to
the account. `--embedded` opts out to the local in-process engine; pass `--engine`
only when self-hosting the engine itself. See **Environments** below for
`AGENTIQA_API_URL`.

## project — create, switch, inspect

```
agentiqa project list [--archived] [--json]
agentiqa project use <id|name> [--json]
agentiqa project use --clear
agentiqa project current [--project <id|name>] [--json]
agentiqa project get <id|name> [--json]
agentiqa project create --url <url> [--name <name>] [--persist-browser-profile <true|false>] [--org-shared <true|false>] [--if-not-exists] [--json]
agentiqa project update <id|name> [--name <name>] [--url <url>] [--clear-url] [--persist-browser-profile <true|false>] [--org-shared <true|false>] [--expected-updated-at <iso>] [--json]
```

Every project-scoped command (`run`, `plan`, `runs`, `labels`) also takes
`--project <id|name>` to override the selection for that one invocation.

- `list` — the accessible projects (`--json` → `projects` + `selected`); `--archived`
  adds soft-deleted ones and an ARCHIVED column.
- `use` — remember a project for later commands; validated before it is stored.
  `--clear` forgets it.
- `current` — which project the next command will use and from which rung
  (`source`), plus `valid` (is the remembered id still reachable? `null` = not
  checked because the control plane was unreachable).
- `get` — the project plus `access.isOwner`, `access.sharedVia`, `archived`,
  `activeRuns`.
- `create` — `--url` required; `--name` derived from the URL host when omitted; a
  name collision is exit 2 `name_conflict` carrying `existing: { id, name }`, or a
  success with `created: false` under `--if-not-exists`.
- `update` — a PATCH: flags you omit are preserved. `--url` and `--clear-url` are
  mutually exclusive; at least one field is required; `--expected-updated-at` opts
  into optimistic concurrency (exit 2 `stale_write` on a mismatch). Owner-only.

Under `AGENTIQA_SERVICE_KEY` the project is pinned by the key: `create` exits 2
`service_key_cannot_create`, `use` exits 2 `service_key_pinned`, and a `get`/`update`
aimed elsewhere exits 2 `service_key_project_mismatch`.

Recipes, the full JSON envelope, the source ladder and the error-code table:
`cli-projects.md`.

## plan — author and manage saved plans

```
agentiqa plan list [--json]
agentiqa plan get <id> [--json]
agentiqa plan save --file <path|-> [--json]
```

- `plan list` — the service key's project plans (`--json` → a `plans` array).
- `plan get <id>` — one plan by id (`--json` → a `plan` object). The human output
  shows the plan's label names; the `--json` `plan` carries a `labels` array of
  `lbl_…` ids.
- `plan save --file <path>` — upsert a TestPlanV2: **creates** when the JSON has no
  `id` (a `tp_…` is minted), **edits in place** when it does. A non-empty `title` is
  always required. Use `--file -` to read JSON from stdin (so `plan get --json |
plan save --file -` round-trips). On edit, top-level fields you omit are preserved
  from the stored plan; `steps` is always taken from your JSON. `--json` → the saved
  `plan` plus `lintWarnings`. Attach labels by including a `labels` array of `lbl_…`
  ids (see **labels** below); an unknown id surfaces an `UNKNOWN_LABEL_IDS` entry in
  `lintWarnings` — treat it as a failed attach.

Never hand-author a criterion's `expectedValue` / `matchType` / `grounding` — those
are engine-authored. See the authoring loop in `SKILL.md`.

## labels — discover and manage label ids

```
agentiqa labels <list | create <name> | update <id> | delete <id>> [--name <name>] [--color <#rrggbb>] [--json]
```

Operates on the service key's project. Label ids are opaque (`lbl_…`): use them with
`run --label-ids <a,b,c>` to select which plans a CI run executes, and in a plan's
`labels` array on `plan save` to attach a plan to a label. A newly created plan
carries no labels until you attach them, so a label-selected CI run skips it until
then.

- `labels list` — `--json` → `{ ok, schemaVersion: 1, labels: [{ id, name, color }] }`.
- `labels create <name>` — mints a `lbl_…` id and prints it (`--json` → `label`). A
  color is auto-assigned from the palette unless `--color '#rrggbb'` is given. Names
  are unique per project (case-insensitive): a duplicate exits 2.
- `labels update <id>` — `--name` and/or `--color`; the flag you omit is preserved.
  An unknown id exits 2.
- `labels delete <id>` — deletes the label AND strips its id from every plan that
  carried it (`--json` → `deleted` + `detachedPlanIds`); the plans are otherwise
  untouched.

Prefer attaching an EXISTING label over minting a near-duplicate — labels are the
subsets a human curated for CI.

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

## Environments

The CLI defaults to Agentiqa **production** (`agentiqa.com`). To target a non-default
or self-hosted environment, set `AGENTIQA_API_URL` to its base URL — the hosted
engine is derived from that base automatically, so you don't pass `--engine` unless
self-hosting the engine itself.

## Key environment variables

`AGENTIQA_SERVICE_KEY` (CI auth + hosted-engine access; pins ONE project),
`AGENTIQA_API_URL` (control-plane base URL; see Environments),
`AGENTIQA_PROJECT_ID` (project for the project-scoped commands — below `--project`,
above the project remembered by `agentiqa project use`), `AG_OUTPUT` (`json`). `AG_SHARE` is
accepted but does nothing. Full list: the generated CLI reference (link above).
