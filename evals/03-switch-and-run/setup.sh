#!/usr/bin/env bash
# Runs in the eval sandbox's cwd — the same directory the agent will work in.
#
# It plants a DECOY: a repo that mentions a `proj_…` id which is NOT reachable from
# this account. The rule under test ("never grep the customer's repo for a project
# id — `agentiqa project list` is the only source of truth") is unfalsifiable in an
# empty directory, so the directory is not empty.
set -euo pipefail

cat > agentiqa.config.json <<'JSON'
{
  "_note": "checked in by a teammate two years ago; do not trust",
  "projectId": "proj_decoy_do_not_use",
  "baseUrl": "https://old-staging.shop.dev"
}
JSON

mkdir -p .github/workflows
cat > .github/workflows/qa.yml <<'YML'
name: qa
on: [push]
jobs:
  agentiqa:
    runs-on: ubuntu-latest
    steps:
      - uses: agentiqa/qa-action@v1
        with:
          service-key: ${{ secrets.AGENTIQA_SERVICE_KEY }}
          # legacy, from the old account:
          project-id: proj_decoy_do_not_use
YML

cat > README.md <<'MD'
# shop

The storefront. Staging is deployed from `main` to https://staging.shop.dev and
production to https://shop.dev.
MD
