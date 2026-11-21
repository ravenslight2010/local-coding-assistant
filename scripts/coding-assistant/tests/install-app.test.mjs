import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const ui = fileURLToPath(new URL("../chat-ui/", import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), "coder-install-"));
let base;
let server;

function fixture(name, script) {
  const root = path.join(temp, name);
  mkdirSync(root);
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name, version: "1.0.0", scripts: { start: "node fixture.cjs" } }));
  writeFileSync(path.join(root, "fixture.cjs"), script);
  return root;
}

async function post(route, body) {
  const response = await fetch(base + route, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: await response.json() };
}

async function select(sessionId, root) {
  assert.equal((await post("/api/repo", { sessionId, path: root })).status, 200);
}

async function plan(sessionId) {
  const result = await post("/api/install/plan", { sessionId });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body;
}

before(async () => {
  const portHolder = createServer();
  await new Promise((resolve) => portHolder.listen(0, "127.0.0.1", resolve));
  const { port } = portHolder.address();
  await new Promise((resolve) => portHolder.close(resolve));
  base = `http://127.0.0.1:${port}`;
  const defaultRepo = fixture("default", "throw new Error('wrong repository')");
  server = spawn(process.execPath, [path.join(ui, "server.mjs"), "--port", String(port)], {
    env: {
      ...process.env, RUNCALC_REPO: defaultRepo, CA_AGENT_ROOT: path.join(temp, "agent"),
      npm_config_offline: "true", npm_config_audit: "false", npm_config_fund: "false",
    },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    if (await fetch(base + "/api/sessions").then((response) => response.ok, () => false)) return;
    await delay(50);
  }
  throw new Error("Code Agent did not start");
});

after(async () => {
  if (server?.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  rmSync(temp, { recursive: true, force: true });
});

test("requires confirmation of the current repo and detects Code Agent's Windows setup", async () => {
  const first = fixture("first", "");
  const second = fixture("second", "");
  await select("switch-repo", first);
  const { planId } = await plan("switch-repo");
  assert.equal((await post("/api/install", { sessionId: "switch-repo" })).status, 409);
  await select("switch-repo", second);
  assert.equal((await post("/api/install", { sessionId: "switch-repo", planId })).status, 409);
  assert.equal((await post("/api/install/plan", { sessionId: "missing" })).status, 400);
  mkdirSync(path.join(second, "scripts", "ca"), { recursive: true });
  writeFileSync(path.join(second, "scripts", "ca", "setup.ps1"), "");
  writeFileSync(path.join(second, "CA-Setup.cmd"), "");
  assert.match((await post("/api/install/plan", { sessionId: "switch-repo" })).body.error, /CA-Setup\.cmd/);
});

test("reports app launch while the selected project's local server is still serving", async () => {
  const root = fixture("service", `
    const fs = require("node:fs");
    const http = require("node:http");
    const stop = setTimeout(() => process.exit(0), 20_000);
    const app = http.createServer((req, res) => {
      res.end("fixture");
      if (req.url === "/stop") { clearTimeout(stop); app.close(); }
    });
    app.listen(0, "127.0.0.1", () => fs.writeFileSync("port.txt", String(app.address().port)));
  `);
  const portFile = path.join(root, "port.txt");
  await select("service", root);
  const { planId } = await plan("service");
  try {
    const result = await post("/api/install", { sessionId: "service", planId });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.status, "launched");
    for (let i = 0; !existsSync(portFile) && i < 100; i++) await delay(30);
    const appUrl = `http://127.0.0.1:${readFileSync(portFile, "utf8")}`;
    assert.equal(await (await fetch(appUrl)).text(), "fixture");
    const duplicate = await post("/api/install", { sessionId: "service", planId });
    assert.match(duplicate.body.error, /already running/);
  } finally {
    if (existsSync(portFile)) await fetch(`http://127.0.0.1:${readFileSync(portFile, "utf8")}/stop`).catch(() => {});
  }
});

test("reports dependency setup failure without running the app", async () => {
  const root = fixture("setup-fails", "require('node:fs').writeFileSync('installed.txt', 'unexpected')");
  const packagePath = path.join(root, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  pkg.scripts.preinstall = "node -e \"process.exit(7)\"";
  writeFileSync(packagePath, JSON.stringify(pkg));
  await select("setup-fails", root);
  const { planId } = await plan("setup-fails");
  const result = await post("/api/install", { sessionId: "setup-fails", planId });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Installation exited with code 7/);
  assert.equal(existsSync(path.join(root, "installed.txt")), false);
});

test("Install app shows the selected repo, cancels without running it, and completes after approval", {
  skip: process.platform !== "win32" && !process.env.CA_TEST_BROWSER_PATH,
}, async () => {
  const root = fixture("browser-install", "require('node:fs').writeFileSync('installed.txt', 'ok')");
  await select("browser-install", root);
  const { chromium } = createRequire(path.join(ui, "package.json"))("playwright-core");
  const browser = await chromium.launch({
    ...(process.env.CA_TEST_BROWSER_PATH ? { executablePath: process.env.CA_TEST_BROWSER_PATH } : { channel: "msedge" }),
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem("ca_session", "browser-install"));
    await page.goto(base);
    const button = page.getByRole("button", { name: "Install app" });
    const cancel = page.waitForEvent("dialog").then(async (dialog) => {
      const message = dialog.message();
      await dialog.dismiss();
      return message;
    });
    await button.click();
    const prompt = await cancel;
    assert.ok(prompt.includes(root), prompt);
    assert.match(prompt, /npm install/);
    assert.equal(existsSync(path.join(root, "installed.txt")), false);
    const confirm = page.waitForEvent("dialog").then((dialog) => dialog.accept());
    await button.click();
    await confirm;
    await page.getByText(/^Installation complete\./).waitFor({ timeout: 15_000 });
    const marker = path.join(root, "installed.txt");
    for (let i = 0; !existsSync(marker) && i < 100; i++) await delay(30);
    assert.equal(readFileSync(marker, "utf8"), "ok");
  } finally {
    await browser.close();
  }
});
