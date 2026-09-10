#!/usr/bin/env bash
# Run the plugin's eval suite against the RECORDING STUB CLI — hermetically.
#
#   ./evals/run.sh                       # all cases
#   ./evals/run.sh --case '02-*'         # one case (glob over case directory names)
#   ./evals/run.sh --runs 1 --verbose    # quick iteration
#   ./evals/run.sh --dry-run             # setup + hermeticity only; spends no model tokens
#
# Any argument other than --case/--dry-run is forwarded to `claude plugin eval`.
#
# ── why this wrapper is not optional ────────────────────────────────────────
#
# Two things a case.yaml cannot express, and four things it must not be trusted
# with. `claude plugin eval` inherits the operator's environment, which is the
# only lever there is, so all six are set up here.
#
#   1. PATH — the stub must answer to plain `agentiqa`, because that is what the
#      skills tell the agent to type. `execution.env` only accepts keys matching
#      /^EVAL_[A-Z0-9_]*$/, so PATH is rejected outright.
#   2. --scaffold — off by default (it runs author-supplied bash as you). Each
#      case's setup.sh plants the decoy repo that makes two graders falsifiable.
#   3. HOME — isolated to a throwaway directory, so no real
#      ~/.agentiqa/credentials.json can be read and no ~/.agentiqa/config.json
#      can be written. Re-asserted after every case against a fingerprint of the
#      operator's real ~/.agentiqa.
#   4. Package-runner and HTTP shims — `npx`/`npm`/`pnpm`/`yarn`/`bunx`/
#      `corepack`/`curl`/`wget` refuse anything mentioning "agentiqa".
#   5. AGENTIQA_API_URL — pointed at dead loopback port 9, and the ambient
#      credentials unset, so an escaped real CLI still reaches no backend.
#   6. selftest.mjs — proves the graders still discriminate before model tokens
#      are spent on them.
#
# 3-5 exist because they were earned: in a headless eval run the agent under test
# escaped the stub with `npx -y agentiqa@latest`, listed 16 of the operator's live
# projects and rewrote their ~/.agentiqa/config.json. The skill text was fixed —
# but a harness that has to TRUST the agent under test is not measuring it, so
# these three make the fix unnecessary rather than load-bearing.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVAL_DIR="${PLUGIN_ROOT}/evals"
STUB_DIR="${EVAL_DIR}/_stub"
SHIM_DIR="${EVAL_DIR}/_shim"
SHIMMED='npx npm pnpm yarn bunx corepack curl wget'

die() {
  printf 'evals/run.sh: %s\n' "$*" >&2
  exit 2
}

# ── arguments ───────────────────────────────────────────────────────────────
# --case and --dry-run are consumed here; the rest goes to `claude plugin eval`.

CASE_GLOB='*'
DRY_RUN=0
FORWARD=()
while [ $# -gt 0 ]; do
  case "$1" in
    --case)
      [ $# -ge 2 ] || die '--case needs a glob'
      CASE_GLOB="$2"
      shift 2
      ;;
    --case=*)
      CASE_GLOB="${1#--case=}"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      FORWARD+=("$1")
      shift
      ;;
  esac
done

# ── 1. an isolated HOME ─────────────────────────────────────────────────────
# The agentiqa CLI resolves ~/.agentiqa through $HOME (node's os.homedir()), so
# moving HOME moves the account. Claude Code's own config is pinned back to the
# real one — CLAUDE_CONFIG_DIR isolation is known not to work here (auth is
# keychain-scoped and the run dies on "Not logged in").

REAL_HOME="$HOME"
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-${REAL_HOME}/.claude}"

SANDBOX_HOME="$(mktemp -d "${TMPDIR:-/tmp}/agentiqa-eval-home.XXXXXX")"
SANDBOX_DIRS=("$SANDBOX_HOME")
cleanup() { rm -rf "${SANDBOX_DIRS[@]}"; }
trap cleanup EXIT
export HOME="$SANDBOX_HOME"

hash_stdin() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256
  else
    sha256sum
  fi
}

# A hash of `ls -laR ~/.agentiqa` as the operator really has it — names, sizes and
# mtimes — plus the BYTES of the two files that are the account itself, so that a
# rewrite which preserved the mtime would still move the hash.
#
# Three classes of line are dropped, and each exclusion is a false positive that
# was actually observed rather than a precaution:
#
#   `.` / `..`   the `..` entry carries the HOME directory's mtime, which changes
#                for reasons that have nothing to do with Agentiqa
#   `total N`    an aggregate over the excluded files below
#   VOLATILE_RE  local telemetry and update-check scratch. `events-queue.ndjson`
#                is appended by any agentiqa process alive on the machine, and
#                `plugin-latest-version` is written by THIS plugin's own
#                session-start hook. They carry no account state, and leaving
#                them in makes the assertion cry wolf on every second run — which
#                is how a real breach gets waved through.
VOLATILE_RE=' (events-queue\.ndjson|analytics\.json|update-check\.json|plugin-latest-version)$'

real_account_fingerprint() {
  {
    if [ -d "${REAL_HOME}/.agentiqa" ]; then
      ls -laR "${REAL_HOME}/.agentiqa" 2>/dev/null |
        grep -v -E '^total ' |
        grep -v -E ' (\.|\.\.)$' |
        grep -v -E "$VOLATILE_RE" || true
      for f in config.json credentials.json; do
        printf '%s ' "$f"
        if [ -f "${REAL_HOME}/.agentiqa/${f}" ]; then
          hash_stdin <"${REAL_HOME}/.agentiqa/${f}"
        else
          printf '<absent>\n'
        fi
      done
    else
      printf '<absent>\n'
    fi
  } | hash_stdin | awk '{print $1}'
}

