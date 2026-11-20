#!/usr/bin/env node
/**
 * Local coding assistant chat UI (local Ollama only — no cloud token limits).
 * Binds 127.0.0.1. Optional search. Sessions, tools with approval, gold-set helper.
 */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync, appendFileSync, realpathSync, renameSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { listSecretNames, setSecret, getSecret, deleteSecret } from "./lib/secrets.mjs";
import { addMemory, searchMemory, listMemory } from "./lib/memory-store.mjs";
import { trimMessages } from "./lib/trim.mjs";
import { listWorkflows, getWorkflow } from "./lib/workflows.mjs";
import { discoverTests, planFor } from "./lib/testing.mjs";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start) {
  if (process.env.RUNCALC_REPO && existsSync(path.join(process.env.RUNCALC_REPO, "package.json"))) {
    return path.resolve(process.env.RUNCALC_REPO);
  }
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start, "../../..");
}
const DEFAULT_ROOT = findRepoRoot(__dirname);

const AGENT_ROOT = process.env.CA_AGENT_ROOT || path.join(path.dirname(DEFAULT_ROOT), "agent");
const SESSIONS_DIR = path.join(AGENT_ROOT, "sessions");
const TASKS_DIR = path.join(AGENT_ROOT, "tasks");
const TASKS_DONE = path.join(TASKS_DIR, "done");
const AUDIT_FILE = path.join(AGENT_ROOT, "audit", "tool-actions.json");
if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
if (!existsSync(TASKS_DIR)) mkdirSync(TASKS_DIR, { recursive: true });
if (!existsSync(TASKS_DONE)) mkdirSync(TASKS_DONE, { recursive: true });

function secretsPath() {
  return path.join(AGENT_ROOT, "config", "secrets.json");
}
function readSecretsFile() {
  try {
    const p = secretsPath();
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  } catch {}
  return {};
}
function writeSecretsFile(obj) {
  const p = secretsPath();
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2), { encoding: "utf8", mode: 0o600 });
}

function skillsRoot(root) {
  const candidates = [
    process.env.CA_SKILLS_DIR,
    path.join(process.env.USERPROFILE || process.env.HOME || "", ".config", "opencode", "skills"),
    path.join(root, "scripts", "coding-assistant", "domain-skills"),
    path.join(root, "agent-skills"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
function listSkills(root) {
  const base = skillsRoot(root);
  if (!base) return [];
  try {
    return readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ slug: d.name, name: d.name }));
  } catch { return []; }
}
function loadSkill(root, slug) {
  const base = skillsRoot(root);
  if (!base || !slug || /[\\/]/.test(slug) || slug.includes("..")) return null;
  const p = path.join(base, slug, "SKILL.md");
  if (!existsSync(p)) return null;
  return { slug, content: readFileSync(p, "utf8").slice(0, 120000) };
}

const prefsPath = path.join(AGENT_ROOT, "config", "prefs.json");
function readPrefs() {
  try { if (existsSync(prefsPath)) return JSON.parse(readFileSync(prefsPath, "utf8")); } catch {}
  return {};
}
function writePrefs(p) {
  const dir = path.dirname(prefsPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(prefsPath, JSON.stringify(p, null, 2));
}

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const HOST = "127.0.0.1";
const PORT = Number(flag("--port", "7843")) || 7843;
const OLLAMA = flag("--ollama", "http://127.0.0.1:11434");
const MODEL = flag("--model", loadLastModel() || "qwen2.5-coder:7b");

function modelChoicePath() {
  return path.join(AGENT_ROOT, "config", "model-choice.json");
}
function loadLastModel() {
  try {
    const j = JSON.parse(readFileSync(modelChoicePath(), "utf8"));
    return j.Model || j.model || null;
  } catch { return null; }
}
function rememberModel(model) {
  try {
    const dir = path.dirname(modelChoicePath());
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const prev = (() => { try { return JSON.parse(readFileSync(modelChoicePath(), "utf8")); } catch { return {}; } })();
    writeFileSync(modelChoicePath(), JSON.stringify({ ...prev, Model: model, rememberedAt: Date.now() }, null, 2));
  } catch {}
}
rememberModel(MODEL);

const MAX_BODY_BYTES = 1024 * 1024;
const TOOL_APPROVAL_TTL_MS = 5 * 60 * 1000;
const MAX_PENDING_TOOL_APPROVALS = 100;
const MAX_AUDIT_RECORDS = Math.min(200, Math.max(1, Number(process.env.CA_AUDIT_LIMIT) || 200));
const SHELL_TIMEOUT_MS = Math.min(120000, Math.max(1, Number(process.env.CA_SHELL_TIMEOUT_MS) || 120000));
const PROMPT_TOKEN_BUDGET = Math.min(100000, Math.max(512, Number(process.env.CA_PROMPT_TOKEN_BUDGET) || 12000));
const pendingToolApprovals = new Map();
const allowedOrigins = new Set([`http://${HOST}:${PORT}`, `http://localhost:${PORT}`]);
const allowedHosts = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);

const SYSTEM = `You are a local coding assistant (Ollama only — no cloud token limits).
Help with code, imports, gold sets, QC, sync, and multi-version work (v1/v2/v3).
You run on the user's machine and can inspect the selected repository when Code loop is on.
Never say you have no access to files or the computer. If Code loop is off, ask the user to turn it on.
If no repository is selected, ask for a path.

Tools (request via structured JSON in your reply when needed):
- To propose a file edit, reply with a fenced block: \`\`\`tool
{"tool":"edit","path":"relative/path","old":"exact text","new":"replacement"}
\`\`\`
- To run a shell command: \`\`\`tool
{"tool":"shell","command":"safe command"}
\`\`\`
- For gold-set draft: \`\`\`tool
{"tool":"goldset","sheet":"schedule|dough|...","examples":[...]}
\`\`\`
The UI will show an approval card. Prefer local files and skills first.
Optional search is available when the user enables it (/search).
Be concise. Show concrete paths.`;

