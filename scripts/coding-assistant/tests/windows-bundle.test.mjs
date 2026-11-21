import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("canonical Windows bundle is complete and its packaged server starts", { skip: process.platform === "win32" }, async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "coding-assistant-bundle-"));
  const archive = path.join(temp, "CodeAgent-Windows-Setup.zip");
  const unpacked = path.join(temp, "unpacked");
  let child;
  try {
    const packed = spawnSync("bash", [path.join(root, "scripts/ca/pack-windows-bundle.sh"), archive], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const expected = readFileSync(archive + ".sha256", "utf8").trim().split(/\s+/)[0];
    const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
    assert.equal(actual, expected);

    const extracted = spawnSync("unzip", ["-q", archive, "-d", unpacked], { encoding: "utf8" });
    assert.equal(extracted.status, 0, extracted.stderr);
    const archiveListing = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
    assert.equal(archiveListing.status, 0, archiveListing.stderr);
    assert.doesNotMatch(archiveListing.stdout, /scripts\/coding-assistant\/chat-ui\/node_modules\//);
    for (const relative of [
      "CA-Setup.cmd",
      "scripts/ca/setup.ps1",
      "scripts/ca/Select-CodingModel.ps1",
      "scripts/coding-assistant/chat-ui/server.mjs",
      "scripts/coding-assistant/chat-ui/index.html",
      "scripts/coding-assistant/chat-ui/chat-stream.mjs",
      "scripts/coding-assistant/chat-ui/open-app.ps1",
      "scripts/coding-assistant/chat-ui/package.json",
      "scripts/coding-assistant/chat-ui/package-lock.json",
    ]) {
      assert.equal(spawnSync("test", ["-f", path.join(unpacked, relative)]).status, 0, relative);
    }

    const port = 17843 + Math.floor(Math.random() * 1000);
    const agentRoot = path.join(temp, "agent");
    child = spawn(process.execPath, [
      path.join(unpacked, "scripts/coding-assistant/chat-ui/server.mjs"),
      "--port", String(port),
    ], {
      cwd: unpacked,
      env: { ...process.env, RUNCALC_REPO: unpacked, CA_AGENT_ROOT: agentRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const deadline = Date.now() + 5000;
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
    assert.match(await response.text(), /<title>Code Agent<\/title>/);
    const stream = await fetch(`http://127.0.0.1:${port}/chat-stream.mjs`);
    assert.equal(stream.status, 200);
    assert.match(await stream.text(), /consumeChatStream/);
    const toolPolicy = await fetch(`http://127.0.0.1:${port}/tool-policy.mjs`);
    assert.equal(toolPolicy.status, 200);
    assert.match(await toolPolicy.text(), /canAutoApplyTool/);
    assert.ok(readdirSync(agentRoot).includes("sessions"));
  } finally {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    rmSync(temp, { recursive: true, force: true });
  }
});
