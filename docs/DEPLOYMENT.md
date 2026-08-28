# NEPA — Production Deployment Guide

This document describes how NEPA is built, shipped, and rolled back in production.
It is the operational companion to the CD pipeline in
[`.github/workflows/cd.yml`](../.github/workflows/cd.yml).

- [Architecture](#architecture)
- [Container images](#container-images)
- [Environments (testnet / mainnet)](#environments-testnet--mainnet)
- [The CD pipeline](#the-cd-pipeline)
- [Deployment strategy: rolling + automatic rollback](#deployment-strategy-rolling--automatic-rollback)
- [First-time host setup](#first-time-host-setup)
- [Manual operations](#manual-operations)
- [Rollback](#rollback)
- [Secrets reference](#secrets-reference)
- [Notifications](#notifications)
- [Database migrations](#database-migrations)
- [Troubleshooting](#troubleshooting)

---

## Architecture

Production runs as a single Docker Compose stack
([`docker-compose.prod.yml`](../docker-compose.prod.yml)) on a Linux host:

```
                      ┌─────────────────────────── host ───────────────────────────┐
 Internet ─→ :8080 ─→ │  frontend (nginx)                                           │
                      │    • serves the built SPA                                   │
                      │    • reverse-proxies /api and /socket.io → backend:3001     │
                      │    • /health proxies backend, /healthz is nginx-local       │
                      │                                                             │
                      │  backend (node, :3001, internal)  ─→  postgres:5432         │
                      │                                   ─→  redis:6379            │
                      └─────────────────────────────────────────────────────────────┘
```

Only the frontend port (`FRONTEND_PORT`, default `8080`) is published. The backend,
Postgres, and Redis are reachable only on the internal `nepa-network` bridge. Put a
TLS terminator (Caddy / Traefik / a cloud LB) in front of `:8080` for public traffic.

The Soroban smart contract ([`contract/`](../contract)) is **not** a long-running
service. Its image builds and verifies the `.wasm` artifact; publishing to the
network is an explicit, opt-in step (see [contract deploys](#contract-mainnet-deploys)).

## Container images

Three images are published to GitHub Container Registry (GHCR):

| Image | Base | Contents |
|-------|------|----------|
| `ghcr.io/<owner>/nepa-backend`  | `node:20-slim` | Compiled `dist/`, Prisma client, prod deps only. Non-root, `tini`, healthcheck on `/health`. |
| `ghcr.io/<owner>/nepa-frontend` | `nginx:1.27-alpine` | Built SPA + reverse-proxy config. Healthcheck on `/healthz`. |
| `ghcr.io/<owner>/nepa-contract` | `node:20-slim` | Verified Soroban `.wasm` + deploy tooling. Defaults to `build` (verify); `deploy` is opt-in. |

All three are multi-stage builds — compilers and dev dependencies stay in builder
stages and never reach the runtime image. Every image is tagged with a single shared
tag per release (`sha-<short-sha>` for branch builds, the git tag for releases) plus
`latest`.

Build any image locally:

```bash
docker build -t nepa-backend  ./backend
docker build -t nepa-frontend ./frontend --build-arg VITE_API_URL=/api
docker build -t nepa-contract ./contract      # verifies the wasm artifact
```

## Environments (testnet / mainnet)

Configuration is environment-specific and never committed with real secrets. Two
templates live in [`deploy/`](../deploy):

| | Staging | Production |
|-|---------|-----------|
| Template | [`deploy/.env.staging.example`](../deploy/.env.staging.example) | [`deploy/.env.production.example`](../deploy/.env.production.example) |
| Stellar network | **testnet** | **mainnet** (`public`) |
| Horizon URL | `https://horizon-testnet.stellar.org` | `https://horizon.stellar.org` |
| Triggered by | push to `main` | push of a `v*.*.*` tag |

On each host, copy the matching template to the repo root as `.env` and fill in the
secrets:

```bash
cp deploy/.env.staging.example .env      # staging host
# ...or...
cp deploy/.env.production.example .env    # production host
```

`docker-compose.prod.yml` reads this single `.env` for both `${VAR}` interpolation
and the backend container's runtime environment. **Never commit a filled-in `.env`.**

## The CD pipeline

[`.github/workflows/cd.yml`](../.github/workflows/cd.yml) has these triggers:

| Event | Result |
|-------|--------|
| `push` → `main` | build images → deploy **staging** (testnet) |
| `push` → tag `v*.*.*` | build images (incl. contract) → deploy **production** (mainnet) |
| `pull_request` touching deploy paths | **validate only** — hadolint, shellcheck, `compose config`, actionlint |
| `workflow_dispatch` | manual **deploy** or **rollback** of a chosen environment + tag |

Jobs:

1. **validate** — lints the Dockerfiles, shell scripts, compose file, and the
   workflow itself. Runs on every event, including PRs.
2. **setup** — resolves the one image tag shared by all services this run.
3. **build-app** — builds & pushes `nepa-backend` and `nepa-frontend` to GHCR
   (skipped on PRs and rollbacks).
4. **build-contract** — builds & pushes `nepa-contract` (production releases only).
5. **deploy-staging / deploy-production** — deploy over SSH, then notify.
6. **rollback** — manual rollback via `workflow_dispatch`.

### Deploys are gated on infrastructure secrets

The deploy jobs only SSH into a host when the environment's `*_SSH_HOST` secret is
set. **Without it, the job runs a validated dry-run** (`docker compose config` +
prints the exact command it would run) so the pipeline stays green and reviewable
before any infrastructure exists. Configure the [secrets](#secrets-reference) to turn
a real deploy on — no workflow edits required.

## Deployment strategy: rolling + automatic rollback

Deploys use a **rolling update** with a health gate, implemented in
[`deploy/deploy.sh`](../deploy/deploy.sh):

1. Record the currently-running tag (from the `nepa.image.tag` container label).
2. `docker compose pull` the new tag and `up -d --wait` — Compose blocks on each
   container's healthcheck, replacing services in place.
3. Run [`backend/scripts/verify-deployment.sh`](../backend/scripts/verify-deployment.sh)
   against the end-to-end `/health` endpoint (through nginx → backend).
4. **If the health gate fails, automatically roll back** to the previously-running
   tag and re-verify. Exit codes: `0` healthy, `1` rolled back (new release
   rejected, service restored), `2` rollback also failed (page a human).

Because a bad image never survives the health gate, a failed release is self-healing.

> **Blue-green** is the natural scale-out from here: run two stacks (`FRONTEND_PORT`
> 8080/8081) behind the TLS proxy and flip upstream after the health gate passes.
> The rolling strategy above is the single-host default; the tag-label bookkeeping
> and `verify-deployment.sh` gate are reused unchanged for blue-green.

## First-time host setup

```bash
# 1. Install Docker Engine + the compose plugin.
# 2. Clone the repo to the deploy path (default /opt/nepa; override with DEPLOY_PATH).
sudo git clone https://github.com/nathydre21/nepa.git /opt/nepa
cd /opt/nepa

# 3. Create the environment file from the matching template and fill in secrets.
cp deploy/.env.staging.example .env      # or .env.production.example
"${EDITOR:-nano}" .env                    # set POSTGRES_PASSWORD, JWT_SECRET, ...

# 4. Authenticate to GHCR so private images can be pulled.
echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin

# 5. First deploy.
bash deploy/deploy.sh staging "$(git rev-parse --short=12 HEAD | sed 's/^/sha-/')"
```

## Manual operations

All commands run from the repo root on the host, with `.env` present.

```bash
# Deploy a specific tag (rolling, health-gated, auto-rollback):
bash deploy/deploy.sh staging sha-0a1b2c3d4e5f

# Inspect what is currently running:
docker inspect --format '{{ index .Config.Labels "nepa.image.tag" }}' nepa-backend
docker compose -f docker-compose.prod.yml ps

# Tail logs:
docker compose -f docker-compose.prod.yml logs -f backend
```

You can also trigger a deploy from GitHub: **Actions → CD → Run workflow**, choose the
environment, `action: deploy`, and an optional `image_tag`.

## Rollback

Automatic rollback happens inside `deploy.sh` on a failed health gate. To roll back a
release that was *already* promoted and looked healthy:

```bash
# On the host — restore a known-good tag:
bash deploy/rollback.sh production sha-9f8e7d6c5b4a
```

Or from GitHub: **Actions → CD → Run workflow → action: rollback**, set `environment`
and the `image_tag` to restore. The `rollback` job refuses to run without a target tag.

## Secrets reference

Configure these as GitHub Actions secrets (per-environment where noted). Everything is
optional — unset SSH secrets keep the pipeline in dry-run mode.

| Secret | Scope | Purpose |
|--------|-------|---------|
| `GITHUB_TOKEN` | automatic | Push images to GHCR (no setup needed). |
| `STAGING_SSH_HOST` / `_USER` / `_KEY` | staging | SSH target for staging deploys. Unset → dry-run. |
| `STAGING_DEPLOY_PATH` | staging | Repo path on the staging host (default `/opt/nepa`). |
| `PRODUCTION_SSH_HOST` / `_USER` / `_KEY` | production | SSH target for production deploys. Unset → dry-run. |
| `PRODUCTION_DEPLOY_PATH` | production | Repo path on the production host (default `/opt/nepa`). |
| `STELLAR_SECRET_KEY` | production | Deployer key for mainnet contract publish. Unset → contract deploy skipped. |
| `SLACK_WEBHOOK_URL` | any | Slack incoming webhook for deploy notifications. |
| `WEBHOOK_ALERT_URL` | any | Generic JSON webhook for deploy notifications. |

Host-side secrets (in the host's `.env`, never in git): `POSTGRES_PASSWORD`,
`JWT_SECRET`, `DATABASE_URL`, `SENTRY_DSN`, etc. — see the env templates.

## Notifications

[`deploy/notify.sh`](../deploy/notify.sh) posts deploy/rollback status to Slack
(`SLACK_WEBHOOK_URL`) and/or a generic webhook (`WEBHOOK_ALERT_URL`). If neither is
set it is a silent no-op, so it is safe to call unconditionally. The CD pipeline calls
it at the end of every deploy and rollback job with the resulting status.

```bash
# Manual test:
SLACK_WEBHOOK_URL=https://hooks.slack.com/... \
  bash deploy/notify.sh success "manual test from $(hostname)"
```

## Database migrations

Migrations are **operator-gated** — the pipeline never runs a schema change
automatically, to avoid an unattended destructive migration during a rolling deploy.
Apply them deliberately during a maintenance window:

```bash
# From a machine with the backend toolchain and DATABASE_URL exported:
cd backend
npx prisma migrate deploy --schema=./schema.prisma
```

The repo also ships [`backend/scripts/db-zero-downtime-migrate.ts`](../backend/scripts)
for expand/contract migrations that must not interrupt traffic. Run migrations
**before** deploying an image that depends on the new schema (expand), and drop old
columns only **after** the old image is fully retired (contract).

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `deploy.sh` exits 1, "rolled back" | New image failed the health gate; service restored to the previous tag. Check `docker compose logs backend`. |
| `deploy.sh` exits 2 | Rollback also failed — the stack is down. Investigate Postgres/Redis health first. |
| `POSTGRES_PASSWORD must be set` | No `.env` on the host, or the variable is blank. Copy the template and fill it in. |
| Health gate times out | Backend can't reach Postgres/Redis, or migrations are pending. Check `nepa-backend` logs and `DATABASE_URL`. |
| CD deploy job shows "dry-run" | The environment's `*_SSH_HOST` secret is not set — expected until infra is configured. |
| GHCR `denied` on pull | Host isn't logged in to GHCR, or the package is private. Re-run `docker login ghcr.io`. |