const CODING_WORKFLOW = `Coding mode is enabled for this request.
Read-only tools:
\`\`\`tool
{"tool":"search","query":"literal text","path":"optional/dir"}
\`\`\`
\`\`\`tool
{"tool":"read","path":"relative/file"}
\`\`\`
\`\`\`tool
{"tool":"outline","path":"relative/file"}
\`\`\`
Write tools (approval required):
\`\`\`tool
{"tool":"edit","path":"relative/file","old":"exact","new":"replacement"}
\`\`\`
\`\`\`tool
{"tool":"create","path":"relative/new-file","content":"full contents"}
\`\`\`
\`\`\`tool
{"tool":"patch","files":[{"path":"a","old":"...","new":"..."},{"path":"b","content":"new file"}]}
\`\`\`
Inspect before editing. Prefer the smallest complete patch. If Auto is on, file tools apply without a prompt and you should continue to the next step (read result, edit, test) until done or blocked. Do not create a follow-up task. If more work belongs with the current task, say so and ask to include it in the current task. Update the covering test in the same change. One tool block per response. Never claim a test passed without its output. Do not read secret files.`;

function safeResolve(root, rel) {
  const value = String(rel || "").replace(/\\/g, "/");
  if (value.includes("\0") || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return null;
  const segments = value.split("/");
  if (segments.some((segment) => segment === ".." || segment.toLowerCase() === ".git")) return null;
  const cleaned = segments.filter((segment) => segment && segment !== ".").join("/");
  const abs = path.resolve(root, cleaned);
  const relative = path.relative(root, abs);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  try {
    const realRoot = realpathSync(root);
    const realAbs = realpathSync(abs);
    const realRelative = path.relative(realRoot, realAbs);
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return null;
    return realAbs;
  } catch {
    return null;
  }
}

function normalizeTool(root, tool) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return null;
  if (tool.tool === "edit" && typeof tool.path === "string" && typeof tool.old === "string" && tool.old.length > 0) {
    const abs = safeResolve(root, tool.path);
    if (!abs || !existsSync(abs) || !statSync(abs).isFile() || isProtectedRepositoryPath(path.relative(root, abs))) return null;
    return { tool: "edit", path: path.relative(root, abs).replace(/\\/g, "/"), old: tool.old, new: String(tool.new || "") };
  }
  if (tool.tool === "create" && typeof tool.path === "string" && typeof tool.content === "string") {
    const abs = safeResolve(root, tool.path);
    if (!abs || isProtectedRepositoryPath(tool.path)) return null;
    return { tool: "create", path: tool.path.replace(/\\/g, "/"), content: tool.content };
  }
  if (tool.tool === "patch" && Array.isArray(tool.files) && tool.files.length <= 8) {
    const files = tool.files.filter((f) => f && typeof f.path === "string" && !isProtectedRepositoryPath(f.path));
    if (!files.length) return null;
    return { tool: "patch", files };
  }
  if (tool.tool === "shell" && process.env.CA_ALLOW_SHELL === "1" && typeof tool.command === "string" && tool.command.trim() && tool.command.length <= 2000) {
    return { tool: "shell", command: tool.command };
  }
  return null;
}

const IGNORED_SEARCH_DIRS = new Set([
  ".git", "node_modules", "vendor", ".cache", "dist", "build", "coverage",
]);
const MAX_CODING_FILE_BYTES = 120_000;
const MAX_SEARCH_FILES = 500;
const MAX_SEARCH_BYTES = 5_000_000;
const MAX_SEARCH_RESULTS = 25;

function isProtectedRepositoryPath(rel) {
  const segments = String(rel || "").replace(/\\/g, "/").split("/").map((part) => part.toLowerCase());
  return segments.some((name) =>
    name === ".env" ||
    name.startsWith(".env.") ||
    /(?:^|[._-])(secret|secrets|credential|credentials)(?:[._-]|$)/i.test(name) ||
    /\.(pem|key|p12|pfx|keystore)$/i.test(name)
  );
}

function readCodingTool(root, tool) {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return { status: 400, body: { error: "invalid tool request" } };


  if (tool.tool === "outline") {
    if (typeof tool.path !== "string") return { status: 400, body: { error: "invalid path" } };
    const abs = safeResolve(root, tool.path);
    if (!abs || !existsSync(abs)) return { status: 404, body: { error: "not found" } };
    const src = readFileSync(abs, "utf8");
    const lines = src.split("\n");
    const symbols = [];
    lines.forEach((line, i) => {
      const m = line.match(/^\s*(export\s+)?(async\s+)?(function|class|const|let|type|interface)\s+([A-Za-z0-9_]+)/);
      if (m) symbols.push({ line: i + 1, kind: m[3], name: m[4] });
    });
    return { status: 200, body: { path: tool.path, symbols: symbols.slice(0, 80) } };
  }
  if (tool.tool === "read") {
    if (typeof tool.path !== "string" || tool.path.length > 500) return { status: 400, body: { error: "invalid path" } };
    const abs = safeResolve(root, tool.path);
    if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return { status: 404, body: { error: "file not found" } };
    if (isProtectedRepositoryPath(path.relative(root, abs))) return { status: 403, body: { error: "secret files are not available in coding mode" } };
    const size = statSync(abs).size;
    if (size > MAX_CODING_FILE_BYTES) return { status: 413, body: { error: "file too large for coding mode" } };
    const content = readFileSync(abs, "utf8");
    if (content.includes("\0")) return { status: 415, body: { error: "binary files are not available in coding mode" } };
    return { status: 200, body: { ok: true, tool: "read", path: path.relative(root, abs).replace(/\\/g, "/"), content } };
  }

  if (tool.tool === "search") {
    if (typeof tool.query !== "string" || tool.query.trim().length < 2 || tool.query.length > 160) {
      return { status: 400, body: { error: "search query must be 2–160 characters" } };
    }
    if (tool.path !== undefined && (typeof tool.path !== "string" || tool.path.length > 500)) {
      return { status: 400, body: { error: "invalid search path" } };
    }
    const start = safeResolve(root, tool.path || "");
    if (!start || !existsSync(start) || !statSync(start).isDirectory()) return { status: 404, body: { error: "directory not found" } };
    if (isProtectedRepositoryPath(path.relative(root, start))) return { status: 403, body: { error: "secret paths are not available in coding mode" } };

    const query = tool.query.toLocaleLowerCase();
    const pending = [{ abs: start, depth: 0 }];
    const matches = [];
    let filesScanned = 0;
    let bytesScanned = 0;
    let truncated = false;
    while (pending.length && filesScanned < MAX_SEARCH_FILES && bytesScanned < MAX_SEARCH_BYTES && matches.length < MAX_SEARCH_RESULTS) {
      const current = pending.pop();
      let entries;
      try {
        const allEntries = readdirSync(current.abs, { withFileTypes: true });
        entries = allEntries.slice(0, 300);
        if (allEntries.length > entries.length) truncated = true;
      } catch { continue; }
      for (const entry of entries) {
        if (matches.length >= MAX_SEARCH_RESULTS || filesScanned >= MAX_SEARCH_FILES || bytesScanned >= MAX_SEARCH_BYTES) {
          truncated = true;
          break;
        }
        if (entry.isDirectory()) {
          if (current.depth < 8 && !IGNORED_SEARCH_DIRS.has(entry.name.toLowerCase())) {
            pending.push({ abs: path.join(current.abs, entry.name), depth: current.depth + 1 });
          }
          continue;
        }
        if (!entry.isFile()) continue;
        const abs = path.join(current.abs, entry.name);
        if (isProtectedRepositoryPath(path.relative(root, abs))) continue;
        let size;
        try { size = statSync(abs).size; } catch { continue; }
        if (size > MAX_CODING_FILE_BYTES || bytesScanned + size > MAX_SEARCH_BYTES) {
          truncated = true;
          continue;
        }
        filesScanned++;
        bytesScanned += size;
        let content;
        try { content = readFileSync(abs, "utf8"); } catch { continue; }
        if (content.includes("\0")) continue;
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length && matches.length < MAX_SEARCH_RESULTS; index++) {
          if (lines[index].toLocaleLowerCase().includes(query)) {
            matches.push({
              path: path.relative(root, abs).replace(/\\/g, "/"),
              line: index + 1,
              text: lines[index].slice(0, 400),
            });
          }
        }
      }
    }
    return {
      status: 200,
      body: {
        ok: true,
        tool: "search",
        query: tool.query,
        filesScanned,
        truncated: truncated || pending.length > 0 || matches.length === MAX_SEARCH_RESULTS,
        matches,
      },
    };
  }

  return { status: 400, body: { error: "unsupported read-only tool" } };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function atomicWriteFile(abs, content, mode = 0o600) {
  const temp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, content, { encoding: "utf8", mode, flag: "wx" });
    renameSync(temp, abs);
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
  }
}

