# Eval suite — does a coding agent drive the project verbs correctly?

These cases score the thing the skills exist to change: **what an agent actually
types** when a user asks it to create a project, switch project, or say which one is
in use. They grade the recorded argv, not the prose the agent writes about itself.

```bash
./evals/run.sh                       # the whole suite
./evals/run.sh --case '02-*'         # one case
./evals/run.sh --runs 1 --verbose    # quick iteration
node evals/selftest.mjs --verbose    # graders only — no model, no network, no gate
```

## How to run it

```bash
./evals/run.sh [extra flags forwarded to `claude plugin eval`]
```

Do not call `claude plugin eval` directly unless you replicate what the wrapper does,
because two things are not expressible in a case file:

1. **PATH.** The skills tell the agent to type `agentiqa`, so the stub must be on
   PATH under that name. `execution.env` in a `case.yaml` only accepts keys matching
   `/^EVAL_[A-Z0-9_]*$/` — `PATH` is rejected outright — but the agent subprocess
   inherits the operator's environment, so `run.sh` prepends `evals/_stub` there and
   then asserts that `command -v agentiqa` resolves to the stub. Without that guard a
   real CLI on PATH would answer, and the eval would hit a live account.
2. **`--scaffold`.** Off by default (it runs author-supplied bash as you). Each case's
   `setup.sh` plants a decoy repo, and without it two graders become unfalsifiable.

The equivalent by hand:

```bash
export PATH="$PWD/evals/_stub:$PATH"
command -v agentiqa   # must print .../evals/_stub/agentiqa
claude plugin eval "$PWD" --eval-dir evals --scaffold --allow-tools Bash Read Grep Glob
```

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
caught by at least one. It runs in CI, needs no plugin-eval access, and is the check
to run first when editing a grader.

## Status

`claude plugin eval` is early-access gated per organization. On a client without
that enablement it refuses with `` `plugin eval` is currently in early access ``
before reading any case, so the scored numbers for this suite are not yet recorded —
see the PR body. Everything else here runs today: `selftest.mjs` is green, the case
files validate against the schema, and the stub is exercised end to end.
