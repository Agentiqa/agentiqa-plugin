# Agentiqa projects from the CLI

A **project** is the container for everything Agentiqa stores: its saved test plans,
labels, run history, credentials and target URL. Every project-scoped verb (`run`,
`plan`, `runs`, `labels`) operates in exactly one project, so "which project?" is the
first question of any Agentiqa task.

You are usually a coding agent working inside the customer's repo. Two consequences
run through this whole reference:

- **`--json` always.** Every project verb emits one JSON document on stdout with
  `schemaVersion: 1`; logs go to stderr. Parse the envelope — never scrape the table.
- **Bare `agentiqa`, never `npx -y agentiqa@latest`.** The plugin installs the binary
  and version-checks it at session start; `npx` re-resolves the package per call, so
  it can answer from a different build than the one that was vetted.
- **The failure envelope carries the recovery.** A name collision ships
  `existing: { id, name }`; an unmatched selector ships `candidates: [{ id, name }]`.
  Recover from the SAME response; do not fire a second `project list` to find out
  what the error already told you.

```
agentiqa project <list | use <id|name> | current | get <id|name> | create --url <url> | update <id|name>> [--json]
```

Requires an agentiqa CLI new enough to carry `project create` — the plugin pins the
minimum in its `cli-requirements.json` and checks it at session start. An older binary
answers `unknown project subcommand` and exits 2; that is a stale install, not a broken
command.

## The envelope

Success:

```json
{
  "ok": true,
  "schemaVersion": 1,
  "project": {
    "id": "proj_…",
    "name": "shop-staging",
    "defaultUrl": "https://staging.shop.dev",
    "targetType": "web",
    "persistBrowserProfile": false,
    "orgShared": false
  },
  "created": true,
  "target": {
    "apiBase": "https://agentiqa.com",
    "env": "production",
    "projectId": "proj_…",
    "name": "shop-staging"
  }
}
```

Failure:

```json
{
  "ok": false,
  "schemaVersion": 1,
  "error": { "code": "name_conflict", "message": "…" },
  "existing": { "id": "proj_…", "name": "shop-staging" }
}
```

Per-verb payloads (all of them additionally carry `target`):

| verb      | success payload                                                                   |
| --------- | --------------------------------------------------------------------------------- |
| `list`    | `projects: [{ id, name, defaultUrl, isOwner, sharedVia, archived }]` + `selected` |
| `use`     | `project`                                                                         |
| `current` | `projectId`, `name`, `source`, `valid`                                            |
| `get`     | `project`, `access: { isOwner, sharedVia }`, `archived`, `activeRuns`             |
| `create`  | `project`, `created` (`true` \| `false`)                                          |
| `update`  | `project`, `updated`                                                              |

`target` is printed by **every** verb because the API base comes from four rungs
(`AGENTIQA_API_URL`, the login binding on disk, the build channel, the default), so
"prod or staging?" is genuinely non-obvious. Echo `target.env` back to the user when
you report what you did.

## Create the first project

```bash
agentiqa project create --url https://staging.shop.dev --name shop-staging --json
```

- `--url` is **required**; it must parse as a URL. `targetType` is always `web`.
- `--name` is optional. Omitted, the name is derived from the URL host exactly as the
  web welcome flow derives it — the second-level label, so
  `https://app.example.com` → `example`, `http://localhost:3000` → `localhost`. The
  derived name is echoed in `project.name`; read it, don't guess it.
- Optional: `--persist-browser-profile <true|false>` (keep cookies/storage between
  runs) and `--org-shared <true|false>` (share with your organization; needs an
  active Company-plan org, otherwise exit 2 `org_sharing_unavailable` — the CLI
  refuses to report a success the server did not perform).

Read `project.id` out of the envelope and use it for everything that follows:

```bash
PROJECT_ID=$(agentiqa project create --url https://staging.shop.dev --name shop-staging --json | jq -r .project.id)
```

## Create idempotently (the CI / retry case)

Names are unique per owner, case-insensitively. A second `create` with the same name
is a **conflict, never a silent rename** (there is no `-2` suffixing).

Preferred — declare the intent:

```bash
agentiqa project create --url https://staging.shop.dev --name shop-staging --if-not-exists --json
```

`--if-not-exists` turns the collision into a success: you get the EXISTING project
with `"created": false` and exit 0, so a retried job never mints a twin. Branch on
`created` when you want to say "created" vs "reused"; never branch on it to decide
whether you have a usable id — you have one either way.

Without the flag, the collision is exit 2 with the recovery data inline:

```json
{
  "ok": false,
  "schemaVersion": 1,
  "error": { "code": "name_conflict", "message": "…" },
  "existing": { "id": "proj_abc", "name": "shop-staging" }
}
```

Take `existing.id` and continue. **Do not** run `project list` to find the id the
error just handed you, and do not retry the create with a mangled name.

## Choose which project you are in

Four rungs under a login, highest first — plus a service key, which pre-empts all of
them. `project current --json` reports which one won as `source`, so you never have to
infer it:

| `source`         | set by                                                               |
| ---------------- | -------------------------------------------------------------------- |
| `flag`           | `--project <id\|name>` on this one command                           |
| `env`            | `AGENTIQA_PROJECT_ID`                                                |
| `stored`         | `agentiqa project use <id\|name>`                                    |
| `single-project` | the account has exactly one accessible project                       |
| `service-key`    | `AGENTIQA_SERVICE_KEY` — pins one project and beats everything above |
| `none`           | nothing is selected                                                  |

