import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const packagedRoot = process.env.CA_PACKAGED_ROOT;

test("extracted Windows bundle serves the complete UI", { skip: !packagedRoot }, async () => {
  const agentRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-packaged-"));
  const port = 18843 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, [
    path.join(packagedRoot, "scripts/coding-assistant/chat-ui/server.mjs"),
    "--port", String(port),
  ], {
    cwd: packagedRoot,
    env: { ...process.env, RUNCALC_REPO: packagedRoot, CA_AGENT_ROOT: agentRoot },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  try {
    const deadline = Date.now() + 10000;
    let response;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
        if (response.ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(response?.status, 200, output);
    const html = await response.text();
    assert.match(html, /import \{ consumeChatStream \} from "\/chat-stream.mjs"/);
    const stream = await fetch(`http://127.0.0.1:${port}/chat-stream.mjs`);
    assert.equal(stream.status, 200);
    assert.match(await stream.text(), /consumeChatStream/);
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    rmSync(agentRoot, { recursive: true, force: true });
  }
});
