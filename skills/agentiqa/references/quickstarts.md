# Agentiqa quickstarts (all four surfaces)

## CLI

Needs Node.js 18+ (Node 20 recommended).

```bash
# Ad-hoc: agent explores a URL and reports findings
npx -y agentiqa@latest explore "Find bugs on this page" --url https://example.com

# CI: replay saved plans on the hosted engine (deterministic pass/fail)
AGENTIQA_SERVICE_KEY=sk_... npx -y agentiqa@latest run --engine https://engine.agentiqa.com
```

## GitHub Action

1. Mint a service key (see `service-keys.md`) and add it as the repo secret
   `AGENTIQA_SERVICE_KEY`.
2. Add a workflow:

```yaml
name: Agentiqa QA
on: [workflow_dispatch]
jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: agentiqa/qa-action@v1
        with:
          service-key: ${{ secrets.AGENTIQA_SERVICE_KEY }}
```

Detail: `github-action.md`.

## Web app

Cloud execution, nothing to install:

1. Open `https://web.agentiqa.com` and sign in.
2. Create a project with the URL of the app to test.
3. Open the Assistant and ask, e.g. "Test the signup flow." Curate the scope/plan/
   findings checkpoints.

Cannot test `localhost` (the cloud engine can't reach your machine — use the CLI
in-process engine or the desktop app for local targets).

## Desktop app

Built-in headed browser, full capability, can test `localhost`:

1. Download from `https://agentiqa.com`, install, sign in.
2. Create a project (a `http://localhost:…` URL works) and ask the Assistant to
   test it — watch the agent drive the browser.
