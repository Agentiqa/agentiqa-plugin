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
- Navigates the app visually (screenshots + actions), like a real user
- Has NO knowledge of the codebase — finds bugs purely from the UI
- Reports issues with severity, category, confidence, and reproduction steps
- Self-terminates when done exploring

## Running a Test

**Run exactly ONE command with `run_in_background: true`. The CLI auto-starts its own engine, auto-detects devices, and auto-loads the API key.**

```bash
agentiqa explore "<prompt>" --auto-approve [flags]
```

**CRITICAL:** Always pass `--auto-approve` when invoking this CLI. Without it, the CLI pauses on two interactive "Press Enter to approve" checkpoints (scope + findings) and the background task will appear to hang waiting on stdin. There is no human at the terminal to press Enter.

**IMPORTANT:** Do NOT use `2>&1` — keep stderr separate so the JSON on stdout stays clean.

### Required
- **prompt** (positional): What to test, e.g. `"Test the checkout flow"`
- **`--auto-approve`**: Required for non-interactive agent invocation (see above)

### URL Extraction (CRITICAL)

**If the user's message contains a URL OR a bare hostname, you MUST extract it and pass it as `--url <extracted-url>`.** Do NOT put the URL inside the prompt string — it must be a separate `--url` flag. Without `--url`, the CLI cannot detect the web target, hard-errors with `--url is required for web testing`, or falls back to full device discovery mode (3–5x slower).

Extraction rules:

- **URL with protocol** (`https://foo.bar/path`, `http://foo.bar`) → pass verbatim.
- **`localhost[:PORT][/path]`** → prefix with `http://`. Example: `localhost:3000/checkout` → `http://localhost:3000/checkout`.
- **Bare hostname with at least one dot** (`example.com`, `acme.io`, `foo.bar.baz`, with optional `/path`) → prefix with `https://`. Example: `example.com` → `https://example.com`; `acme.io/login` → `https://acme.io/login`.
- **IPv4 with port** (`127.0.0.1:8080/path`) → prefix with `http://`.

Examples:

- *"test example.com for bugs"* → `--url https://example.com`
- *"QA acme.io/login"* → `--url https://acme.io/login`
- *"test my app at localhost:3000/checkout"* → `--url http://localhost:3000/checkout`
- *"test https://example.com/login for bugs"* → `--url https://example.com/login`

Full command shape:

```bash
agentiqa explore "Test the login page for bugs" --url https://example.com/login --auto-approve
```

### Auto-Detection
When no `--target` is specified, the CLI auto-detects running Android emulators and iOS simulators. You do NOT need to specify `--target`, `--package`, or `--device` — just provide the prompt.

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
| `--json` | Emit raw JSON for checkpoints too (cleaner for machine parsing) |
| `--no-artifacts` | Skipping screenshot/video saving to temp dir |
| `--verbose` | Showing detailed action/observation logs |

### Examples

**Test whatever's on the mobile screen:**
```bash
agentiqa explore "Test the Settings screen" --auto-approve
```

**Test a web app:**
```bash
agentiqa explore "Test the signup flow" --url http://localhost:3001/signup --auto-approve
```

**Test with context:**
```bash
agentiqa explore "Test the new checkout" \
  --url http://localhost:3001/checkout \
  --auto-approve \
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
- **Classic mode**: Screenshots saved as `screenshot-001.png`, `screenshot-002.png`, etc.
- **Realtime mode**: MP4 video saved as `recording.mp4` (output includes `videoPath` instead of `screenshotCount`)
- Use `--no-artifacts` to disable

**stderr** contains progress lines (visible in the background task output).

## Presenting Results

After the command completes, read the output and present to the user:
1. **Summary** — the agent's own narrative
2. **Issues** — for each issue, show title, severity, category, confidence, and reproduction steps
3. **Artifacts** — mention the artifacts directory path so the user can review screenshots/video
4. **Stats** — actions taken, duration, target/device

If no issues found, say so — the app looks good!

## Error Handling

If the command fails:
- **Exit code 2**: Invalid arguments — check the flags
- **Exit code 1**: Engine/session error — check stderr for details
- **"Gemini API key not found"**: Tell the user to run `agentiqa login` or `export GEMINI_API_KEY=...`
- **"No mobile devices detected"**: Tell the user to start an emulator/simulator
