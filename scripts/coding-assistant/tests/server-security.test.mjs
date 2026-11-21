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
const sourcePath = path.join(fixtureRepo, "src", "main.js");
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
  mkdirSync(path.dirname(sourcePath), { recursive: true });
  writeFileSync(sourcePath, "export const answer = 42;\n");
  writeFileSync(path.join(fixtureRepo, "src", "patch..js"), "export const patch = true;\n");
  mkdirSync(path.join(fixtureRepo, ".github", "workflows"), { recursive: true });
  writeFileSync(path.join(fixtureRepo, ".github", "workflows", "ci.yml"), "# workflow_marker\n");
  writeFileSync(path.join(fixtureRepo, ".env"), "SEARCH_SECRET_VALUE=private\n");
  mkdirSync(path.join(fixtureRepo, "node_modules", "fixture"), { recursive: true });
  writeFileSync(path.join(fixtureRepo, "node_modules", "fixture", "ignored.js"), "export const answer = 42;\n");
  writeFileSync(outsidePath, "private\n");
  symlinkSync(outsidePath, path.join(fixtureRepo, "outside-link.txt"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const env = { ...process.env, RUNCALC_REPO: fixtureRepo, CA_AGENT_ROOT: agentRoot };
  env.CA_ALLOW_SEARCH = "0";
  delete env.CA_ALLOW_SHELL;
  delete env.GITHUB_TOKEN;
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

test("serves the client-side tool approval policy", async () => {
  const response = await fetch(baseUrl + "/tool-policy.mjs");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /canAutoApplyTool/);
});

test("routes approved git_pr tools to the PR handler", async () => {
  const preparedResponse = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "git_pr", title: "Test PR", body: "Testing dispatch", base: "main" },
  }));
  assert.equal(preparedResponse.status, 200);
  const { approvalId } = await preparedResponse.json();

  const appliedResponse = await post("/api/tool/apply", JSON.stringify({ approvalId }));
  assert.equal(appliedResponse.status, 400);
  assert.deepEqual(await appliedResponse.json(), { error: "no GITHUB_TOKEN in secrets" });
});

test("creates and patches new files under the selected repository", async () => {
  const traversalResponse = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "create", path: "../escape.txt", content: "outside" },
  }));
  assert.equal(traversalResponse.status, 400);
  assert.equal(existsSync(path.join(tempRoot, "escape.txt")), false);

  const createResponse = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "create", path: "new-file.txt", content: "created content" },
  }));
  assert.equal(createResponse.status, 200);
  const { approvalId: createApprovalId } = await createResponse.json();
  const createApply = await post("/api/tool/apply", JSON.stringify({ approvalId: createApprovalId }));
  assert.equal(createApply.status, 200);
  assert.equal(readFileSync(path.join(fixtureRepo, "new-file.txt"), "utf8"), "created content");

  const patchResponse = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "patch", files: [{ path: "nested/new-file.txt", content: "patched content" }] },
  }));
  assert.equal(patchResponse.status, 200);
  const { approvalId: patchApprovalId } = await patchResponse.json();
  const patchApply = await post("/api/tool/apply", JSON.stringify({ approvalId: patchApprovalId }));
  assert.equal(patchApply.status, 200);
  assert.equal(readFileSync(path.join(fixtureRepo, "nested", "new-file.txt"), "utf8"), "patched content");

  const overwrite = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "patch", files: [{ path: "nested/new-file.txt", content: "replacement" }] },
  }));
  assert.equal(overwrite.status, 200);
  const { approvalId: overwriteId } = await overwrite.json();
  const rejectedOverwrite = await post("/api/tool/apply", JSON.stringify({ approvalId: overwriteId }));
  assert.equal((await rejectedOverwrite.json()).ok, false);
  assert.equal(readFileSync(path.join(fixtureRepo, "nested", "new-file.txt"), "utf8"), "patched content");
});

