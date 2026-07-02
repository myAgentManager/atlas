// Central configuration for myAgent. Reads an optional .env file with zero
// dependencies, then exposes a frozen config object the rest of the app uses.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

// --- tiny .env loader (no dotenv dependency) --------------------------------
function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile();

const dataDir = path.join(ROOT, 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Session-signing secret: from env, else generated once and persisted.
function loadSecret() {
  if (process.env.MYAGENT_SECRET) return process.env.MYAGENT_SECRET;
  const file = path.join(dataDir, '.secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const config = Object.freeze({
  port: Number(process.env.PORT) || 8787,
  adminPort: Number(process.env.ADMIN_PORT) || 8788,
  // 'port' → own port (default). 'path' → /atlas-admin on the main port, for
  // single-port cloud hosts like Render.
  adminMount: process.env.ADMIN_MOUNT === 'path' ? 'path' : 'port',
  adminCode: process.env.ADMIN_CODE || '782677',
  secret: loadSecret(),

  agentName: process.env.MYAGENT_NAME || 'ATLAS',
  engineVersion: '1.0',
  maxSteps: Number(process.env.MYAGENT_MAX_STEPS) || 16,

  // Twilio SMS (global creds; each account sets its own "to" number)
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
  },

  dataDir,
  dataFile: path.join(dataDir, 'tasks.json'),
  usersFile: path.join(dataDir, 'users.json'),
  sessionsFile: path.join(dataDir, 'sessions.json'),
  chatsFile: path.join(dataDir, 'chats.json'),
  logFile: path.join(dataDir, 'log.json'),
  workspace: path.join(ROOT, 'workspace'),
});

fs.mkdirSync(config.workspace, { recursive: true });
