# Deploying myAgent on Northflank

myAgent ships as a single Docker image (see [`Dockerfile`](../Dockerfile)):
the Node server, the built React UI, and the Operations console all run in one
container on `$PORT`. Persistent state lives in Postgres via `DATABASE_URL`
(Neon) — the container filesystem is disposable, so redeploys lose nothing.

## 1. Database (Neon — stays exactly where it is)

Nothing to migrate: the database is external. Use your existing Neon project's
connection string (`postgres://…?sslmode=require`). If starting fresh, create
a free Neon project and copy the string.

## 2. Create the service

1. Northflank dashboard → **Create project** (e.g. `atlas`).
2. Inside the project: **Add service → Combined service** (build + deploy).
3. **Repository:** connect GitHub and pick this repo, branch `main`.
4. **Build options:** build type **Dockerfile**, context `/`, file `/Dockerfile`.
5. **Networking:** add port **8787**, protocol **HTTP**, **publicly expose** it.
   Northflank gives you a `https://….code.run` URL.
6. **Advanced → Health checks:** HTTP, path `/healthz`, port 8787.
   (`/healthz` returns `{ ok, db, uptime }` — `db` says `postgres` or `files`,
   so it doubles as a check that `DATABASE_URL` took.)

## 3. Environment variables

Add these under the service's **Environment** tab. Mark secrets as secrets.

| Variable | Required | Value / notes |
|---|---|---|
| `DATABASE_URL` | **yes** | Neon connection string. Without it, data falls back to JSON files on the container disk and is lost on redeploy. |
| `ADMIN_CODE` | **yes** | Access code for the Operations console. Change from the default before going live. |
| `ADMIN_MOUNT` | **yes** | `path` — serves the Operations console on the same port at `/atlas-operations` (single-port host). |
| `TRUST_PROXY` | **yes** | `1` — Northflank terminates TLS in front of the app; this makes rate-limiting and IP logging see real client IPs. |
| `MYAGENT_SECRET` | recommended | Session-signing secret. Set it so sessions survive redeploys; otherwise one is generated per boot. |
| `MYAGENT_NAME` | no | Agent display name (default `ATLAS`). |
| `MYAGENT_EMAIL_MINUTES` | no | Inbound-email poll interval (default 3). |
| `MYAGENT_STUDY_MINUTES` | no | Self-study loop interval; unset disables. |
| `MYAGENT_MAX_STEPS`, `MYAGENT_FAST_PASSES` | no | Engine tuning; defaults are fine. |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_GROWTH` | no | Only for live billing. Unset = billing demo mode. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | no | Only for SMS features. |
| `PORT` | no | Northflank sets the container port you configured; the app reads it (default 8787). |
| `ADMIN_PORT` | no | Ignored when `ADMIN_MOUNT=path`. |

## 4. First boot

1. Deploy; wait for the health check to go green.
2. Open the service URL and **create the first account** — it becomes `owner`
   (and `@atlasnetworks.com` signups get founder perks).
3. Operations console: `https://<your-app>.code.run/atlas-operations` — unlocks
   with `ADMIN_CODE`.
4. In Operations → *Platform*, set the **public base URL** to the service URL —
   share links and OAuth callbacks are built from it.

## 5. Moving off Render (one-time checklist)

The database never moves, so the cutover is just traffic:

- [ ] Deploy on Northflank with the **same `DATABASE_URL`** → same users, same data.
- [ ] Verify: sign in with an existing account, `/healthz` shows `db: postgres`.
- [ ] Update the public base URL in Operations → *Platform* to the Northflank URL.
- [ ] Custom domain (if any): add it under the service's ports → DNS → repoint CNAME.
- [ ] Suspend/delete the Render service so the two deployments don't both poll
      inbound email (`MYAGENT_EMAIL_MINUTES` runs on every live instance —
      running both risks double replies to customer emails).

## Local image test

```bash
docker build -t myagent .
docker run --rm -p 8787:8787 -e ADMIN_MOUNT=path -e ADMIN_CODE=test myagent
# → http://localhost:8787  ·  http://localhost:8787/atlas-operations
```
