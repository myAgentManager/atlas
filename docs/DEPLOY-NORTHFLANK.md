# Deploying Atlas on Northflank

Atlas ships as a single Docker image (see [`Dockerfile`](../Dockerfile)):
the Node server, the built React UI, and the Operations console all run in one
container on `$PORT`.

> ## ⚠️ READ THIS FIRST — or you WILL lose all your data
>
> Northflank's container filesystem is **ephemeral**: it is wiped on every
> deploy and restart. Atlas only survives that if its data lives in an external
> database. **You MUST set `DATABASE_URL`** to a Postgres (Neon) connection
> string. Without it, Atlas falls back to JSON files on the disposable disk and
> **every account, setting, and business is erased on your next deploy.**
>
> If you've been losing data after updates, this is why: `DATABASE_URL` isn't
> set (or is wrong). Fix it, then set `REQUIRE_DB=1` so Atlas refuses to boot
> without a database and can never silently run ephemeral again.
>
> Verify after deploy: open `/healthz` — it must say `"db":"postgres"`. If it
> says `"db":"files"`, your data is NOT being saved.

## 1. Database (Neon — this is what makes data persist)

The database is external to Northflank, so it survives every deploy. Create a
free [Neon](https://neon.tech) project (no card) and copy its connection string
(`postgres://…?sslmode=require`) — that becomes `DATABASE_URL` below. If you
already have one, reuse it; your existing data comes right back.

(Alternative, if you'd rather not use Postgres: attach a Northflank **persistent
volume** mounted at `/app/data` and leave `DATABASE_URL` unset — the JSON files
then live on the volume and survive deploys. Postgres is recommended.)

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
| `DATABASE_URL` | **YES — or data is lost** | Neon connection string. Without it, everything is stored on the disposable container disk and erased on every deploy. |
| `REQUIRE_DB` | strongly recommended | `1` — makes Atlas refuse to boot without `DATABASE_URL`, so you can never accidentally run on ephemeral disk and lose data. |
| `ADMIN_CODE` | **yes** | Access code for the Operations console. Change from the default before going live. |
| `ADMIN_MOUNT` | **yes** | `path` — serves the Operations console on the same port at `/atlas-operations` (single-port host). |
| `TRUST_PROXY` | **yes** | `1` — Northflank terminates TLS in front of the app; this makes rate-limiting and IP logging see real client IPs. |
| `ATLAS_SECRET` (or `MYAGENT_SECRET`) | recommended | Session-signing secret. Set it so sessions + trusted devices survive redeploys; otherwise one is generated per boot. |
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