function recordToolAudit(approval, result) {
  const record = {
    at: new Date().toISOString(),
    approvalId: approval.id,
    sessionId: approval.sessionId || null,
    kind: approval.tool.tool,
    rootHash: sha256(approval.root),
    outcome: result.outcome,
  };
  if (approval.tool.tool === "edit") record.path = approval.tool.path.slice(0, 300);
  if (approval.tool.tool === "shell") {
    record.commandHash = sha256(approval.tool.command);
    record.commandBytes = Buffer.byteLength(approval.tool.command);
  }
  for (const key of ["reason", "code", "timedOut", "truncated"]) {
    if (result[key] !== undefined) record[key] = result[key];
  }
  try {
    let records = [];
    if (existsSync(AUDIT_FILE)) {
      records = JSON.parse(readFileSync(AUDIT_FILE, "utf8"));
      if (!Array.isArray(records)) return false;
    }
    records.push(record);
    mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
    atomicWriteFile(AUDIT_FILE, JSON.stringify(records.slice(-MAX_AUDIT_RECORDS), null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

function pruneToolApprovals() {
  const now = Date.now();
  for (const [id, approval] of pendingToolApprovals) {
    if (approval.expiresAt <= now) pendingToolApprovals.delete(id);
  }
}

function isSameOriginRequest(req) {
  const origin = req.headers.origin;
  const host = String(req.headers.host || "").toLowerCase();
  const fetchSite = req.headers["sec-fetch-site"];
  return allowedOrigins.has(origin) && allowedHosts.has(host) && (!fetchSite || fetchSite === "same-origin");
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(data);
}
function writeStreamChunk(res, chunk) {
  if (res.destroyed || res.writableEnded) return Promise.resolve(false);
  if (res.write(chunk)) return Promise.resolve(true);
  if (res.destroyed || res.writableEnded) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (value) => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      resolve(value);
    };
    const onDrain = () => done(true);
    const onClose = () => done(false);
    res.once("drain", onDrain);
    res.once("close", onClose);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c) => {
      if (tooLarge) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("request body too large");
        error.statusCode = 413;
        reject(error);
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function isSafeRecordId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}
function sessionFile(id) { return isSafeRecordId(id) ? path.join(SESSIONS_DIR, id + ".json") : null; }
function listSessions() {
  try {
    return readdirSync(SESSIONS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const p = path.join(SESSIONS_DIR, f);
        try {
          const j = JSON.parse(readFileSync(p, "utf8"));
          return { id: j.id, title: j.title || j.id, updated: j.updated || 0, messages: (j.messages || []).length, repo: j.repo || DEFAULT_ROOT };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.updated - a.updated)
      .slice(0, 40);
  } catch { return []; }
}

function changedSince(root, sinceMs) {
  try {
    const since = new Date(sinceMs || Date.now() - 7 * 86400000).toISOString();
    const out = execFileSync("git", ["-C", root, "log", `--since=${since}`, "--pretty=format:%h %s", "-n", "12"], { encoding: "utf8", timeout: 4000 });
    return out.split("\n").filter(Boolean);
  } catch { return []; }
}

function contextPack() {
  const dir = path.join(AGENT_ROOT, "context");
  const docs = path.join(root, "docs", "coding-assistant", "context");
  const chunks = [];
  for (const d of [dir, docs]) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".md")) continue;
      try { chunks.push({ file: f, text: readFileSync(path.join(d, f), "utf8").slice(0, 4000) }); } catch {}
    }
  }
  return chunks;
}

function loadSession(id) {
  const p = sessionFile(id);
  if (!p || !existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}
function saveSession(sess) {
  if (!isSafeRecordId(sess.id)) throw new Error("invalid session id");
  sess.updated = Date.now();
  writeFileSync(sessionFile(sess.id), JSON.stringify(sess, null, 2));
}

function canonicalRepositoryRoot(candidate) {
  if (typeof candidate !== "string" || !candidate || candidate.length > 4096) throw new Error("invalid repository");
  const resolved = path.resolve(candidate);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) throw new Error("invalid repository");
  if (!existsSync(path.join(resolved, "package.json")) && !existsSync(path.join(resolved, ".git"))) {
    throw new Error("repository must contain package.json or .git");
  }
  return realpathSync(resolved);
}

