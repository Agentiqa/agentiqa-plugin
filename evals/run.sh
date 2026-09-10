#!/usr/bin/env bash
# Run the plugin's eval suite against the RECORDING STUB CLI (no network, no account).
#
# The stub has to be reachable as plain `agentiqa`, because that is what the skills
# tell the agent to type. `claude plugin eval` cannot set PATH from a case file — its
# `execution.env` only accepts /^EVAL_[A-Z0-9_]*$/ keys — but it DOES inherit the
# operator's environment, so PATH is prepended here instead.
#
#   ./evals/run.sh                       # all cases
#   ./evals/run.sh --case '02-*'         # one case
#   ./evals/run.sh --runs 1 --verbose    # quick iteration
#
# Any extra arguments are forwarded to `claude plugin eval`.
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# 1. The stub shadows any real `agentiqa` on PATH. Guard against the reverse: a real
#    CLI reached during an eval would hit a live account.
export PATH="${PLUGIN_ROOT}/evals/_stub:${PATH}"
resolved="$(command -v agentiqa || true)"
if [ "$resolved" != "${PLUGIN_ROOT}/evals/_stub/agentiqa" ]; then
  echo "refusing to run: \`agentiqa\` resolves to '${resolved:-<none>}', not the eval stub" >&2
  exit 2
fi

# 2. Prove the graders still discriminate before spending model tokens on them.
node "${PLUGIN_ROOT}/evals/selftest.mjs"

# 3. --scaffold is required: each case's setup.sh plants the decoy repo that makes
#    "never take a project id from the customer's repo" a testable claim.
exec claude plugin eval "$PLUGIN_ROOT" \
  --eval-dir evals \
  --scaffold \
  --allow-tools Bash Read Grep Glob \
  "$@"
