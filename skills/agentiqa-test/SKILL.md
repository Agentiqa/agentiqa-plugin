---
name: agentiqa-test
description: >
  Test web apps using Agentiqa. Use when the user asks to test, QA, verify,
  re-check, explore, or find bugs in their app. Two commands: use
  `agentiqa run` for fixed/enumerated/repeatable checks or a regression
  re-check (deterministic saved or local test plan, per-step verification),
  and `agentiqa explore` for open-ended discovery ("find bugs"). IMPORTANT:
  Do NOT explore the codebase or read source files — just run the global
  `agentiqa` CLI directly. NEVER use local repo builds like
  `node apps/cli/dist/cli.js`.
---

# Agentiqa Test Skill

You have access to the `agentiqa` CLI, which drives an independent AI testing agent against **web** apps. It has two commands:

- **`agentiqa run`** — execute a **saved or local test plan**: fixed, enumerated, repeatable `setup`/`action`/`verify` steps with per-step verification. Use for regression re-checks and any "verify these specific things" request.
- **`agentiqa explore`** — **open-ended discovery**: turn the agent loose to find bugs from the UI, no predefined script.

## Choosing the command

Pick by whether the check is scripted:

- **Fixed / enumerated / repeatable steps, or a regression re-check** → **`agentiqa run`**. You (or the user) already know the exact steps and expected outcomes. `run` executes a deterministic test plan and verifies each step. Prefer this whenever the request reads like a checklist (e.g. "log in, add the Pro plan to the cart, verify the total is $19").
- **Open-ended discovery** ("find bugs", "QA this page", "what's broken") → **`agentiqa explore`**. No predefined steps; the agent decides what to try.

Rule of thumb: if you can write the steps down, use `run`; if you're asking the agent to go looking, use `explore`.

## CRITICAL RULES — READ BEFORE DOING ANYTHING

1. **NEVER explore the codebase** — do NOT run `ls`, `find`, `rg`, `cat`, or read any source files. The agentiqa CLI is an external tool, not part of this repo. Go straight to Step 0.
2. **ALWAYS use the global `agentiqa` CLI** — run `agentiqa run ...` / `agentiqa explore ...` directly. NEVER run `node apps/cli/dist/cli.js`, `npx agentiqa`, or any local build from the repo. The globally installed CLI has its own bundled Chromium and dependencies.
3. **Follow the steps below IN ORDER** — do not skip, reorder, or improvise.

## How the agent works

The testing agent:

1. Navigates the app visually (screenshots + actions), like a real user
2. Has NO knowledge of the codebase — works purely from the UI
3. Reports issues (explore) or per-step verdicts (run) with severity, category, confidence, and reproduction steps
4. Self-terminates when done

## Discovery runbook (`agentiqa explore`)