function rootForSession(sessionId) {
  if (!sessionId) return DEFAULT_ROOT;
  const sess = loadSession(sessionId);
  if (!sess || !sess.repo) return DEFAULT_ROOT;
  try {
    return canonicalRepositoryRoot(sess.repo);
  } catch {
    const error = new Error("session repository is unavailable or invalid");
    error.statusCode = 409;
    throw error;
  }
}


function taskFile(id) { return isSafeRecordId(id) ? path.join(TASKS_DIR, id + ".json") : null; }
function listTasks() {
  try {
    return readdirSync(TASKS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          const j = JSON.parse(readFileSync(path.join(TASKS_DIR, f), "utf8"));
          return { id: j.id, type: j.type || "task", title: j.title || j.id, priority: j.priority || 5, status: j.status || "open", created: j.created || 0, items: Array.isArray(j.items) ? j.items.length : 0 };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (a.priority - b.priority) || (b.created - a.created));
  } catch { return []; }
}
function loadTask(id) {
  const p = taskFile(id);
  if (!p || !existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}
function saveTask(t) {
  if (!isSafeRecordId(t.id)) throw new Error("invalid task id");
  t.updated = Date.now();
  writeFileSync(taskFile(t.id), JSON.stringify(t, null, 2));
}


function repositoryStateDir(root) {
  return path.join(AGENT_ROOT, "repositories", sha256(realpathSync(root)));
}
function repoKey(root) {
  try { return sha256(realpathSync(root)).slice(0, 16); } catch { return "default"; }
}
function lastShaFile(root) {
  return path.join(repositoryStateDir(root), "last-sha.txt");
}
function readLastSha(root) {
  try { return readFileSync(lastShaFile(root), "utf8").trim(); } catch { return ""; }
}
function writeLastSha(root, sha) {
  const p = lastShaFile(root);
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, sha);
}
function memoryFile(root) {
  return path.join(repositoryStateDir(root), "config", "MEMORY.md");
}
function contextDir(root) {
  return path.join(repositoryStateDir(root), "context");
}
function readMemory(root) {
  try { return readFileSync(memoryFile(root), "utf8"); } catch { return ""; }
}
function appendMemory(root, line) {
  const file = memoryFile(root);
  mkdirSync(path.dirname(file), { recursive: true });
  const cur = readMemory(root);
  writeFileSync(file, cur.trimEnd() + "\n- " + line + "\n", "utf8");
}
function listContext(root) {
  try {
    return readdirSync(contextDir(root))
      .filter((f) => f.endsWith(".md") || f.endsWith(".txt"))
      .map((f) => ({ name: f, path: path.join(contextDir(root), f) }));
  } catch { return []; }
}
function loadContextPack(root) {
  const files = listContext(root);
  let blob = "";
  for (const f of files.slice(0, 20)) {
    try {
      const t = readFileSync(f.path, "utf8");
      blob += "\n\n--- CONTEXT " + f.name + " ---\n" + t.slice(0, 40000);
    } catch {}
  }
  return blob;
}

function estimatePromptTokens(text) {
  return Math.ceil(Buffer.byteLength(String(text || ""), "utf8") / 4);
}

function fitPromptText(text, tokenBudget) {
  const marker = "\n[... truncated to fit the total prompt budget ...]";
  if (tokenBudget <= estimatePromptTokens(marker)) return "";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (estimatePromptTokens(text.slice(0, middle) + marker) <= tokenBudget) low = middle;
    else high = middle - 1;
  }
  return text.slice(0, low) + marker;
}

function normalizePromptMessage(message) {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const role = message.role === "assistant" ? "assistant" : "user";
  let content = typeof message.content === "string" ? message.content : String(message.content || "");
  if (Array.isArray(message.attachments)) {
    for (const attachment of message.attachments.slice(0, 10)) {
      const text = typeof attachment === "string"
        ? attachment
        : String(attachment?.text || attachment?.content || "");
      if (!text) continue;
      const name = typeof attachment === "object" && typeof attachment.name === "string"
        ? attachment.name.slice(0, 120)
        : "attachment";
      content += `\n\n--- ATTACHMENT ${name} ---\n${text}`;
    }
  }
  return content ? { role, content } : null;
}

function buildChatBody(payload, root) {
  const stats = {
    budgetTokens: PROMPT_TOKEN_BUDGET,
    estimatedTokens: 0,
    truncated: false,
    truncatedParts: [],
    parts: { system: 0, memory: 0, contextPack: 0, skills: 0, files: 0, history: 0 },
  };
  let remaining = PROMPT_TOKEN_BUDGET;
  function take(part, text, required = false) {
    if (!text) return "";
    const tokens = estimatePromptTokens(text);
    if (tokens <= remaining) {
      remaining -= tokens;
      stats.parts[part] += tokens;
      return text;
    }
    if (required) {
      const error = new Error("prompt budget is too small for the required instructions");
      error.statusCode = 413;
      throw error;
    }
    stats.truncated = true;
    if (!stats.truncatedParts.includes(part)) stats.truncatedParts.push(part);
    const fitted = fitPromptText(text, remaining);
    const fittedTokens = estimatePromptTokens(fitted);
    remaining -= fittedTokens;
    stats.parts[part] += fittedTokens;
    return fitted;
  }

  let sys = SYSTEM + `\nCurrent repo: ${root}`;
  if (payload.codingMode === true) sys += `\n\n${CODING_WORKFLOW}`;
  sys = take("system", sys, true);

  const history = (Array.isArray(payload.messages) ? payload.messages : [])
    .slice(-100)
    .map(normalizePromptMessage)
    .filter(Boolean);
  const latest = history.pop() || null;
  const fittedLatest = latest ? take("history", latest.content) : "";

  const memory = readMemory(root);
  if (memory.trim()) sys += take("memory", `\n\nProject memory:\n${memory}`);

  if (payload.includeContext === true) {
    const pack = loadContextPack(root);
    if (pack) sys += take("contextPack", `\n\nResearch context pack:${pack}`);
  }

  const skillSlugs = Array.isArray(payload.skills) ? payload.skills : [];
  let skillBlob = "";
  for (const slug of skillSlugs.slice(0, 3)) {
    const skill = loadSkill(root, String(slug));
    if (skill) skillBlob += `\n\n--- SKILL ${skill.slug} ---\n${skill.content}`;
  }
  if (skillBlob) sys += take("skills", `\n\nActive skills:${skillBlob}`);

  const contextFiles = Array.isArray(payload.contextFiles) ? payload.contextFiles : [];
  let contextBlob = "";
  for (const rel of contextFiles.slice(0, 6)) {
    const abs = safeResolve(root, rel);
    if (abs && isProtectedRepositoryPath(path.relative(root, abs))) {
      const error = new Error("secret files are not available as chat context");
      error.statusCode = 403;
      throw error;
    }
    if (abs && existsSync(abs) && statSync(abs).isFile() && statSync(abs).size < 120000) {
      contextBlob += `\n\n--- FILE ${rel} ---\n${readFileSync(abs, "utf8").slice(0, 80000)}`;
    }
  }
  if (contextBlob) sys += take("files", `\n\nFile context:${contextBlob}`);

  const older = [];
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index];
    const content = take("history", message.content);
    if (content) older.unshift({ role: message.role, content });
  }
  let messages = [{ role: "system", content: sys }, ...older];
  if (latest && fittedLatest) messages.push({ role: latest.role, content: fittedLatest });
  messages = trimMessages(messages, { maxTurns: 16, maxChars: 28000 });
  stats.estimatedTokens = PROMPT_TOKEN_BUDGET - remaining;
  return {
    body: {
      model: payload.model || readPrefs().lastModel || MODEL,
      messages,
      temperature: 0.2,
      stream: payload.stream === true,
    },
    stats,
  };
}

