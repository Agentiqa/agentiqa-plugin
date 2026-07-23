# Agentiqa CLI exit codes

The `agentiqa` CLI exits per a governed, stable 4-code contract. **Always branch on
the exit code** for pass/fail — it is independent of the JSON envelope.

| Code | Meaning                                                                                                                                                                             | Retry?  |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `0`  | Success — all selected plans passed (or nothing to run).                                                                                                                            | —       |
| `1`  | Plan failure — plans ran, at least one failed. A real quality signal.                                                                                                               | No      |
| `2`  | Usage / configuration error — bad flags, not authenticated, a selector that matched no plans, **or a quota / plan-limit block** (account state — retrying won't help). Nothing ran. | No      |
| `3`  | Infra / runtime error — engine unreachable, an auth failure, an unexpected error. Nothing reached a verdict.                                                                        | **Yes** |

The `1` vs `3` split is deliberate: `1` is a genuine test failure to investigate;
`3` is transient and safe to retry. Retry only on `3`:

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

## GitHub Action mapping

The Action maps exits to `outcome` buckets: `0` (valid envelope, ≥1 plan) →
`passed`; `0` with zero plans or no valid envelope → `config-error`; `1` →
`plan-failure`; `2`/unknown → `config-error`; `3` → `infra-error`. `fail-on:
plan-failure` (default) fails on plan-failure and config-error and swallows
retryable infra-error; `fail-on: any` gates on anything nonzero.
