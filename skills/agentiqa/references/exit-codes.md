# Agentiqa CLI exit codes

The `agentiqa` CLI exits per a governed, stable 4-code contract. **Always branch on
the exit code** for pass/fail — it is independent of the JSON envelope.

| Code | Meaning                                                                                                                                                                                                                             | Retry?                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `0`  | Success — all selected plans passed (or nothing to run).                                                                                                                                                                            | —                          |
| `1`  | Plan failure — plans ran, at least one failed. A real quality signal.                                                                                                                                                               | No                         |
| `2`  | Usage / configuration error — bad flags, not authenticated, a selector that matched no plans, **or an account / plan-limit block** (`org_cap_exhausted`, `credits_exhausted`, … — account state, retrying won't help). Nothing ran. | No                         |
| `3`  | Infra / runtime error — engine unreachable, a lost engine connection (`engine_disconnect` / `engine_failure`), an auth failure, an unexpected error. Nothing reached a verdict.                                                     | **Yes**, after a run check |

**`project` verbs never exit `1`.** Exit 1 is reserved for a real plan verdict from
`run`, so `agentiqa project create|use|current|get|update` uses only `0` / `2` / `3`.
Their failures carry a stable `error.code` in the JSON envelope
(`name_conflict`, `not_found`, `owner_only`, `stale_write`, `service_key_*`, …) — branch
on that once the exit code told you it is a `2`. See `cli-projects.md`.

The `1` vs `3` split is deliberate: `1` is a genuine test failure to investigate;
`3` is transient and safe to retry. Retry only on `3`:

**A lost connection does not by itself mean exit `3` (since CLI v1.1.49).** When a
plan's connection to the engine dies before the result arrives, the CLI reads that
attempt's own run record and adopts an already-recorded terminal verdict (exit `0`/`1`)
instead of reporting a disconnect. Only an attempt with no recorded terminal state
stays exit `3`, so the retry loop below never re-executes a plan that already finished.

```bash
for attempt in 1 2 3; do
  npx -y agentiqa@latest run
  code=$?
  # 0 pass, 1 plan failure (do NOT retry), 2 usage error (do NOT retry)
  [ "$code" -ne 3 ] && exit "$code"
  echo "Infra error (exit 3) on attempt $attempt — retrying…"
  sleep 15
done
exit 3
```

## Exit 2 from an account limit

With `--json`, a pre-run account block is exit `2` with the server's reason as `error.code`. Tell the user what it means instead of retrying or editing the workflow:

- `org_cap_exhausted` — the organization's run credits are used up or have expired. Only Agentiqa can renew them: tell the user to contact Agentiqa support. The CLI's own message may still call it a monthly limit for the organization admin to raise; an org admin cannot add credits.
- `credits_exhausted` — the account's included usage and credit balance are used up: upgrade the plan (or buy credits where the plan offers them) from the limit dialog in the web app, or wait for the next monthly window.
- Any other quota/plan-limit `error.code` — same class (exit `2`, retry cannot clear it); relay `error.message`.

## Exit 3: check the run before re-running

Exit `3` is never a verdict about the app. Plans that did not reach one carry `outcome: "engine_disconnect"` (the CLI lost the connection; the run may still have finished server-side), `"engine_failure"` (the engine session is gone, e.g. its machine restarted), `"error"`, or `"dependency_blocked"` (an upstream plan's run memory never arrived). If the run never started (engine unreachable, auth exchange failure, the plan already running), there are no `plans` at all: the failure envelope's `error.code` says why (`run_error`, or a specific reason such as `plan_run_active`). A retry is safe, but first:

1. `agentiqa runs get <plan-id> --json` — if the interrupted run reached a final result after the disconnect, report that result instead of re-running. A run still shown as running long after the CLI exited was cut off.
2. A run cut off part-way may already have created data in the app under test. Say so to the user before re-running a plan that creates records; plans built on `{{timestamp}}` / `{{unique}}` names create distinct data on each run.

## GitHub Action mapping

The Action maps exits to `outcome` buckets: `0` (valid envelope, ≥1 plan) →
`passed`; `0` with zero plans or no valid envelope → `config-error`; `1` →
`plan-failure`; `2`/unknown → `config-error`; `3` → `infra-error`, except `3`
with the envelope's `outcome: "needs-review"` → `needs-review` (no plan failed,
but some plan has steps that need a person's review: not a pass). `fail-on:
plan-failure` (default) fails on plan-failure, needs-review and config-error and
swallows retryable infra-error; `fail-on: any` gates on anything nonzero; only
`fail-on: never` lets needs-review through.
