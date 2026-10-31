# Agentiqa GitHub Action

The public composite action is **`agentiqa/qa-action@v1`**. It wraps `agentiqa run`:
pins the argv, captures the JSON envelope, always uploads artifacts, and gates the
job on the exit code. The full, always-current input/output list is the generated
reference at `https://docs.agentiqa.com/docs/github-action/reference`.

## Minimal

```yaml
- uses: agentiqa/qa-action@v1
  with:
    service-key: ${{ secrets.AGENTIQA_SERVICE_KEY }}
```

Runs all plans in the key's project on Agentiqa Cloud; fails the job on a plan
failure or config error. The browser runs on Agentiqa's infrastructure with the
managed LLM, so the runner needs no Chromium and no LLM key — just the
`service-key`.

## Selecting plans and gating

- `plan-id: tplan_…` (one plan) or `label-ids: a,b` (by label); else all plans.
- `fail-on: plan-failure` (default) | `never` (report-only) | `any` (release gate).

## QA review after the run

`review: true` plus `deployed-sha` (the commit deployed where the plans ran) has QA
Manager review the batch in the same job, after the run, red runs included. The
job needs a full-history checkout of the app's repository (`actions/checkout` with
`fetch-depth: 0`) and a `permissions:` block with both `contents: read` and
`pull-requests: read` (a block sets every scope it does not list to none; without
`contents: read` the checkout fails). A step that fails skips every later step,
the Action included, so a failed checkout means no plans run that night: check
the setup by hand on a day run before the first night, and give steps only the
review needs (the checkout, finding the deployed commit) a `timeout-minutes`. `review-since` sets where
plans without a starting point start: keep it recent. `review-dry-run: true`
adds nothing to the project and sends one copy to the Agentiqa team (first nights). `review-timeout-minutes` (default 30) stops a review
that runs longer. The review runs on Agentiqa's managed model access and never
changes `outcome` or the gate. See `review.md`.

Before the first night, check the setup with a run started by hand: the same step
with `review-only: true` runs no plan, prints one line per prerequisite (`ok` or
`missing`, with the workflow line that fixes it), then reviews the project's latest
finished batch (or `review-batch`) as a dry run. That run fails when a line is
missing. Never suggest `continue-on-error` on the nightly's steps: a step that fails
should fail the night; the check run catches it first. The usual wiring is a
`workflow_dispatch` boolean input `setup-check` and
`review-only: ${{ inputs.setup-check == true }}`.

## Outputs

`outcome` (`passed`|`plan-failure`|`needs-review`|`config-error`|`infra-error`), `exit-code`,
`plans-total`/`plans-passed`/`plans-failed`, `json-path` (the envelope), and
`batch-run-id` (the batch the run recorded). With `review: true`, also
`review-exit-code` (`0` finished / `2` could not run / `3` transient / `124`
stopped at `review-timeout-minutes`), `review-json-path` and `setup-check`
(`ok` / `missing`). Read them in later steps:

```yaml
- id: qa
  uses: agentiqa/qa-action@v1
  with:
    service-key: ${{ secrets.AGENTIQA_SERVICE_KEY }}
    fail-on: never
- run: jq . "${{ steps.qa.outputs.json-path }}"
```
