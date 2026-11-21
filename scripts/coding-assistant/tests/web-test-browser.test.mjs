import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverScript = path.join(repo, "scripts/coding-assistant/chat-ui/server.mjs");
const tempRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-web-test-"));
const fixtureRepo = path.join(tempRoot, "repo");
const agentRoot = path.join(tempRoot, "agent");
let serverProcess;
let baseUrl;
let serverOutput = "";

async function freePort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
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

before(async () => {
  mkdirSync(fixtureRepo, { recursive: true });
  writeFileSync(path.join(fixtureRepo, "package.json"), "{}\n");
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

test("renders a local page, captures errors, and blocks non-local writes", {
  skip: process.platform !== "win32" && !process.env.CA_TEST_BROWSER_PATH,
}, async () => {
  let mutationRequests = 0;
  const previewServer = createHttpServer((req, res) => {
    if (req.method === "POST") mutationRequests++;
    if (req.url === "/broken") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><title>Broken fixture</title><main>private page content</main>
        <script>
          console.error("fixture console issue");
          setTimeout(() => { throw new Error("fixture runtime issue"); }, 0);
          fetch("https://example.com/private-test").catch(() => {});
          fetch("/mutate", { method: "POST", body: "blocked" }).catch(() => {});
        </script>`);
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>Working fixture</title><main>private page content</main>");
  });
  await new Promise((resolve, reject) => {
    previewServer.once("error", reject);
    previewServer.listen(0, "127.0.0.1", resolve);
  });
  const previewUrl = `http://127.0.0.1:${previewServer.address().port}`;
  try {
    const passedRequest = post("/api/web-test", { url: `${previewUrl}/` });
    const concurrentResponse = await post("/api/web-test", { url: `${previewUrl}/` });
    assert.equal(concurrentResponse.status, 429);
    assert.equal(concurrentResponse.headers.get("retry-after"), "2");

    const passedResponse = await passedRequest;
    assert.equal(passedResponse.status, 200);
    const passed = await passedResponse.json();
    assert.equal(passed.passed, true);
    assert.equal(passed.status, 200);
    assert.equal(passed.title, "Working fixture");
    assert.match(passed.screenshot, /^data:image\/jpeg;base64,/);
    assert.doesNotMatch(JSON.stringify(passed), /private page content/);

    const failedResponse = await post("/api/web-test", { url: `${previewUrl}/broken` });
    assert.equal(failedResponse.status, 200);
    const failed = await failedResponse.json();
    assert.equal(failed.passed, false);
    assert.ok(failed.consoleErrors.some((message) => message.includes("fixture console issue")));
    assert.ok(failed.pageErrors.some((message) => message.includes("fixture runtime issue")));
    assert.ok(failed.blockedRequests >= 2);
    assert.match(failed.screenshot, /^data:image\/jpeg;base64,/);
    assert.equal(mutationRequests, 0);
  } finally {
    previewServer.closeAllConnections();
    await new Promise((resolve, reject) => previewServer.close((error) => error ? reject(error) : resolve()));
  }
});
