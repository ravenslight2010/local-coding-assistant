import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverScript = path.join(repo, "scripts/coding-assistant/chat-ui/server.mjs");
const tempRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-mode-"));
const fixtureRepo = path.join(tempRoot, "repo");
const agentRoot = path.join(tempRoot, "agent");
const modelRequests = [];
let modelServer;
let appProcess;
let baseUrl;

async function availablePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

test.before(async () => {
  mkdirSync(fixtureRepo, { recursive: true });
  writeFileSync(path.join(fixtureRepo, "package.json"), "{}\n");
  const modelPort = await availablePort();
  modelServer = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    modelRequests.push(JSON.parse(raw));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "ready" } }] }));
  });
  modelServer.listen(modelPort, "127.0.0.1");
  await once(modelServer, "listening");

  const appPort = await availablePort();
  baseUrl = `http://127.0.0.1:${appPort}`;
  const env = { ...process.env, RUNCALC_REPO: fixtureRepo, CA_AGENT_ROOT: agentRoot };
  delete env.CA_ALLOW_SHELL;
  appProcess = spawn(process.execPath, [serverScript, "--port", String(appPort), "--ollama", `http://127.0.0.1:${modelPort}`], {
    cwd: repo,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) throw new Error("coding assistant server exited before startup");
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("coding assistant server did not start");
});

test.after(async () => {
  if (appProcess && appProcess.exitCode === null) {
    appProcess.kill("SIGTERM");
    await new Promise((resolve) => appProcess.once("exit", resolve));
  }
  if (modelServer?.listening) await new Promise((resolve, reject) => modelServer.close((error) => error ? reject(error) : resolve()));
  rmSync(tempRoot, { recursive: true, force: true });
});

test("coding mode adds a bounded, approval-first workflow to the model prompt", async () => {
  const response = await fetch(baseUrl + "/api/chat", {
    method: "POST",
    headers: { Origin: baseUrl, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "fixture-coder",
      messages: [{ role: "user", content: "Fix the small bug and run its test." }],
      codingMode: true,
    }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).content, "ready");

  const request = modelRequests[0];
  assert.equal(request.model, "fixture-coder");
  assert.equal(request.messages[0].role, "system");
  assert.match(request.messages[0].content, /Coding mode is enabled/);
  assert.match(request.messages[0].content, /"tool":"search"/);
  assert.match(request.messages[0].content, /"tool":"read"/);
  assert.match(request.messages[0].content, /require approval/);
  assert.match(request.messages[0].content, /untrusted data/);
});