BASELINE="$(real_account_fingerprint)"

assert_account_untouched() {
  local where="$1" now
  now="$(real_account_fingerprint)"
  [ "$now" = "$BASELINE" ] && return 0
  cat >&2 <<MSG

╭──────────────────────────────────────────────────────────────────────────────
│ HERMETICITY BREACH — ${REAL_HOME}/.agentiqa CHANGED during ${where}
│
│ Something in this run reached the operator's real Agentiqa account: a name,
│ size or mtime moved, or config.json / credentials.json changed byte for byte.
│ Local telemetry is excluded from the fingerprint, so this is not noise. Treat
│ the suite's numbers as void, and inspect:
│
│   ls -laR ${REAL_HOME}/.agentiqa
│   cat ${REAL_HOME}/.agentiqa/config.json
│
│ Expected fingerprint ${BASELINE}
│ Observed fingerprint ${now}
╰──────────────────────────────────────────────────────────────────────────────
MSG
  exit 3
}

# ── 2. PATH: the stub, and the shims that stop anything reaching around it ──

export PATH="${SHIM_DIR}:${STUB_DIR}:${PATH}"

resolved="$(command -v agentiqa || true)"
[ "$resolved" = "${STUB_DIR}/agentiqa" ] ||
  die "\`agentiqa\` resolves to '${resolved:-<none>}', not the eval stub"

for tool in $SHIMMED; do
  resolved="$(command -v "$tool" || true)"
  [ "$resolved" = "${SHIM_DIR}/${tool}" ] ||
    die "\`${tool}\` resolves to '${resolved:-<none>}', not the hermetic shim (is ${SHIM_DIR}/${tool} executable?)"
done

# ── 3. no reachable backend, no ambient credentials ─────────────────────────
# Port 9 is discard: a connection there is refused, never answered. The stub
# reads EVAL_-prefixed fixtures, so clearing the bare names costs it nothing.

export AGENTIQA_API_URL='http://127.0.0.1:9'
unset AGENTIQA_SERVICE_KEY AGENTIQA_PROJECT_ID AGENTIQA_API_KEY AGENTIQA_TOKEN

# ── 4. prove the graders still discriminate ─────────────────────────────────

node "${EVAL_DIR}/selftest.mjs"

# ── 5. the cases ────────────────────────────────────────────────────────────

CASES=()
for dir in "${EVAL_DIR}"/*/; do
  name="$(basename "$dir")"
  [ -f "${dir}case.yaml" ] || continue
  # shellcheck disable=SC2254 — the glob is the point
  case "$name" in
    $CASE_GLOB) CASES+=("$name") ;;
  esac
done
[ ${#CASES[@]} -gt 0 ] || die "no case matches --case '${CASE_GLOB}'"

# What `--dry-run` buys: every hermeticity guard is exercised for real (the
# case's setup.sh runs, the stub answers, the shim refuses and lands its marker
# in the log the graders read), and not one model token is spent.
dry_run_case() {
  local name="$1" sandbox out rc
  sandbox="$(mktemp -d "${TMPDIR:-/tmp}/agentiqa-eval-dry.XXXXXX")"
  SANDBOX_DIRS+=("$sandbox")

  ( cd "$sandbox" && bash "${EVAL_DIR}/${name}/setup.sh" ) ||
    die "${name}: setup.sh failed"

  ( cd "$sandbox" && agentiqa project list --json >/dev/null ) ||
    die "${name}: the stub did not answer \`agentiqa project list --json\`"

  rc=0
  out="$( cd "$sandbox" && npx -y agentiqa@latest project list --json 2>&1 )" || rc=$?
  [ "$rc" -eq 2 ] || die "${name}: the npx shim did not refuse (exit ${rc})"
  printf '%s' "$out" | grep -q 'hermetic eval: real CLI forbidden' ||
    die "${name}: the npx shim refused without the expected message"
  grep -q 'hermeticViolation' "${sandbox}/.agentiqa-stub-log.jsonl" ||
    die "${name}: the refusal left no grader-visible marker in the stub log"

  printf '  dry-run %-22s scaffold ok · stub ok · shim refused and marked\n' "$name"
  printf '          sandbox %s\n' "$sandbox"
  printf '          %s\n' "$(cd "$sandbox" && ls -A | tr '\n' ' ')"
}

printf 'hermetic eval · HOME=%s · AGENTIQA_API_URL=%s\n' "$HOME" "$AGENTIQA_API_URL"
printf '                real account fingerprint %s\n\n' "$BASELINE"

status=0
for name in "${CASES[@]}"; do
  if [ "$DRY_RUN" -eq 1 ]; then
    dry_run_case "$name"
  else
    # --scaffold is required: setup.sh plants the decoy repo that makes "never
    # take a project id from the customer's repo" a testable claim.
    claude plugin eval "$PLUGIN_ROOT" \
      --eval-dir evals \
      --scaffold \
      --case "$name" \
      --allow-tools Bash Read Grep Glob \
      ${FORWARD[@]+"${FORWARD[@]}"} || status=$?
  fi
  assert_account_untouched "case ${name}"
done

assert_account_untouched 'the suite'
printf '\nhermetic: %s/.agentiqa untouched across %d case(s).\n' "$REAL_HOME" "${#CASES[@]}"
exit "$status"
