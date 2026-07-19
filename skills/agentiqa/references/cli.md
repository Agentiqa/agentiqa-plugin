# Agentiqa CLI reference (essentials)

Commands: `explore`, `run`, `login`, `logout`, `whoami`. The authoritative,
always-current flag list is the generated reference at
`https://docs.agentiqa.com/docs/cli/reference` (or append `.md`).

## explore

```
agentiqa explore "<prompt>" [flags]
```

Agent-led discovery of a web URL; reports findings. Key flags:

- `--url <url>` — the target (optional when logged in with a single project).
- `--feature <text>`, `--hint <text>` (repeatable), `--known-issue <text>`
  (repeatable) — steer what to test / not report.
- `--credential <name:secret>` (repeatable) — a login credential for the agent.
- `--auto-approve` — auto-approve checkpoints (required non-interactively).
- `--json` / `--format <text|json>` — machine output.
- `--model <provider:model>` — BYOK (`google`|`anthropic`|`openai`); non-Google is
  Company-plan only.

## run

```
agentiqa run [--url <url> --plan <path.json>] [flags]
```

Replays saved plans; deterministic pass/fail. Key flags:

- `--plan-id <id>` — one saved plan; `--label-ids <a,b,c>` — plans by label (csv);
  neither → all plans in the service key's project.
- `--mode <sequential|parallel>` (default sequential).
- `--engine <url>` — hosted engine (else in-process); `--artifacts-dir <path>`.
- `--share` — mint a public share link per cloud run (adds `shareUrl` to the
  envelope). Also `AG_SHARE=1`.
- `--json` / `AG_OUTPUT=json` — see `json-envelope.md`.

## Auth commands

`agentiqa login` (opens browser) / `logout` / `whoami`. For unattended/CI use, set
`AGENTIQA_SERVICE_KEY` instead of logging in (see `service-keys.md`).

## Engine modes

- No `--engine`: in-process engine — downloads Chromium, can test `localhost`,
  needs `GEMINI_API_KEY` for the default Google model (BYOK).
- `--engine https://engine.agentiqa.com`: hosted cloud engine, managed LLM, no
  local Chromium; `AGENTIQA_SERVICE_KEY` alone authenticates.

## Key environment variables

`AGENTIQA_SERVICE_KEY` (CI auth), `AGENTIQA_API_URL` (control-plane override),
`GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (BYOK), `AG_OUTPUT`
(`json`), `AG_SHARE`. Full list: the generated CLI reference (link above).
