# myAgent

A cloud AI platform with its own mind. Every account gets a private agent
workspace: assign **ATLAS** any task in plain English and it **plans out loud,
does the work, then reviews it against a checklist** — websites, cited research
reports, documents — on demand, on a schedule, or overnight with a deadline.
Everything it makes is organized into per-task **projects**, browsable on the
Files page, private by default, shareable by revocable public link.

Powered by **ATLAS Core**: an AI engine written from scratch for this project.
No Anthropic. No Ollama. No cloud model. Its natural-language understanding
(naive-Bayes intent classifier + entity extractor), task planner, TF-IDF
knowledge index, extractive summarizer, and template-grammar text generator are
all original code that runs entirely on your hardware.

## The platform

| Surface | What |
|---|---|
| **Homepage** | The public face — intro, capabilities, sign-in. |
| **Login** | Account creation + sign-in with real TOTP **two-step verification** (any authenticator app) and single-use backup codes. |
| **Command Deck** | Assign tasks, detailed scheduling (once / overnight / repeat / daily + deadlines), live activity feed, per-task chat, artifact links. |
| **ATLAS page** | Meet the engine: live internals (skills, intents, vocabulary, memories) and an open conversation with ATLAS. |
| **Settings** | Per-account: profile, password, 2SV, SMS notifications, platform integrations, developer API key, danger zone. |
| **Admin console** | Separate port (`:8788`), unlocked by code. Accounts, all tasks, system stats, audit log, danger zone. |

## Integrations — talk to anything

- **Outbound:** per-account webhooks fire on task events — generic JSON,
  **Slack**, and **Discord** incoming-webhook formats — plus **Twilio SMS**.
- **Inbound:** every account has a rotatable API key for the public REST API:

```bash
curl -H "Authorization: Bearer <your-key>" \
     -H "Content-Type: application/json" \
     -d '{"prompt":"Build me a site for my studio"}' \
     http://your-server:8787/api/v1/tasks
```

Endpoints: `GET /api/v1/me`, `GET|POST /api/v1/tasks`, `GET /api/v1/tasks/:id`,
`POST /api/v1/chat`.

## Deploy to the cloud

myAgent is built to run as a hosted platform: you run it once in the cloud,
users sign up and get their own private accounts, files, and agent.

**Stack: [Northflank](https://northflank.com) (Docker service) + [Neon](https://neon.tech) (Postgres).**
The included [`Dockerfile`](Dockerfile) builds the whole platform — UI and all —
into one container. Full step-by-step: [docs/DEPLOY-NORTHFLANK.md](docs/DEPLOY-NORTHFLANK.md).

The short version:

1. **Database (Neon):** create a free project → copy the connection string
   (`postgres://…?sslmode=require`).
2. **Northflank:** create a project → *Add service → Combined service* → pick
   this repo on GitHub → build type **Dockerfile** → networking: HTTP port
   **8787**, publicly exposed → health check path `/healthz`.
3. **Environment** (service → *Environment*):
   - `DATABASE_URL` → your Neon string (add as a **secret**)
   - `ADMIN_CODE` → your own secret code (don't ship the default)
   - `ADMIN_MOUNT` → `path` (Operations console rides the same port)
   - `TRUST_PROXY` → `1`
4. Deploy. Open your Northflank URL → create the first account (it becomes
   owner). The **Operations console** is at `https://your-app.code.run/atlas-operations`.
5. In the Operations console → *Platform*, set the **public base URL** to your
   Northflank URL — share links and OAuth callbacks use it.

With `DATABASE_URL` set, **users, sessions, tasks, chats, and every account's
files live in Postgres** — nothing depends on the host's disk, so redeploys
and restarts lose nothing. Without it, everything falls back to local JSON
files (perfect for developing on your own machine).

Works the same on any host that runs a Docker image with env vars (Fly,
Railway, Koyeb, a VPS).

## Run it locally

```bash
npm run setup     # install + build the UI
npm start         # app on :8787 · admin console on :8788
```

Open `http://localhost:8787`, create the first account (it becomes **owner**),
and assign a task. The admin console at `http://localhost:8788` unlocks with
`ADMIN_CODE` (see `.env.example`; change it before going public).

### Dev mode

```bash
node --watch server/index.js     # backend on :8787/:8788
npm run dev --prefix web         # Vite UI on :5173 (proxies the API)
```

## Architecture

```
server/
  atlas/            ATLAS Core — the from-scratch AI engine
    nlu.js            tokenizer · naive-Bayes intents · entity extraction
    knowledge.js      TF-IDF summarizer · retrieval index (long-term memory)
    generator.js      seeded template grammar · palettes · procedural SVG art
    skills.js         website builder · web research · documents · digests
    core.js           perceive → understand → plan → act → reflect · chat
  auth.js           accounts · scrypt · sessions · TOTP 2SV · audit log
  agent.js          task runner · mid-run steering · notifications fan-out
  tools.js          per-account sandboxed files · public-web fetch/search
  integrations.js   webhooks (generic/Slack/Discord)
  notify.js         Twilio SMS
  admin.js          code-locked console on its own port
  index.js          REST API · SSE stream · scheduler · static hosting
web/                React + Vite · the dark-skeuomorphic UI · original SVGs
data/               users · tasks · chats · sessions · audit log (git-ignored)
workspace/<user>/   each account's sandbox — everything ATLAS makes lands here
```

## Security model

- Passwords scrypt-hashed; sessions are random 256-bit tokens in `httpOnly`
  `SameSite=Lax` cookies; login and admin-gate attempts are rate-limited.
- 2SV is standard RFC-6238 TOTP + hashed single-use backup codes.
- Tasks, files, chats, and streams are scoped per account; path traversal out
  of a workspace is rejected; web fetches refuse private/local addresses.
- The admin console lives on a separate port, unlocks with a constant-time
  code check, and every sensitive action lands in the audit log.

**Before exposing to the internet:** put it behind HTTPS (Caddy/nginx/Cloudflare
Tunnel), change `ADMIN_CODE`, and consider binding `:8788` to localhost/LAN only.

## Configuration

See [`.env.example`](.env.example) — ports, admin code, agent name, Twilio
credentials. Zero configuration required to run.
