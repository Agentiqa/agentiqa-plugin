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
failure or config error.

## Cloud vs self-hosted (the `runtime` input)

- `cloud` (default) — browser on Agentiqa's cloud, managed LLM. Only `service-key`.
- `self-hosted` — engine in-process on the runner with your own key; requires
  `gemini-api-key`. Chromium downloaded on first use.

```yaml
- uses: agentiqa/qa-action@v1
  with:
    service-key: ${{ secrets.AGENTIQA_SERVICE_KEY }}
    runtime: self-hosted
    gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
```

## Selecting plans and gating

- `plan-id: tplan_…` (one plan) or `label-ids: a,b` (by label); else all plans.
- `fail-on: plan-failure` (default) | `never` (report-only) | `any` (release gate).

## Outputs

`outcome` (`passed`|`plan-failure`|`config-error`|`infra-error`), `exit-code`,
`plans-total`/`plans-passed`/`plans-failed`, and `json-path` (the envelope). Read
them in later steps:

```yaml
- id: qa
  uses: agentiqa/qa-action@v1
  with:
    service-key: ${{ secrets.AGENTIQA_SERVICE_KEY }}
    fail-on: never
- run: jq . "${{ steps.qa.outputs.json-path }}"
```
