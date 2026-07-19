# Agentiqa JSON result envelope

Add `--json` (or set `AG_OUTPUT=json`) to make `agentiqa run` / `agentiqa explore`
emit exactly **one JSON document on stdout**. It is a governed, versioned contract:
every document carries `"schemaVersion": 1` at the top level.

- All logs go to **stderr**; stdout is only the JSON (no banners, no ANSI). `stdout
| jq` is always safe. Capture it with `> result.json`.
- The **exit code is independent** of the envelope — branch on the exit code for
  pass/fail (see `exit-codes.md`); use the JSON for detail.
- `--format text` overrides `AG_OUTPUT=json`.

## Success (`ok: true`)

```json
{
  "ok": true,
  "schemaVersion": 1,
  "outcome": "passed",
  "plans": [
    {
      "title": "Checkout flow",
      "outcome": "passed",
      "durationSec": 42,
      "exitCode": 0,
      "runUrl": "https://web.agentiqa.com/projects/…/history/run_…",
      "videoUrl": "https://assets.agentiqa.com/e2e-videos/…/checkout.mp4"
    },
    { "title": "Login", "outcome": "failed", "durationSec": 18, "exitCode": 1, "summary": "…" }
  ]
}
```

- `outcome` is `"passed"` only when every plan passed, else `"failed"`.
- Each `plans[]` entry has `title`, `outcome`, `durationSec`, `exitCode`, and an
  optional `summary`.
- When artifacts are captured, an entry may also carry `runUrl`, `videoUrl`,
  `videoPath`, `artifactDir`, and — with `--share` — a public `shareUrl`. Each is
  present **only** when available (omitted, never `null`).

## Failure (`ok: false`)

Emitted for usage errors and thrown infra/runtime errors:

```json
{ "ok": false, "schemaVersion": 1, "error": { "code": "run_error", "message": "…" } }
```

## Parse example

```bash
npx -y agentiqa@latest run --engine https://engine.agentiqa.com --json > result.json
code=$?
jq -r '.plans[] | "\(.outcome)\t\(.title)"' result.json || cat result.json
exit "$code"
```
