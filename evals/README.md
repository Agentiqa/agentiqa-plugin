# Eval suite — does a coding agent drive the project verbs correctly?

These cases score the thing the skills exist to change: **what an agent actually
types** when a user asks it to create a project, switch project, or say which one is
in use. They grade the recorded argv, not the prose the agent writes about itself.

> **Run cases only through `./evals/run.sh`.** Any other way — `claude plugin eval` by
> hand, or replaying a case prompt in an ordinary session — has no HOME isolation, no
> PATH shims and no API sentinel, and an agent that reaches for `npx -y agentiqa@latest`
> will drive your real Agentiqa account.

```bash
./evals/run.sh                       # the whole suite
./evals/run.sh --case '02-*'         # one case (glob over case directory names)
./evals/run.sh --runs 1 --verbose    # quick iteration
./evals/run.sh --dry-run             # scaffold + hermeticity only, no model tokens
node evals/selftest.mjs --verbose    # graders + shims — no model, no network, no gate
```

## How to run it

```bash
./evals/run.sh [extra flags forwarded to `claude plugin eval`]
```

`--case` and `--dry-run` are consumed by the wrapper; everything else is forwarded.
`--case` also drives the loop: cases run one `claude plugin eval` invocation at a time,
so the hermeticity assertion below can name the case that broke it.

Two things a case file cannot express, and three it must not be trusted with:

1. **PATH.** The skills tell the agent to type `agentiqa`, so the stub must be on
   PATH under that name. `execution.env` in a `case.yaml` only accepts keys matching
   `/^EVAL_[A-Z0-9_]*$/` — `PATH` is rejected outright — but the agent subprocess
   inherits the operator's environment, so `run.sh` prepends `evals/_stub` there and
   then asserts that `command -v agentiqa` resolves to the stub. Without that guard a
   real CLI on PATH would answer, and the eval would hit a live account.
2. **`--scaffold`.** Off by default (it runs author-supplied bash as you). Each case's
   `setup.sh` plants a decoy repo, and without it two graders become unfalsifiable.
3. **Hermeticity** — HOME, the package-runner shims, and the API sentinel, below.

There is deliberately no "equivalent by hand" recipe here any more. Reproducing the
guards correctly is the wrapper's whole job; a copy-pasteable half of them is how the
incident below happened.

## Hermeticity — why `run.sh` is the only supported entry point

In a headless eval run the agent under test typed `npx -y agentiqa@latest project list
--json`. npx fetched the **published** CLI, which read the operator's real
`~/.agentiqa/credentials.json`, returned 16 live projects, and on the next turn
`project use` rewrote `~/.agentiqa/config.json`. Nothing was billed only because the
published CLI predates `project create`; when it ships, the same run creates real
projects. The measurement was void either way — the suite was scoring the wrong CLI.

The skill text was fixed to prefer the installed binary. That is necessary and not
sufficient: a harness that *relies* on the agent's good behaviour is not measuring it.
So `run.sh` closes the door four ways, and every one of them is belt to another's
braces:

| guard | what it stops |
| --- | --- |
| **Isolated `HOME`** — a throwaway `mktemp -d`, removed on exit | a real CLI reading `~/.agentiqa/credentials.json` or writing `config.json`. `os.homedir()` follows `$HOME`, so moving `HOME` moves the account. `CLAUDE_CONFIG_DIR` is pinned back to the real `~/.claude` — Claude Code's auth is keychain-scoped and a fully isolated config dir just fails with "Not logged in". |
| **PATH shims** — `_shim/{npx,npm,pnpm,yarn,bunx,corepack,curl,wget}` | any invocation mentioning `agentiqa`: exit 2 with `hermetic eval: real CLI forbidden`, recorded in the run's stub log. Everything else `exec`s the real binary unchanged, so an unrelated `npm ci` still works. |
| **`AGENTIQA_API_URL=http://127.0.0.1:9`**, and `AGENTIQA_SERVICE_KEY` / `AGENTIQA_PROJECT_ID` / `AGENTIQA_API_KEY` / `AGENTIQA_TOKEN` unset | a CLI that escaped anyway. Port 9 is discard: the connection is refused, never answered. The stub reads `EVAL_`-prefixed fixtures, so clearing the bare names costs it nothing. |
| **Fingerprint assertion** — `sha256` of `ls -laR ~/.agentiqa` plus the bytes of `config.json` and `credentials.json`, taken before the suite and re-checked after **every case** | the guards themselves being wrong. On drift `run.sh` prints both hashes, names the case, and exits 3. This is the only check that would have caught the incident as it happened. Local telemetry (`events-queue.ndjson`, `analytics.json`, `update-check.json`, `plugin-latest-version`) and the `..` entry are excluded — any agentiqa process on the machine rewrites those, this plugin's own session-start hook included, and an assertion that cries wolf every second run is how a real breach gets waved through. |

**A breach fails the case, it is not a footnote.** Every `case.yaml` carries