Use this for open-ended bug hunting. For fixed/repeatable checks, jump to the [regression runbook](#regression-runbook-agentiqa-run) instead. Step 0 and Step 1 (auth + Chromium) are shared prerequisites for both commands.

**YOU MUST FOLLOW THESE STEPS IN ORDER. DO NOT SKIP ANY STEP.**

**Step 0: Ensure CLI is installed and authenticated (MANDATORY — run in foreground)**

Run these checks EVERY TIME before launching explore. Do NOT skip.

```bash
# Install CLI if missing (MUST be global install)
command -v agentiqa >/dev/null 2>&1 || npm install -g agentiqa

# Check auth — if not logged in, run login (opens browser)
agentiqa whoami >/dev/null 2>&1 || agentiqa login

# Check ffmpeg for video recording (optional — screenshots work without it)
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[agentiqa] ffmpeg not found — video recording will be disabled. Install with: brew install ffmpeg"
fi
```

YOU MUST RUN BOTH CHECKS AND WAIT FOR THEM TO COMPLETE. If `agentiqa login` opens a browser, wait for the user to complete authentication before proceeding.

**Step 1: Install Chromium (MANDATORY before first explore — run in foreground, wait for it to finish)**

```bash
npx playwright install chromium
```

YOU MUST RUN THIS AND WAIT FOR IT TO COMPLETE BEFORE STEP 2. If you skip this, the explore command wastes 30+ seconds installing Chromium mid-run. On subsequent tests in the same session you can skip this step.

If the install times out or fails due to network restrictions, you may need to approve network access and retry.

**Step 2: Launch explore in BACKGROUND (NEVER foreground — it takes 3-10 minutes and will time out)**

```bash
agentiqa explore "<prompt>" --url <url> --auto-approve --json
```

Run this command in the background. Note the background command output file path.

**Step 3: Monitor until completion**

**CRITICAL SUPER IMPORTANT: Monitoring background commands:**
```bash
while ! grep -q "^Exited with code:" {backgroundCommandOutputFilePath} 2>/dev/null; do sleep 2; done
```

This polls until the process exits. Key on `Exited with code:` (the harness's process-exit marker) rather than a CLI log line — it works identically for both `explore` and `run`. If the foreground monitor times out, just re-run the same `while` command — it will resume waiting.

**Step 4: Read results**

Once the while-loop exits, use `tail` to read the last lines of the background output file. The JSON result will be at the end of stdout.

**IMPORTANT:**
Do NOT use `2>&1` — keep stderr separate so the JSON on stdout stays clean.

### Required

- **prompt** (positional):
  What to test, e.g. `"Test the checkout flow"`

### URL Extraction (CRITICAL)

**If the user's message contains a URL (e.g. `https://...`, `http://...`, `localhost:...`), you MUST extract it and pass it as `--url <extracted-url>`.**
Do NOT put the URL inside the prompt string — it must be a separate `--url` flag.

### Optional Flags

| Flag | Use when... |
|------|------------|
| `--url <url>` | **Always pass** the URL under test (optional only when logged in with a single project) |
| `--feature "<text>"` | Describing what was built (user perspective) |
| `--hint "<text>"` | Suggesting specific things to test (repeatable) |
| `--known-issue "<text>"` | Suppressing known issues (repeatable) |
| `--credential "name:secret"` | Providing login credentials (repeatable) |
| `--model "<provider:model>"` | Driving with a non-default model (e.g. `anthropic:<model>`, `openai:<model>`) |
| `--no-artifacts` | Skipping screenshot/video saving to temp dir |
| `--verbose` | Showing detailed action/observation logs |

### Examples

**Test a web app (ALWAYS use background mode):**

```bash
# Step 1: Launch in background
agentiqa explore "Test the signup flow" --url http://localhost:3001/signup --auto-approve --json

# Step 2: Monitor (replace {backgroundCommandOutputFilePath} with actual path)
while ! grep -q "^Exited with code:" {backgroundCommandOutputFilePath} 2>/dev/null; do sleep 2; done

# Step 3: Read results from the output file
```

**Test with context:**

```bash
agentiqa explore "Test the new checkout" \
  --url http://localhost:3001/checkout \
  --auto-approve --json \
  --feature "Shopping cart checkout with Stripe" \
  --hint "Try invalid card numbers" \
  --hint "Try empty cart" \
  --known-issue "Payment is in test mode"
```

## Reading Results

**stdout** contains JSON (with `--json`, wrapped as `{ "ok": true, "schemaVersion": 1, ... }`):

```json
{
  "summary": "Tested the Settings page. Found 2 issues...",
  "issues": [
    {
      "title": "Save button stays disabled",
      "severity": "high",
      "category": "logical",
      "confidence": 0.9,
      "steps": ["Toggle switch", "Click Save", "Nothing happens"]
    }
  ],
  "actionsTaken": 12,
  "durationSeconds": 68,
  "target": "web",
  "device": null,
  "artifactsDir": "/tmp/agentiqa-abc123",
  "screenshotCount": 8
}
```

The result may also include a `testPlan` array (`[{ text, type, criteria }]`) when the agent drafts steps during exploration. You can save that array inside a plan file (see the [regression runbook](#regression-runbook-agentiqa-run)) to re-run the same flow deterministically with `agentiqa run`.

**Artifacts** are saved by default:

1. Screenshots saved as `screenshot-001.png`, `screenshot-002.png`, etc.
2. When `ffmpeg` is available, an MP4 is also saved and the output includes `videoPath`.
3. Use `--no-artifacts` to disable.

**stderr** contains progress lines (visible in the background task output).

## Presenting Results

After the command completes, read the output and present to the user:

1. **Summary**
   The agent's own narrative
2. **Issues**
   For each issue, show title, severity, category, confidence, and reproduction steps
3. **Artifacts**
   Mention the artifacts directory path so the user can review screenshots/video
4. **Stats**
   Actions taken, duration, target/device

If no issues found, say so — the app looks good!

## Regression runbook (`agentiqa run`)

Use this for fixed/enumerated/repeatable checks and regression re-checks. `agentiqa run` executes a **test plan** — an ordered list of `setup` / `action` / `verify` steps — and reports a pass/fail per plan with per-step verification. Do Step 0 and Step 1 (auth + Chromium) from the discovery runbook first; the local engine needs the same bootstrap.

There are two ways to supply the plan.

### A. Local plan file (best for coding agents)

Write the checklist as a JSON file and run it against a URL. This is the workflow for a coding agent that already knows the steps to verify — no saved project needed.

Minimal valid plan (`plan.json`):

```json
{
  "id": "checkout-regression",
  "projectId": "local",
  "title": "Checkout regression",
  "createdAt": 0,
  "updatedAt": 0,
  "steps": [
    { "type": "setup", "text": "Go to /login and sign in as the seeded test user" },
    { "type": "action", "text": "Add the Pro plan to the cart and open checkout" },
    {
      "type": "verify",
      "text": "Order summary shows the Pro plan at $19",
      "criteria": [{ "check": "A line item reads \"Pro plan\" priced $19", "strict": true }]
    }
  ]
}
```

Field notes (from the engine's plan schema):

- **Required:** `id`, `projectId`, `title`, `steps` (≥ 1), `createdAt`, `updatedAt`. For a local file these are provenance only — `id`/`projectId` can be any string, and `createdAt`/`updatedAt` any epoch-ms number (`0` is fine).
- **Each step:** `text` (required) plus `type` (`setup` | `action` | `verify`). `verify` steps take `criteria: [{ check, strict }]`; `strict: false` downgrades a missed check to a warning instead of a failure.

Run it in the background, monitored exactly like explore:

```bash
agentiqa run --url https://staging.example.com --plan ./plan.json --json
```

`--url` is required with `--plan`. To drive a hosted engine instead of the local in-process one (no local Chromium/ffmpeg install), add `--engine <url>`.

### B. Saved plans by ID or label (service-key / CI mode)

Run plans already saved in an Agentiqa project, authenticated with a service key instead of interactive login:

```bash
AGENTIQA_SERVICE_KEY=sk_… agentiqa run --plan-id <planId>
AGENTIQA_SERVICE_KEY=sk_… agentiqa run --label-ids regression,smoke
```

- `--plan-id <id>` runs one saved plan; `--label-ids a,b,c` runs every plan tagged with any of those labels.
- Get plan IDs and label IDs from the **Test Plans** page in the Agentiqa app — its **CLI** button builds the exact command (see [`../../docs/ci-quickstart.md`](../../docs/ci-quickstart.md)).
- ⚠️ **Footgun:** with a service key and **no** selector (`--plan-id` / `--label-ids`), `run` executes **every plan in the project**. Always pass a selector unless you truly mean to run all of them.

### Reading run results

With `--json`, stdout carries one document: `{ "ok": true, "schemaVersion": 1, "outcome": "passed|failed", "plans": [{ "title", "outcome", "durationSec", "exitCode", "summary"? }] }`. Exit codes are listed under Error Handling.

## Error Handling

If the command fails:

1. **Exit code 0:** Success — all selected plans passed (or explore completed).
2. **Exit code 1:** Plan failure — plans ran and at least one failed (`run`).
3. **Exit code 2:** Usage / configuration error — bad flags, not authenticated, or a selector matched no plans.
4. **Exit code 3:** Infra / runtime error — engine unreachable, auth/exchange failure, or quota block. Safe for CI to retry.
5. **"Gemini API key not found":** Run `agentiqa login` (opens browser for authentication). Do NOT tell the user to do it manually — run it yourself and wait for completion.
6. **Playwright/Chromium missing:** Run `npx playwright install chromium` yourself — do not ask the user to do it manually.
