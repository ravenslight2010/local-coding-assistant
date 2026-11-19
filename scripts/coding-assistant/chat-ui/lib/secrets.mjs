import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";

function storePath(agentRoot) {
  return path.join(agentRoot, "config", "secrets.enc");
}
function keyPath(agentRoot) {
  return path.join(agentRoot, "config", "secrets.key");
}
function getKey(agentRoot) {
  const kp = keyPath(agentRoot);
  if (existsSync(kp)) return readFileSync(kp);
  const dir = path.dirname(kp);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(kp, key);
  try { chmodSync(kp, 0o600); } catch {}
  return key;
}
function load(agentRoot) {
  const sp = storePath(agentRoot);
  if (!existsSync(sp)) return {};
  try {
    const raw = readFileSync(sp);
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = createDecipheriv(ALGO, getKey(agentRoot), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    return JSON.parse(json);
  } catch { return {}; }
}
function save(agentRoot, obj) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getKey(agentRoot), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const dir = path.dirname(storePath(agentRoot));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(storePath(agentRoot), Buffer.concat([iv, tag, enc]));
  try { chmodSync(storePath(agentRoot), 0o600); } catch {}
}

export function listSecretNames(agentRoot) {
  return Object.keys(load(agentRoot));
}
export function setSecret(agentRoot, name, value) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error("invalid secret name");
  const all = load(agentRoot);
  all[name] = String(value);
  save(agentRoot, all);
}
export function getSecret(agentRoot, name) {
  const all = load(agentRoot);
  return all[name] || null;
}
export function deleteSecret(agentRoot, name) {
  const all = load(agentRoot);
  delete all[name];
  save(agentRoot, all);
}