```yaml
- type: regex
  name: hermetic-guard-never-tripped
  target: { source: file, path: .agentiqa-stub-log.jsonl }
  pattern: 'hermeticViolation'
  match: not_contains
```

and the shims append `{"ts":…,"hermeticViolation":"npx","attempt":"npx -y
agentiqa@latest …","exitCode":2}` to that same log — so the grader that scores the run
is the grader that sees the escape attempt. The attempt is recorded as a flat string,
never as a JSON argv array: as an array, an escaped `npx … project create --url …`
would have satisfied the positive graders it was trying to cheat past.

`selftest.mjs` covers all of it offline (see below), and `./evals/run.sh --dry-run`
exercises it end to end — it runs each case's `setup.sh`, proves the stub answers, and
proves an `npx` escape is refused and marked — without spending a model token.

## The stub

`_stub/agentiqa` is a node script that answers canned `--json` envelopes shaped
exactly like the real CLI's, with the real exit codes, and appends every invocation
to `.agentiqa-stub-log.jsonl` **in its working directory** — which under
`claude plugin eval` is the run's own sandbox dir, so runs never share a log.

Fixture state per case comes from `EVAL_*` env vars set in `case.yaml`:

| var                           | meaning                                             |
| ----------------------------- | --------------------------------------------------- |
| `EVAL_AGENTIQA_STUB_PROJECTS` | JSON array of pre-existing `{ id, name, defaultUrl }` |
| `EVAL_AGENTIQA_STUB_SELECTED` | id of the remembered project                        |
| `EVAL_AGENTIQA_SERVICE_KEY`   | when set, behave like a pinned service key          |
| `EVAL_AGENTIQA_STUB_LOG`      | override the log path (default: `./.agentiqa-stub-log.jsonl`) |
| `EVAL_AGENTIQA_STUB_STATE`    | override the state path (default: `<log>.state.json`) |

The fixture is the **seed**, not the whole world: `create`, `use` and `update` write
through to the state file, so the next invocation in the same run sees them. Without
that, an agent that creates a project and is then told by `use` / `get` / `list` that
it does not exist stops and reports the contradiction instead of carrying on — which
is the right thing for it to do, and which made `01-create-and-run` unpassable.

It is deliberately strict. An unknown subcommand or an undeclared flag exits 2 the
way the real CLI does, and the rejected flag is recorded as `unknownFlag` so a
grader can assert its absence without enumerating every legal flag. A suite that
only passes because the stub tolerated an invented flag would certify nothing.

## The decoy

Every case's `setup.sh` writes `agentiqa.config.json` and a `.github/workflows/qa.yml`
that name `proj_decoy_do_not_use` — a project id that is NOT reachable from this
account. The skill rule "never grep the customer's repo for a project id;
`agentiqa project list` is the only source of truth" is unfalsifiable in an empty
directory, so the directory is not empty. `decoy-id-never-used` fails the moment
that id reaches the CLI.

## The cases

| case                    | asks                                                          | the failure it exists to catch |
| ----------------------- | ------------------------------------------------------------- | ------------------------------ |
| `01-create-and-run`     | create a project for a URL, then run the login plan           | inventing an id, skipping `--json`, never reusing the minted id, taking the decoy id |
| `02-create-idempotent`  | the same request, but the project already exists              | minting a twin (`shop-staging-2`), or spending a `project list` to find the id `name_conflict` already returned in `existing` |
| `03-switch-and-run`     | switch to the prod project and run `tp_123`                   | running in the remembered staging project, or CREATING a prod project instead of finding it |
| `04-which-project`      | which project am I in, and what is its URL?                   | answering from the repo's config file, or "helpfully" switching/creating in response to a question |

Each case scores the same four hard rules from the skill: JSON-first, no invented
flags, no hand-rolled HTTP to the API, no repo-grepping for ids.

## `selftest.mjs` — why the graders are not vacuous

`claude plugin eval` scores a real agent, which also means a typo'd regex shows up as
a green suite. `selftest.mjs` proves **discrimination** without a model: it drives the
stub through each case's known-good transcript (and its equally-correct variants —
`project use <id>` and `--project <id>` are both right) plus several known-bad ones,
then asserts every good path passes all log-reading graders and every bad path is
caught by at least one. It also drives the hermeticity shims directly: each of the
eight must refuse an `agentiqa` invocation with exit 2 and a log marker, must pass an
unrelated invocation through to a planted fake binary, and — per case — an otherwise
perfect transcript with one `npx -y agentiqa@latest` in it must stop scoring green. It
runs in CI, needs no plugin-eval access, and is the check to run first when editing a
grader or a shim.

## Status

`claude plugin eval` is early-access gated per organization. On a client without
that enablement it refuses with `` `plugin eval` is currently in early access ``
before reading any case, so the scored numbers for this suite are not yet recorded —
see the PR body. Everything else here runs today: `selftest.mjs` is green, the case
files validate against the schema, and the stub is exercised end to end.
