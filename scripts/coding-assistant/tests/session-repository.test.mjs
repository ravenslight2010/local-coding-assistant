import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverScript = path.join(sourceRepo, "scripts/coding-assistant/chat-ui/server.mjs");
const tempRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-sessions-"));
const firstRepo = path.join(tempRoot, "first");
const secondRepo = path.join(tempRoot, "second");
const agentRoot = path.join(tempRoot, "agent");
const prompts = [];
let serverProcess;
let upstream;
let baseUrl;
let serverOutput = "";

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

before(async () => {
  for (const [repo, marker] of [[firstRepo, "first"], [secondRepo, "second"]]) {
    mkdirSync(repo, { recursive: true });
    writeFileSync(path.join(repo, "package.json"), "{}\n");
    writeFileSync(path.join(repo, "identity.txt"), marker + "\n");
  }

  upstream = createHttpServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags") {
        res.end(JSON.stringify({ models: [] }));
        return;
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      prompts.push(body);
      res.end(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [serverScript, "--port", String(port), "--ollama", upstreamUrl], {
    cwd: sourceRepo,
    env: { ...process.env, RUNCALC_REPO: firstRepo, CA_AGENT_ROOT: agentRoot },
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

test("two sessions retain independent repositories for files, tools, edits, and prompts", async () => {
  for (const [sessionId, repo] of [["first-session", firstRepo], ["second-session", secondRepo]]) {
    const response = await post("/api/repo", { sessionId, path: repo });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).root, realpathSync(repo));
  }

  const restored = await (await fetch(baseUrl + "/api/session?id=second-session")).json();
  assert.equal(restored.repo, realpathSync(secondRepo));

  for (const [sessionId, repo, expected] of [["first-session", firstRepo, "first\n"], ["second-session", secondRepo, "second\n"]]) {
    const file = await fetch(baseUrl + `/api/file?path=identity.txt&sessionId=${sessionId}`);
    assert.equal(file.status, 200);
    assert.equal((await file.json()).content, expected);

    const read = await post("/api/tool/read", { sessionId, tool: { tool: "read", path: "identity.txt" } });
    assert.equal(read.status, 200);
    assert.equal((await read.json()).content, expected);

    const chat = await post("/api/chat", { sessionId, messages: [], stream: false });
    assert.equal(chat.status, 200);
    const prompt = prompts.at(-1);
    assert.equal(prompt.messages[0].content.includes(`Current repo: ${realpathSync(repo)}`), true);
  }

  const wrongSessionPreparation = await post("/api/tool/prepare", {
    sessionId: "second-session",
    tool: { tool: "edit", path: "identity.txt", old: "second", new: "updated" },
  });
  assert.equal(wrongSessionPreparation.status, 200);
  const { approvalId } = await wrongSessionPreparation.json();
  const wrongSessionApply = await post("/api/tool/apply", { sessionId: "first-session", approvalId });
  assert.equal(wrongSessionApply.status, 409);
  assert.equal(readFileSync(path.join(secondRepo, "identity.txt"), "utf8"), "second\n");

  const preparation = await post("/api/tool/prepare", {
    sessionId: "second-session",
    tool: { tool: "edit", path: "identity.txt", old: "second", new: "updated" },
  });
  const approved = await preparation.json();
  const applied = await post("/api/tool/apply", { sessionId: "second-session", approvalId: approved.approvalId });
  assert.equal(applied.status, 200);
  assert.equal(readFileSync(path.join(secondRepo, "identity.txt"), "utf8"), "updated\n");
  assert.equal(readFileSync(path.join(firstRepo, "identity.txt"), "utf8"), "first\n");

  const firstAgain = await fetch(baseUrl + "/api/file?path=identity.txt&sessionId=first-session");
  assert.equal((await firstAgain.json()).content, "first\n");
});

test("folder browsing lists only directories and requires a same-origin request", async () => {
  writeFileSync(path.join(tempRoot, "not-a-folder.txt"), "");
  const response = await post("/api/browse", { path: tempRoot });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.path, realpathSync(tempRoot));
  assert.equal(result.isRepository, false);
  assert.ok(result.folders.some((folder) => folder.path === realpathSync(secondRepo)));
  assert.ok(!result.folders.some((folder) => folder.name === "not-a-folder.txt"));
  const repository = await post("/api/browse", { path: secondRepo });
  assert.equal((await repository.json()).isRepository, true);
  assert.equal((await post("/api/browse", { path: "relative/path" })).status, 400);
  assert.equal((await post("/api/browse", { path: path.join(tempRoot, "missing") })).status, 400);
  assert.equal((await fetch(baseUrl + "/api/browse", {
    method: "POST",
    headers: { Origin: "https://example.invalid", "Content-Type": "application/json" },
    body: JSON.stringify({ path: tempRoot }),
  })).status, 403);
});

test("Browse opens inside the app and selects a repository at desktop and phone widths", {
  skip: process.platform !== "win32" && !process.env.CA_TEST_BROWSER_PATH,
}, async () => {
  const runtime = path.join(sourceRepo, "scripts/coding-assistant/chat-ui/package.json");
  const { chromium } = createRequire(runtime)("playwright-core");
  const browser = await chromium.launch(process.env.CA_TEST_BROWSER_PATH
    ? { executablePath: process.env.CA_TEST_BROWSER_PATH }
    : { channel: "msedge" });
  try {
    for (const viewport of [{ width: 1366, height: 768 }, { width: 768, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.addInitScript((id) => localStorage.setItem("ca_session", id), "first-session");
      await page.goto(baseUrl);
      const browseButton = page.getByRole("button", { name: "Browse", exact: true });
      const dialog = page.getByRole("dialog", { name: "Choose a repository folder" });
      await browseButton.focus();
      await page.keyboard.press("Enter");
      const folderPath = dialog.getByRole("textbox", { name: "Folder path" });
      await folderPath.waitFor();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await browseButton.evaluate((button) => document.activeElement === button), true);
      await browseButton.click();
      await folderPath.fill(path.join(tempRoot, "missing"));
      await folderPath.press("Enter");
      await dialog.getByText(/Couldn’t open the folder/).waitFor();
      await folderPath.fill(tempRoot);
      await folderPath.press("Enter");
      const useFolder = dialog.getByRole("button", { name: "Use this folder" });
      assert.equal(await useFolder.isDisabled(), true);
      await dialog.getByRole("button", { name: "second", exact: true }).click();
      await dialog.getByText(/Repository found/).waitFor();
      const box = await dialog.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= viewport.width);
      await useFolder.click();
      await dialog.waitFor({ state: "hidden" });
      const saved = await (await fetch(baseUrl + "/api/session?id=first-session")).json();
      assert.equal(saved.repo, realpathSync(secondRepo));
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