```bash
agentiqa project use proj_abc --json          # remember it for later commands
agentiqa run --plan-id tp_123 --project proj_abc --json   # override for one command
agentiqa project use --clear                  # forget the remembered project
agentiqa project current --json               # { projectId, name, source, valid, target }
```

- Prefer an **exact id**. A name is accepted (unique, case-insensitive), but a name
  that matches nothing exits 2 `project_not_found` with the whole accessible list in
  `candidates`, and an ambiguous one exits 2 `project_ambiguous`. (Resolving a
  SELECTION is `project_not_found`; reading a project that is not there — `get` /
  `update` — is `not_found`.)
- `valid` in `project current` is the point of the verb: a project deleted in the web
  UI leaves a stale remembered id behind, and every later command would otherwise
  fail with a 404 that never mentions the selection. `valid: false` ⇒ re-select.
  `valid: null` ⇒ the control plane was unreachable, so it was **not checked** —
  that is not a failure, and the verb still exits 0.
- `project use` **validates before storing**. A stored id is always one the account
  could reach at the time it was stored.

## Inspect before acting

```bash
agentiqa project get proj_abc --json
agentiqa project get shop-staging --json      # a name works too
```

Returns the project plus `access: { isOwner, sharedVia }`, `archived`, and
`activeRuns`. Use it when you need to know whether you may edit (`isOwner`), whether
a project is a shared one from someone else's account (`sharedVia`), or whether runs
are in flight. An unknown or foreign id exits 2 `not_found`.

## Retarget an existing project

```bash
agentiqa project update proj_abc --url https://pr-123.preview.app --json
agentiqa project update proj_abc --name shop-staging-eu --json
agentiqa project update proj_abc --clear-url --json
```

`update` is a PATCH: **flags you omit are preserved**. Pass at least one of `--name`,
`--url`, `--clear-url`, `--persist-browser-profile`, `--org-shared`, or it exits 2.
`--url` and `--clear-url` together exit 2 — pick a URL or clear it, not both.

Guard a concurrent edit with `--expected-updated-at <iso>` (take the value from a
prior `project get`): a mismatch is refused with exit 2 `stale_write` instead of
overwriting someone else's change. It is opt-in — omit it and last write wins.

Editing project settings is **owner-only**. On a project shared with you, `update`
exits 2 `owner_only` and names the affordance; ask the owner rather than retrying.

## Under a service key (CI)

`AGENTIQA_SERVICE_KEY` is scoped to exactly ONE project, so the whole selection
question is already answered:

- `project current --json` reports `"source": "service-key"`.
- `project list` shows that single project.
- `project use` exits 2 `service_key_pinned` — a stored selection cannot override a
  key, and pretending otherwise is a lie the next command exposes.
- `project create` exits 2 `service_key_cannot_create` and issues **zero** requests —
  a key must not create its own sibling. Creating a project needs `agentiqa login`.
- `project get` / `update` on any project other than the key's exit 2
  `service_key_project_mismatch`.

If the user asks you to create a project in CI, say what the blocker is (a service
key cannot create) and offer the two real paths: create it once from a logged-in
machine, or have them run `agentiqa login`.

## Exit codes

The 4-code contract in `exit-codes.md` applies, with one narrowing: **project verbs
never exit 1.** Exit 1 is reserved for a real plan verdict from `run`.

| code | meaning                                                 | act on it                               |
| ---- | ------------------------------------------------------- | --------------------------------------- |
| `0`  | ok — including `created: false` and `valid: null`       | continue                                |
| `2`  | usage / denied / conflict — a retry can never change it | read `error.code` and recover           |
| `3`  | infra — control plane unreachable, 5xx                  | retry (see the loop in `exit-codes.md`) |

Codes you will actually branch on: `name_conflict` (use `existing.id`),
`project_not_found` (a selector matched nothing — use `candidates`), `not_found` (a
`get`/`update` target is gone), `project_ambiguous`, `owner_only`, `stale_write`,
`org_sharing_unavailable`, `service_key_cannot_create`, `service_key_pinned`,
`service_key_project_mismatch`, `auth_required`, `usage_error`,
`control_plane_unavailable`.

## Hard rules

1. **Use the CLI.** Never hand-roll `curl`/`fetch`/`httpx` against the Agentiqa API
   to create or read a project. The verbs above are the whole supported surface; the
   API routes, auth exchange and token scoping are not a public contract.
2. **Never invent a flag.** If a flag is not in `agentiqa project --help` or in this
   file, it does not exist. Unknown flags exit 2. There is no `--delete`,
   `--archive`, `--type`, or `--org` in wave 1.
3. **Never grep the repo for a project id.** A `proj_…` found in a config file,
   a lockfile, or a CI YAML may belong to another account or environment.
   `agentiqa project list --json` is the only source of truth for what THIS account
   can reach.
4. **Never create a project just because a command failed.** Read the error code
   first. `project_not_found` from a stale selection is fixed by re-selecting, not by
   minting a duplicate project the user now has to clean up.
5. **Report the target.** When you tell the user what you did, name the project id,
   its name, and `target.env`.
