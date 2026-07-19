# Agentiqa CLI service keys

A **service key** (`sk_...`) authenticates the CLI and the GitHub Action without an
interactive login. It is **project-scoped** — `agentiqa run` operates on that
project's plans — and revocable.

## Create one

In the Agentiqa web or desktop app: **Project Settings → CLI Service Keys → Create
Key**. Copy the raw `sk_...` value immediately (shown once). The screen also shows
the exact `agentiqa run` command for that project.

## Use it

Pass it via the `AGENTIQA_SERVICE_KEY` environment variable — never inline it:

```bash
AGENTIQA_SERVICE_KEY=sk_... npx -y agentiqa@latest run --engine https://engine.agentiqa.com
```

In CI, store it as a repository secret named `AGENTIQA_SERVICE_KEY`. The service key
alone authenticates the hosted engine (a short-lived engine credential is minted
automatically) — no separate engine token is needed.

Treat it like a password: pass from a secret, never commit it, and revoke +
re-create from the same settings screen if it leaks.
