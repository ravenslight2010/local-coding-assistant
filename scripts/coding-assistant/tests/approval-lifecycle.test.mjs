import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import http from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverScript = path.join(sourceRepo, "scripts/coding-assistant/chat-ui/server.mjs");
const tempRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-lifecycle-"));
const fixtureRepo = path.join(tempRoot, "repo");
const agentRoot = path.join(tempRoot, "agent");
const editPath = path.join(fixtureRepo, "sample.txt");
const auditPath = path.join(agentRoot, "audit", "tool-actions.json");
let serverProcess;
let upstream;
let baseUrl;
let serverOutput = "";
let upstreamDisconnected = false;
let activeStream;

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function post(pathname, body) {
  return fetch(baseUrl + pathname, {
    method: "POST",
    headers: { Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function prepare(tool, sessionId = "lifecycle-session") {
  const response = await post("/api/tool/prepare", { sessionId, tool });
  assert.equal(response.status, 200);
  return (await response.json()).approvalId;
}

before(async () => {
  mkdirSync(fixtureRepo, { recursive: true });
  writeFileSync(path.join(fixtureRepo, "package.json"), "{}\n");
  writeFileSync(editPath, "before\n");

  upstream = createHttpServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (body.stream) {
        upstreamDisconnected = false;
        activeStream = res;
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write('data: {"choices":[{"delta":{"content":"started"}}]}\n\n');
        const interval = setInterval(() => res.write('data: {"choices":[{"delta":{"content":"more"}}]}\n\n'), 20);
        res.on("close", () => {
          clearInterval(interval);
          if (!res.writableEnded) upstreamDisconnected = true;
          activeStream = null;
        });
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ready" } }] }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [serverScript, "--port", String(port), "--ollama", upstreamUrl], {
    cwd: sourceRepo,
    env: {
      ...process.env,
      RUNCALC_REPO: fixtureRepo,
      CA_AGENT_ROOT: agentRoot,
      CA_ALLOW_SHELL: "1",
      CA_SHELL_TIMEOUT_MS: "1000",
      CA_AUDIT_LIMIT: "3",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.setEncoding("utf8").on("data", (data) => { serverOutput += data; });
  serverProcess.stderr.setEncoding("utf8").on("data", (data) => { serverOutput += data; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`server exited early: ${serverOutput}`);
    try {
      if ((await fetch(baseUrl + "/api/sessions")).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready: ${serverOutput}`);
});

after(async () => {
  if (activeStream && !activeStream.destroyed) activeStream.destroy();
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      serverProcess.once("exit", () => { clearTimeout(timeout); resolve(); });
    });
  }
  if (upstream) {
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
  }
  rmSync(tempRoot, { recursive: true, force: true });
});

test("stale approvals preserve newer content and successful edits are atomic", async () => {
  const staleApproval = await prepare({ tool: "edit", path: "sample.txt", old: "before", new: "approved" });
  writeFileSync(editPath, "newer-user-content\n");
  const stale = await post("/api/tool/apply", { sessionId: "lifecycle-session", approvalId: staleApproval });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error, "file changed; prepare the tool again");
  assert.equal(readFileSync(editPath, "utf8"), "newer-user-content\n");

  const approvalId = await prepare({ tool: "edit", path: "sample.txt", old: "newer-user-content", new: "after" });
  const applied = await post("/api/tool/apply", { sessionId: "lifecycle-session", approvalId });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).audited, true);
  assert.equal(readFileSync(editPath, "utf8"), "after\n");
  assert.equal(readdirSync(fixtureRepo).some((name) => name.endsWith(".tmp")), false);
});

test("approved commands time out and audits exclude command and edit contents", async () => {
  const command = 'node -e "console.log(\'audit_command_marker\')"';
  const approvalId = await prepare({ tool: "shell", command });
  const completed = await post("/api/tool/apply", { sessionId: "lifecycle-session", approvalId });
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).ok, true);

  const timeoutApproval = await prepare({ tool: "shell", command: 'node -e "setTimeout(() => {}, 5000)"' });
  const started = Date.now();
  const timedOutResponse = await post("/api/tool/apply", { sessionId: "lifecycle-session", approvalId: timeoutApproval });
  const timedOut = await timedOutResponse.json();
  assert.equal(timedOutResponse.status, 200);
  assert.equal(timedOut.timedOut, true);
  assert.equal(timedOut.ok, false);
  assert.equal(Date.now() - started < 2500, true);

  const records = JSON.parse(readFileSync(auditPath, "utf8"));
  assert.equal(records.length, 3);
  assert.deepEqual(records.map((record) => record.outcome), ["applied", "completed", "timeout"]);
  const audit = JSON.stringify(records);
  assert.equal(audit.includes("audit_command_marker"), false);
  assert.equal(audit.includes("node -e"), false);
  assert.equal(audit.includes("newer-user-content"), false);
  assert.equal(audit.includes("after"), false);
  assert.equal(typeof records.at(-1).commandHash, "string");
  assert.equal(records.at(-1).commandHash.length, 64);
});

test("browser disconnect aborts an active upstream Ollama stream", async () => {
  await new Promise((resolve, reject) => {
    const request = http.request(baseUrl + "/api/chat", {
      method: "POST",
      headers: { Origin: baseUrl, "Content-Type": "application/json" },
    }, (response) => {
      response.once("data", () => {
        response.destroy();
        request.destroy();
        resolve();
      });
    });
    request.on("error", () => {});
    request.end(JSON.stringify({ messages: [], stream: true }));
  });

  const deadline = Date.now() + 3000;
  while (!upstreamDisconnected && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(upstreamDisconnected, true);
});

test("Windows timeout path requests forced process-tree termination", () => {
  const source = readFileSync(serverScript, "utf8");
  assert.match(source, /spawn\("taskkill", \["\/pid", String\(child\.pid\), "\/t", "\/f"\]/);
});