const publicIndex = path.join(__dirname, "index.html");

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    if (res.headersSent) return res.destroy();
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 400;
    const message = error.statusCode ? error.message : "invalid request";
    return send(res, status, { error: message });
  });
});

async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname.startsWith("/api/") && req.method !== "GET" && req.method !== "HEAD") {
    if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
    if (!isSameOriginRequest(req)) return send(res, 403, { error: "same-origin request required" });
    if (!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers["content-type"] || ""))) {
      return send(res, 415, { error: "application/json required" });
    }
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    if (!existsSync(publicIndex)) return send(res, 500, { error: "index.html missing" });
    return send(res, 200, readFileSync(publicIndex, "utf8"), "text/html; charset=utf-8");
  }

  // static
  if (req.method === "GET") {
    const staticMap = {
      "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json; charset=utf-8"],
      "/sw.js": ["sw.js", "application/javascript; charset=utf-8"],
      "/chat-stream.mjs": ["chat-stream.mjs", "application/javascript; charset=utf-8"],
    };
    const hit = staticMap[url.pathname];
    if (hit) {
      const abs = path.join(__dirname, hit[0]);
      if (existsSync(abs)) {
        res.writeHead(200, { "Content-Type": hit[1] });
        res.end(readFileSync(abs));
        return;
      }
    }
    if (url.pathname.startsWith("/icons/")) {
      const abs = path.join(__dirname, url.pathname);
      if (existsSync(abs)) {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end(readFileSync(abs));
        return;
      }
    }
  }

  if (req.method === "GET" && url.pathname === "/api/skills") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    return send(res, 200, { skills: listSkills(root), root: skillsRoot(root) });
  }
  if (req.method === "GET" && url.pathname === "/api/skill") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    const sk = loadSkill(root, url.searchParams.get("slug") || "");
    if (!sk) return send(res, 404, { error: "not found" });
    return send(res, 200, sk);
  }

  if (req.method === "GET" && url.pathname === "/api/sessions") {
    return send(res, 200, { sessions: listSessions() });
  }
  if (req.method === "POST" && url.pathname === "/api/sessions") {
    const body = JSON.parse(await readBody(req) || "{}");
    const id = body.id || randomUUID().slice(0, 8);
    if (!isSafeRecordId(id)) return send(res, 400, { error: "invalid session id" });
    const sess = loadSession(id) || { id, title: body.title || "New session", messages: [], repo: DEFAULT_ROOT };
    if (body.messages) sess.messages = body.messages;
    if (body.title) sess.title = body.title;
    if (body.includeContext !== undefined) sess.includeContext = body.includeContext === true;
    if (body.repo) {
      try { sess.repo = canonicalRepositoryRoot(body.repo); } catch {}
    }
    const since = sess.updated || Date.now() - 7 * 86400000;
    sess.changedSince = changedSince(sess.repo || DEFAULT_ROOT, since);
    saveSession(sess);
    return send(res, 200, sess);
  }
  if (req.method === "GET" && url.pathname === "/api/session") {
    const s = loadSession(url.searchParams.get("id") || "");
    if (!s) return send(res, 404, { error: "not found" });
    return send(res, 200, s);
  }

  if (req.method === "POST" && url.pathname === "/api/repo") {
    const body = JSON.parse(await readBody(req) || "{}");
    if (!isSafeRecordId(body.sessionId)) return send(res, 400, { error: "valid sessionId required" });
    let next;
    try { next = canonicalRepositoryRoot(body.path); } catch { return send(res, 400, { error: "invalid repo" }); }
    const sess = loadSession(body.sessionId) || { id: body.sessionId, title: "New session", messages: [] };
    sess.repo = next;
    saveSession(sess);
    return send(res, 200, { ok: true, root: next, sessionId: body.sessionId });
  }

  if (req.method === "GET" && url.pathname === "/api/diagnostics") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    const diag = {
      time: new Date().toISOString(),
      repo: root,
      model: readPrefs().lastModel || MODEL,
      ollama: OLLAMA,
      skills: listSkills(root).map((s) => s.slug),
      sessions: listSessions().length,
      searchAllowed: process.env.CA_ALLOW_SEARCH !== "0",
    };
    return send(res, 200, diag);
  }

  if (req.method === "GET" && url.pathname === "/api/search") {
    const allow = process.env.CA_ALLOW_SEARCH !== "0";
    if (!allow) return send(res, 403, { error: "search disabled" });
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return send(res, 400, { error: "missing q" });
    try {
      const ddg = new URL("https://api.duckduckgo.com/");
      ddg.searchParams.set("q", q);
      ddg.searchParams.set("format", "json");
      ddg.searchParams.set("no_html", "1");
      const r = await fetch(ddg, { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      const results = [];
      if (j.AbstractText) results.push({ title: j.Heading || q, snippet: j.AbstractText, url: j.AbstractURL || "" });
      for (const t of (j.RelatedTopics || []).slice(0, 5)) {
        if (t.Text && t.FirstURL) results.push({ title: t.Text.slice(0, 80), snippet: t.Text, url: t.FirstURL });
      }
      return send(res, 200, { query: q, results, source: "duckduckgo" });
    } catch (e) {
      return send(res, 503, { error: "search unavailable", detail: String(e.message || e) });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/tool/prepare") {
    const body = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(body.sessionId);
    const tool = normalizeTool(root, body.tool);
    if (!tool) return send(res, 400, { error: "invalid tool request" });
    pruneToolApprovals();
    if (pendingToolApprovals.size >= MAX_PENDING_TOOL_APPROVALS) return send(res, 429, { error: "too many pending approvals" });
    const approvalId = randomUUID();
    const approval = {
      id: approvalId,
      sessionId: body.sessionId || null,
      tool,
      root: realpathSync(root),
      expiresAt: Date.now() + TOOL_APPROVAL_TTL_MS,
    };
    if (tool.tool === "edit") {
      const abs = safeResolve(root, tool.path);
      if (!abs) return send(res, 400, { error: "invalid tool request" });
      approval.fileSha256 = sha256(readFileSync(abs, "utf8"));
    }
    pendingToolApprovals.set(approvalId, approval);
    return send(res, 200, { approvalId });
  }

  if (req.method === "POST" && url.pathname === "/api/tool/read") {
    const body = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(body.sessionId);
    const result = readCodingTool(root, body.tool);
    return send(res, result.status, result.body);
  }

  if (req.method === "POST" && url.pathname === "/api/tool/apply") {
    const body = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(body.sessionId);
    pruneToolApprovals();
    const approval = pendingToolApprovals.get(body.approvalId);
    if (!approval) return send(res, 403, { error: "valid approval required" });
    pendingToolApprovals.delete(body.approvalId);
    if (approval.root !== realpathSync(root) || approval.sessionId !== (body.sessionId || null)) {
      return send(res, 409, { error: "session repository changed; prepare the tool again" });
    }
    const tool = approval.tool;
    if (tool.tool === "edit") {
      const abs = safeResolve(root, tool.path);
      if (!abs || !existsSync(abs)) return send(res, 404, { error: "file not found" });
      let content = readFileSync(abs, "utf8");
      if (sha256(content) !== approval.fileSha256) {
        const audited = recordToolAudit(approval, { outcome: "conflict", reason: "file_changed" });
        return send(res, 409, { error: "file changed; prepare the tool again", audited });
      }
      if (content.includes(tool.old)) {
        content = content.replace(tool.old, tool.new);
        atomicWriteFile(abs, content, statSync(abs).mode);
        const audited = recordToolAudit(approval, { outcome: "applied" });
        return send(res, 200, { ok: true, path: tool.path, audited });
      }
      return send(res, 400, { error: "old text not found" });
    }
    if (tool.tool === "create") {
      const abs = safeResolve(root, tool.path);
      if (!abs) return send(res, 400, { error: "invalid path" });
      if (existsSync(abs)) return send(res, 409, { error: "file exists" });
      const dir = path.dirname(abs);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      atomicWriteFile(abs, tool.content, 0o644);
      const audited = recordToolAudit(approval, { outcome: "applied" });
      return send(res, 200, { ok: true, path: tool.path, created: true, audited });
    }
    if (tool.tool === "patch") {
      const applied = [];
      const failed = [];
      for (const f of tool.files) {
        const abs = safeResolve(root, f.path);
        if (!abs || isProtectedRepositoryPath(f.path)) { failed.push({ path: f.path, error: "invalid" }); continue; }
        try {
          if (typeof f.content === "string" && !f.old) {
            if (!existsSync(path.dirname(abs))) mkdirSync(path.dirname(abs), { recursive: true });
            atomicWriteFile(abs, f.content, 0o644);
            applied.push(f.path);
          } else if (typeof f.old === "string" && existsSync(abs)) {
            let content = readFileSync(abs, "utf8");
            if (!content.includes(f.old)) { failed.push({ path: f.path, error: "old text not found" }); continue; }
            content = content.replace(f.old, String(f.new || ""));
            atomicWriteFile(abs, content, statSync(abs).mode);
            applied.push(f.path);
          } else {
            failed.push({ path: f.path, error: "not applicable" });
          }
        } catch (e) {
          failed.push({ path: f.path, error: String(e.message || e) });
        }
      }
      const audited = recordToolAudit(approval, { outcome: failed.length ? "partial" : "applied" });
      return send(res, failed.length ? 207 : 200, { ok: failed.length === 0, applied, failed, audited });
    }
    if (tool.tool === "shell") {
      if (process.env.CA_ALLOW_SHELL !== "1") return send(res, 403, { error: "shell disabled" });
      const { spawn } = await import("node:child_process");
      const isWin = process.platform === "win32";
      const child = spawn(isWin ? "cmd.exe" : "bash", isWin ? ["/d", "/s", "/c", tool.command] : ["-lc", tool.command], { cwd: root, windowsHide: true });
      let out = "";
      let truncated = false;
      const appendOutput = (chunk) => {
        const text = chunk.toString();
        const remaining = 8000 - out.length;
        if (text.length > remaining) truncated = true;
        if (remaining > 0) out += text.slice(0, remaining);
      };
      child.stdout.on("data", appendOutput);
      child.stderr.on("data", appendOutput);
      let timedOut = false;
      let termination = null;
      const terminateProcessTree = () => new Promise((resolve) => {
        if (!isWin) {
          child.kill();
          resolve();
          return;
        }
        if (!child.pid) return resolve();
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => {
          child.kill();
          resolve();
        });
        killer.once("close", resolve);
      });
      const timer = setTimeout(() => {
        timedOut = true;
        termination = terminateProcessTree();
      }, SHELL_TIMEOUT_MS);
      const code = await new Promise((resolve) => {
        child.once("error", () => resolve(null));
        child.once("close", resolve);
      });
      clearTimeout(timer);
      if (termination) await termination;
      const audited = recordToolAudit(approval, { outcome: timedOut ? "timeout" : "completed", code, timedOut, truncated });
      return send(res, 200, { ok: code === 0 && !timedOut, code, timedOut, truncated, output: out, audited });
    }
    return send(res, 400, { error: "unknown tool" });
  }

  
  if (req.method === "GET" && url.pathname === "/api/tasks") {
    return send(res, 200, { tasks: listTasks() });
  }
  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = JSON.parse(await readBody(req) || "{}");
    const id = body.id || randomUUID().slice(0, 8);
    if (!isSafeRecordId(id)) return send(res, 400, { error: "invalid task id" });
    const task = {
      id,
      type: body.type || "task",
      title: body.title || body.type || "Task",
      priority: Number(body.priority) || 5,
      status: "open",
      body: body.body || (body.payload && body.payload.body) || "",
      items: Array.isArray(body.items) ? body.items : [],
      payload: body.payload || {},
      skill: body.skill || null,
      created: Date.now(),
    };
    saveTask(task);
    return send(res, 200, task);
  }
  if (req.method === "GET" && url.pathname === "/api/task") {
    const t = loadTask(url.searchParams.get("id") || "");
    if (!t) return send(res, 404, { error: "not found" });
    return send(res, 200, t);
  }

  if (req.method === "POST" && url.pathname === "/api/task/include") {
    const body = JSON.parse(await readBody(req) || "{}");
    const t = loadTask(body.id || "");
    if (!t) return send(res, 404, { error: "task not found" });
    if (!Array.isArray(t.items)) t.items = [];
    const item = {
      text: String(body.text || "").slice(0, 2000),
      added: Date.now(),
    };
    if (!item.text) return send(res, 400, { error: "text required" });
    t.items.push(item);
    if (body.expandTitle && t.title.length < 120) {
      t.title = (t.title + " + " + item.text).slice(0, 120);
    }
    saveTask(t);
    return send(res, 200, { ok: true, items: t.items.length, task: t });
  }

  if (req.method === "POST" && url.pathname === "/api/task/done") {
    const body = JSON.parse(await readBody(req) || "{}");
    const t = loadTask(body.id);
    if (!t) return send(res, 404, { error: "not found" });
    t.status = "done";
    t.result = body.result || null;
    const donePath = path.join(TASKS_DONE, t.id + ".json");
    writeFileSync(donePath, JSON.stringify(t, null, 2));
    try { writeFileSync(taskFile(t.id), ""); } catch {}
    const fs = await import("node:fs");
    fs.unlinkSync(taskFile(t.id));
    return send(res, 200, { ok: true });
  }


  if (req.method === "GET" && url.pathname === "/api/memory") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    return send(res, 200, { content: readMemory(root) });
  }
  if (req.method === "POST" && url.pathname === "/api/memory") {
    const body = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(body.sessionId);
    if (body.append) appendMemory(root, String(body.append));
    if (body.replace) {
      const file = memoryFile(root);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, String(body.replace), "utf8");
    }
    return send(res, 200, { ok: true, content: readMemory(root) });
  }
  if (req.method === "GET" && url.pathname === "/api/context") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    return send(res, 200, { files: listContext(root).map((f) => f.name) });
  }
  if (req.method === "POST" && url.pathname === "/api/context/import") {
    const body = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(body.sessionId);
    const name = String(body.name || "imported.md").replace(/[^a-zA-Z0-9._-]/g, "_");
    const content = String(body.content || "");
    if (!content) return send(res, 400, { error: "empty" });
    mkdirSync(contextDir(root), { recursive: true });
    writeFileSync(path.join(contextDir(root), name), content, "utf8");
    return send(res, 200, { ok: true, name });
  }
  if (req.method === "GET" && url.pathname === "/api/session/export") {
    const s = loadSession(url.searchParams.get("id") || "");
    if (!s) return send(res, 404, { error: "not found" });
    const root = s.repo || DEFAULT_ROOT;
    s.export = {
      exportedAt: new Date().toISOString(),
      model: loadLastModel() || MODEL,
      context: contextPack(),
      changedSince: changedSince(root, s.updated || Date.now() - 7 * 86400000),
      memory: existsSync(memoryFile(root)) ? readFileSync(memoryFile(root), "utf8").slice(0, 8000) : "",
    };
    return send(res, 200, s);
  }
  if (req.method === "POST" && url.pathname === "/api/session/import") {
    const body = JSON.parse(await readBody(req) || "{}");
    if (!isSafeRecordId(body.id) || !Array.isArray(body.messages)) return send(res, 400, { error: "bad session" });
    if (body.repo !== undefined) {
      try { body.repo = canonicalRepositoryRoot(body.repo); } catch { return send(res, 400, { error: "invalid session repository" }); }
    }
    saveSession(body);
    return send(res, 200, { ok: true, id: body.id });
  }


  if (req.method === "GET" && url.pathname === "/api/secrets") {
    return send(res, 200, { names: listSecretNames(AGENT_ROOT) });
  }
  if (req.method === "POST" && url.pathname === "/api/secrets") {
    const body = JSON.parse(await readBody(req) || "{}");
    if (!body.name || body.value === undefined) return send(res, 400, { error: "name and value required" });
    setSecret(AGENT_ROOT, body.name, body.value);
    return send(res, 200, { ok: true, name: body.name });
  }
  if (req.method === "POST" && url.pathname === "/api/secrets/get") {
    const body = JSON.parse(await readBody(req) || "{}");
    const value = getSecret(AGENT_ROOT, body.name || "");
    if (!value) return send(res, 404, { error: "not found" });
    return send(res, 200, { name: body.name, value });
  }
  if (req.method === "DELETE" && url.pathname === "/api/secrets") {
    const body = JSON.parse(await readBody(req) || "{}");
    deleteSecret(AGENT_ROOT, body.name || "");
    return send(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/api/memory/search") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    const q = url.searchParams.get("q") || "";
    return send(res, 200, { results: searchMemory(AGENT_ROOT, repoKey(root), q) });
  }
  if (req.method === "POST" && url.pathname === "/api/memory/note") {
    const body = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(body.sessionId);
    if (!body.text) return send(res, 400, { error: "text required" });
    const item = addMemory(AGENT_ROOT, repoKey(root), { text: body.text, tags: body.tags || [], kind: body.kind || "note" });
    return send(res, 200, item);
  }
  if (req.method === "GET" && url.pathname === "/api/memory/index") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    return send(res, 200, { items: listMemory(AGENT_ROOT, repoKey(root)) });
  }

  if (req.method === "GET" && url.pathname === "/api/workflows") {
    return send(res, 200, { workflows: listWorkflows() });
  }
  if (req.method === "POST" && url.pathname === "/api/workflows/run") {
    const body = JSON.parse(await readBody(req) || "{}");
    const wf = getWorkflow(body.id);
    if (!wf) return send(res, 404, { error: "unknown workflow" });
    const root = rootForSession(body.sessionId);
    const prompt = `Run workflow: ${wf.title}\nSteps:\n${wf.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\nUse skill ${wf.skill} if present.`;
    return send(res, 200, { workflow: wf, prompt, repo: root });
  }

  if (req.method === "GET" && url.pathname === "/api/repo/sha") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    let head = "";
    try { head = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 4000 }).trim(); } catch {}
    const last = readLastSha(root);
    if (head) writeLastSha(root, head);
    return send(res, 200, { head, last, changed: last && head && last !== head });
  }

  if (req.method === "GET" && url.pathname === "/api/skills/doctor") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    const dirs = [
      path.join(AGENT_ROOT, "skills"),
      path.join(root, "scripts", "coding-assistant", "domain-skills"),
    ];
    const issues = [];
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        const skill = path.join(dir, name, "SKILL.md");
        if (!existsSync(skill)) continue;
        const size = statSync(skill).size;
        if (size > 8000) issues.push({ skill: name, issue: "large", bytes: size });
      }
    }
    return send(res, 200, { issues, count: issues.length });
  }


  if (req.method === "GET" && url.pathname === "/api/test/discover") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    return send(res, 200, discoverTests(root));
  }
  if (req.method === "POST" && url.pathname === "/api/test/plan") {
    const body = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(body.sessionId);
    const discovery = discoverTests(root);
    return send(res, 200, { discovery, plan: planFor(body.hint || "", discovery) });
  }


  if (req.method === "POST" && url.pathname === "/api/tasks/next") {
    const open = listTasks().filter((t) => t.status === "open");
    if (!open.length) return send(res, 200, { task: null });
    const task = loadTask(open[0].id);
    return send(res, 200, { task });
  }

