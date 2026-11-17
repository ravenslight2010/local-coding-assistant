import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverPath = path.join(root, "scripts/coding-assistant/chat-ui/server.mjs");

async function availablePort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("chat UI server starts and serves the app", async () => {
  const agentRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-smoke-"));
  const port = await availablePort();
  const child = spawn(process.execPath, [serverPath, "--port", String(port)], {
    cwd: root,
    env: { ...process.env, CA_AGENT_ROOT: agentRoot, RUNCALC_REPO: root },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  const exited = once(child, "exit");

  try {
    const deadline = Date.now() + 5000;
    let response;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    assert.ok(response, `server did not become reachable${output ? `:\n${output}` : ""}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<title>Code Agent<\/title>/);

    const streamModule = await fetch(`http://127.0.0.1:${port}/chat-stream.mjs`);
    assert.equal(streamModule.status, 200);
    assert.match(streamModule.headers.get("content-type") || "", /javascript/);
    assert.match(await streamModule.text(), /consumeChatStream/);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 1000))]);
    rmSync(agentRoot, { recursive: true, force: true });
  }
});
