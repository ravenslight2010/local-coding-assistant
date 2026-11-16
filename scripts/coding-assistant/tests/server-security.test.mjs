import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverScript = path.join(repo, "scripts/coding-assistant/chat-ui/server.mjs");
const tempRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-security-"));
const fixtureRepo = path.join(tempRoot, "repo");
const agentRoot = path.join(tempRoot, "agent");
const samplePath = path.join(fixtureRepo, "sample.txt");
const outsidePath = path.join(tempRoot, "outside.txt");
const escapedSessionPath = path.join(tempRoot, "escaped.json");
const escapedTaskPath = path.join(tempRoot, "task-escaped.json");
let serverProcess;
let baseUrl;
let serverOutput = "";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function post(pathname, body, headers = {}) {
  return fetch(baseUrl + pathname, {
    method: "POST",
    headers: {
      Origin: baseUrl,
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
}

before(async () => {
  mkdirSync(fixtureRepo, { recursive: true });
  writeFileSync(path.join(fixtureRepo, "package.json"), "{}\n");
  writeFileSync(samplePath, "before\n");
  writeFileSync(outsidePath, "private\n");
  symlinkSync(outsidePath, path.join(fixtureRepo, "outside-link.txt"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env, RUNCALC_REPO: fixtureRepo, CA_AGENT_ROOT: agentRoot };
  delete env.CA_ALLOW_SEARCH;
  delete env.CA_ALLOW_SHELL;
  serverProcess = spawn(process.execPath, [serverScript, "--port", String(port)], {
    cwd: repo,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.setEncoding("utf8").on("data", (data) => { serverOutput += data; });
  serverProcess.stderr.setEncoding("utf8").on("data", (data) => { serverOutput += data; });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`server exited early: ${serverOutput}`);
    try {
      const response = await fetch(baseUrl + "/api/sessions");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become ready: ${serverOutput}`);
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2000);
      serverProcess.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  rmSync(tempRoot, { recursive: true, force: true });
});

test("rejects cross-origin tool preparation", async () => {
  const response = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "edit", path: "sample.txt", old: "before", new: "changed" },
  }), { Origin: "https://untrusted.example", "Content-Type": "text/plain" });
  assert.equal(response.status, 403);
  assert.equal(readFileSync(samplePath, "utf8"), "before\n");
});

test("requires JSON for same-origin API writes", async () => {
  const response = await post("/api/tool/prepare", "{}", { "Content-Type": "text/plain" });
  assert.equal(response.status, 415);
});

test("rejects traversal IDs for sessions and tasks", async () => {
  const sessionResponse = await post("/api/sessions", JSON.stringify({ id: "../../escaped" }));
  assert.equal(sessionResponse.status, 400);
  assert.equal(existsSync(escapedSessionPath), false);

  const importResponse = await post("/api/session/import", JSON.stringify({
    id: "../../escaped",
    messages: [],
  }));
  assert.equal(importResponse.status, 400);
  assert.equal(existsSync(escapedSessionPath), false);

  const taskResponse = await post("/api/tasks", JSON.stringify({ id: "../../task-escaped" }));
  assert.equal(taskResponse.status, 400);
  assert.equal(existsSync(escapedTaskPath), false);
});

test("does not read a symlink outside the selected repository", async () => {
  const response = await fetch(baseUrl + "/api/file?path=outside-link.txt");
  assert.equal(response.status, 404);

  const prepareResponse = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "edit", path: "outside-link.txt", old: "private", new: "changed" },
  }));
  assert.equal(prepareResponse.status, 400);
  assert.equal(readFileSync(outsidePath, "utf8"), "private\n");
});

test("applies only the exact prepared tool once", async () => {
  const prepareResponse = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "edit", path: "sample.txt", old: "before", new: "after" },
  }));
  assert.equal(prepareResponse.status, 200);
  const { approvalId } = await prepareResponse.json();
  assert.equal(typeof approvalId, "string");
  assert.equal(readFileSync(samplePath, "utf8"), "before\n");

  const applyResponse = await post("/api/tool/apply", JSON.stringify({ approvalId }));
  assert.equal(applyResponse.status, 200);
  assert.equal(readFileSync(samplePath, "utf8"), "after\n");

  const replayResponse = await post("/api/tool/apply", JSON.stringify({ approvalId }));
  assert.equal(replayResponse.status, 403);
});

test("rejects direct tool payloads without an approval token", async () => {
  writeFileSync(samplePath, "before\n");
  const response = await post("/api/tool/apply", JSON.stringify({
    tool: "edit",
    path: "sample.txt",
    old: "before",
    new: "changed",
  }));
  assert.equal(response.status, 403);
  assert.equal(readFileSync(samplePath, "utf8"), "before\n");
});

test("cannot enable search with a query parameter", async () => {
  const response = await fetch(baseUrl + "/api/search?force=1&q=test");
  assert.equal(response.status, 403);
});

test("rejects request bodies larger than one mebibyte", async () => {
  const response = await post("/api/memory", JSON.stringify({ append: "x".repeat(1024 * 1024) }));
  assert.equal(response.status, 413);
});