if (req.method === "GET" && url.pathname === "/api/health") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    let ollama = { ok: false };
    try {
      const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      ollama = { ok: r.ok, models: (j.models || []).map((m) => m.name).filter(Boolean) };
    } catch (e) { ollama = { ok: false, error: String(e.message || e) }; }
    return send(res, 200, {
      ok: true,
      repoRoot: root,
      model: readPrefs().lastModel || MODEL,
      ollama,
      shellAllowed: process.env.CA_ALLOW_SHELL === "1",
      mode: "local-ollama",
    });
  }

  if (req.method === "GET" && url.pathname === "/api/tree") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    const rel = url.searchParams.get("path") || "";
    const abs = safeResolve(root, rel);
    if (!abs || !existsSync(abs) || !statSync(abs).isDirectory()) return send(res, 404, { error: "not a dir" });
    if (isProtectedRepositoryPath(path.relative(root, abs))) return send(res, 403, { error: "secret paths are not available" });
    const entries = readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.name !== ".git" && d.name !== "node_modules" && !isProtectedRepositoryPath(path.relative(root, path.join(abs, d.name))))
      .slice(0, 200)
      .map((d) => ({
        name: d.name,
        type: d.isDirectory() ? "dir" : "file",
        path: path.relative(root, path.join(abs, d.name)).replace(/\\/g, "/"),
      }));
    return send(res, 200, { path: path.relative(root, abs).replace(/\\/g, "/") || ".", entries });
  }

  if (req.method === "GET" && url.pathname === "/api/file") {
    const root = rootForSession(url.searchParams.get("sessionId"));
    const abs = safeResolve(root, url.searchParams.get("path") || "");
    if (!abs || !existsSync(abs) || !statSync(abs).isFile()) return send(res, 404, { error: "not found" });
    if (isProtectedRepositoryPath(path.relative(root, abs))) return send(res, 403, { error: "secret files are not available" });
    if (statSync(abs).size > 400000) return send(res, 413, { error: "too large" });
    return send(res, 200, { path: url.searchParams.get("path"), content: readFileSync(abs, "utf8") });
  }

  if (req.method === "POST" && url.pathname === "/api/context/estimate") {
    const payload = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(payload.sessionId);
    return send(res, 200, buildChatBody(payload, root).stats);
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const payload = JSON.parse(await readBody(req) || "{}");
    const root = rootForSession(payload.sessionId);
    const { body, stats } = buildChatBody(payload, root);
    res.setHeader("X-Prompt-Estimated-Tokens", String(stats.estimatedTokens));
    res.setHeader("X-Prompt-Budget-Tokens", String(stats.budgetTokens));
    res.setHeader("X-Prompt-Truncated", String(stats.truncated));

    const upstreamController = new AbortController();
    let upstreamTimedOut = false;
    const upstreamTimer = setTimeout(() => {
      upstreamTimedOut = true;
      upstreamController.abort();
    }, 300000);
    const onDisconnect = () => {
      if (!res.writableEnded) upstreamController.abort();
    };
    req.once("aborted", onDisconnect);
    res.once("close", onDisconnect);
    try {
      const r = await fetch(`${OLLAMA}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: upstreamController.signal,
      });
      if (!r.ok) {
        const t = await r.text();
        return send(res, 502, { error: "ollama", status: r.status, body: t.slice(0, 500) });
      }
      if (body.stream && r.body) {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!await writeStreamChunk(res, dec.decode(value, { stream: true }))) {
            await reader.cancel();
            return;
          }
        }
        res.end();
        return;
      }
      const data = await r.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return send(res, 200, { content, model: body.model, prompt: stats });
    } catch (e) {
      if (upstreamTimedOut && !res.headersSent && !res.destroyed) {
        return send(res, 504, { error: "ollama timed out" });
      }
      if (upstreamController.signal.aborted || res.destroyed) {
        if (!res.destroyed) res.destroy();
        return;
      }
      if (res.headersSent) return res.destroy();
      return send(res, 502, { error: String(e.message || e) });
    } finally {
      clearTimeout(upstreamTimer);
      req.off("aborted", onDisconnect);
      res.off("close", onDisconnect);
    }
  }

  send(res, 404, { error: "not found" });
}

server.listen(PORT, HOST, () => {
  console.log(`Code Agent (local Ollama) http://${HOST}:${PORT}/`);
  console.log(`Default repo: ${DEFAULT_ROOT}`);
  console.log(`Sessions: ${SESSIONS_DIR}`);
});
