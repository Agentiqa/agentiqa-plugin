---
name: agentiqa-test
description: >
  Test web and mobile apps using Agentiqa. Use when the user asks to test,
  QA, explore, or find bugs in their app. Runs an independent AI testing
  agent that navigates the app visually like a real user.
---

# Agentiqa Test Skill

You have access to `agentiqa explore` — a CLI that launches an independent AI testing agent to find bugs in web and mobile apps.

## How It Works

The testing agent:

1. Navigates the app visually (screenshots + actions), like a real user
2. Has NO knowledge of the codebase — finds bugs purely from the UI
3. Reports issues with severity, category, confidence, and reproduction steps
4. Self-terminates when done exploring

## Running a Test

**YOU MUST FOLLOW THESE STEPS IN ORDER. DO NOT SKIP ANY STEP.**

**Step 0: Ensure CLI is installed and authenticated (MANDATORY — run in foreground)**

Run these checks EVERY TIME before launching explore. Do NOT skip. Do NOT use `npx --yes agentiqa` as a substitute — the CLI must be globally installed.

```bash
# Install CLI if missing
command -v agentiqa >/dev/null 2>&1 || npm install -g agentiqa

# Check auth — if not logged in, run login (opens browser)
agentiqa whoami >/dev/null 2>&1 || agentiqa login
```

YOU MUST RUN BOTH CHECKS AND WAIT FOR THEM TO COMPLETE. If `agentiqa login` opens a browser, wait for the user to complete authentication before proceeding.

**Step 1: Install Chromium (MANDATORY before first explore — run in foreground, wait for it to finish)**

```bash
npx playwright install chromium
```

YOU MUST RUN THIS AND WAIT FOR IT TO COMPLETE BEFORE STEP 2. If you skip this, the explore command wastes 30+ seconds installing Chromium mid-run. On subsequent tests in the same session you can skip this step.

**Step 2: Launch explore in BACKGROUND (NEVER foreground — it takes 3-10 minutes and will time out)**

```bash
agentiqa explore "<prompt>" --url <url> --auto-approve --json
```

Run this command in the background. Note the background command output file path.

**Step 3: Monitor until completion**

**CRITICAL SUPER IMPORTANT: Monitoring background commands:**
```bash
while ! grep -q "\[agentiqa\] Done" {backgroundCommandOutputFilePath} 2>/dev/null && ! grep -q "^Exited with code:" {backgroundCommandOutputFilePath} 2>/dev/null; do sleep 2; done
```

This polls until the CLI prints its `[agentiqa] Done` line OR the process exits. If the foreground monitor times out, just re-run the same `while` command — it will resume waiting.

**Step 3: Read results**

Once the while-loop exits, use `tail` to read the last lines of the background output file. The JSON result will be at the end of stdout.

**IMPORTANT:**
Do NOT use `2>&1` — keep stderr separate so the JSON on stdout stays clean.

### Required

- **prompt** (positional):
  What to test, e.g. `"Test the checkout flow"`

### URL Extraction (CRITICAL)

**If the user's message contains a URL (e.g. `https://...`, `http://...`, `localhost:...`), you MUST extract it and pass it as `--url <extracted-url>`.**
Do NOT put the URL inside the prompt string — it must be a separate `--url` flag.

### Auto-Detection

When no `--target` is specified, the CLI auto-detects running Android emulators and iOS simulators.
You do NOT need to specify `--target`, `--package`, or `--device` — just provide the prompt.

### Optional Flags

| Flag | Use when... |
|------|------------|
| `--url <url>` | Testing a web app — **always pass when user provides a URL** |
| `--target android\|ios\|web` | Forcing a specific platform |
| `--package <name>` | Launching a specific Android app before testing |
| `--bundle-id <id>` | Launching a specific iOS app before testing |
| `--feature "<text>"` | Describing what was built (user perspective) |
| `--hint "<text>"` | Suggesting specific things to test (repeatable) |
| `--known-issue "<text>"` | Suppressing known issues (repeatable) |
| `--credential "name:secret"` | Providing login credentials (repeatable) |
| `--realtime` | Using realtime agent for mobile (default: classic) |
| `--no-orchestrator` | Bypassing orchestrator in realtime mode |
| `--no-artifacts` | Skipping screenshot/video saving to temp dir |
| `--verbose` | Showing detailed action/observation logs |

### Examples

**Test a web app (ALWAYS use background mode):**

```bash
# Step 1: Launch in background
agentiqa explore "Test the signup flow" --url http://localhost:3001/signup --auto-approve --json

# Step 2: Monitor (replace {backgroundCommandOutputFilePath} with actual path)
while ! tail -n 2 {backgroundCommandOutputFilePath} | grep -q "^Exited with code:"; do sleep 1; done

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

**stdout** contains JSON:

```json
{
  "summary": "Tested the Settings screen. Found 2 issues...",
  "issues": [
    {
      "title": "Save button stays disabled",
      "severity": "high",
      "category": "logical",
      "confidence": 0.9,
      "steps": ["Toggle switch", "Tap Save", "Nothing happens"]
    }
  ],
  "actionsTaken": 12,
  "durationSeconds": 68,
  "target": "android",
  "device": "emulator-5554",
  "artifactsDir": "/tmp/agentiqa-abc123",
  "screenshotCount": 8
}
```

**Artifacts** are saved by default:

1. **Classic mode:**
   Screenshots saved as `screenshot-001.png`, `screenshot-002.png`, etc.
2. **Realtime mode:**
   MP4 video saved as `recording.mp4` (output includes `videoPath` instead of `screenshotCount`)
3. Use `--no-artifacts` to disable

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

## Error Handling

If the command fails:

1. **Exit code 2:**
   Invalid arguments — check the flags
2. **Exit code 1:**
   Engine/session error — check stderr for details
3. **"Gemini API key not found":**
   Run `agentiqa login` (opens browser for authentication). Do NOT tell the user to do it manually — run it yourself and wait for completion.
4. **"No mobile devices detected":**
   Tell the user to start an emulator/simulator
5. **Playwright/Chromium missing:**
   Run `npx playwright install chromium` yourself — do not ask the user to do it manually.