test("file creation rejects protected and out-of-repository directory aliases", async () => {
  mkdirSync(path.join(fixtureRepo, ".git"), { recursive: true });
  symlinkSync(path.join(fixtureRepo, ".git"), path.join(fixtureRepo, "metadata"), "junction");
  symlinkSync(tempRoot, path.join(fixtureRepo, "outside-dir"), "junction");
  for (const path of ["metadata/nested/new.txt", "outside-dir/nested/new.txt"]) {
    const response = await post("/api/tool/prepare", JSON.stringify({
      tool: { tool: "create", path, content: "not written" },
    }));
    assert.equal(response.status, 400, path);
  }
});

test("prepares the advertised Git tools for explicit approval", async () => {
  const tools = [
    { tool: "git_status" },
    { tool: "git_pull" },
    { tool: "git_push", remote: "origin", branch: "feature/test" },
    { tool: "git_clone", url: "https://github.com/example/repo.git", dest: "repo-copy" },
  ];
  for (const tool of tools) {
    const response = await post("/api/tool/prepare", JSON.stringify({ tool }));
    assert.equal(response.status, 200, tool.tool);
  }
});

test("web test accepts only explicit local HTTP preview URLs", async () => {
  const urls = [
    "https://127.0.0.1:3000/",
    "http://example.com:3000/",
    `http://127.0.0.1:${new URL(baseUrl).port}/`,
    "http://user:password@127.0.0.1:3000/",
  ];
  for (const url of urls) {
    const response = await post("/api/web-test", JSON.stringify({ url }));
    assert.equal(response.status, 400, url);
  }
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

test("coding-mode reads stay in the repository and exclude credential files", async () => {
  const sourceResponse = await post("/api/tool/read", JSON.stringify({
    tool: { tool: "read", path: "src/main.js" },
  }));
  assert.equal(sourceResponse.status, 200);
  const source = await sourceResponse.json();
  assert.equal(source.content, "export const answer = 42;\n");

  const secretResponse = await post("/api/tool/read", JSON.stringify({
    tool: { tool: "read", path: ".env" },
  }));
  assert.equal(secretResponse.status, 403);

  const outsideResponse = await post("/api/tool/read", JSON.stringify({
    tool: { tool: "read", path: "../outside.txt" },
  }));
  assert.equal(outsideResponse.status, 404);
});

test("all file entry points reject credentials and allow legitimate dot paths", async () => {
  const fileSecret = await fetch(baseUrl + "/api/file?path=.env");
  assert.equal(fileSecret.status, 403);

  const chatSecret = await post("/api/chat", JSON.stringify({
    messages: [],
    contextFiles: [".env"],
    stream: false,
  }));
  assert.equal(chatSecret.status, 403);

  const editSecret = await post("/api/tool/prepare", JSON.stringify({
    tool: { tool: "edit", path: ".env", old: "private", new: "changed" },
  }));
  assert.equal(editSecret.status, 400);
  assert.equal(readFileSync(path.join(fixtureRepo, ".env"), "utf8"), "SEARCH_SECRET_VALUE=private\n");

  const workflow = await fetch(baseUrl + "/api/file?path=.github/workflows/ci.yml");
  assert.equal(workflow.status, 200);
  assert.match((await workflow.json()).content, /workflow_marker/);

  const doubleDot = await post("/api/tool/read", JSON.stringify({
    tool: { tool: "read", path: "src/patch..js" },
  }));
  assert.equal(doubleDot.status, 200);
  assert.match((await doubleDot.json()).content, /patch = true/);

  const gitMetadata = await fetch(baseUrl + "/api/file?path=.git/config");
  assert.equal(gitMetadata.status, 404);

  const tree = await (await fetch(baseUrl + "/api/tree")).json();
  assert.equal(tree.entries.some((entry) => entry.name === ".github"), true);
  assert.equal(tree.entries.some((entry) => entry.name === ".env"), false);
});

test("coding-mode search is literal, bounded, and skips secret and dependency files", async () => {
  const searchResponse = await post("/api/tool/read", JSON.stringify({
    tool: { tool: "search", query: "answer = 42" },
  }));
  assert.equal(searchResponse.status, 200);
  const result = await searchResponse.json();
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].path, "src/main.js");

  const broadQuery = await post("/api/tool/read", JSON.stringify({
    tool: { tool: "search", query: "a" },
  }));
  assert.equal(broadQuery.status, 400);
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
