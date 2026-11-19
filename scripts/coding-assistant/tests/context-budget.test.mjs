import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const serverScript = path.join(sourceRepo, "scripts/coding-assistant/chat-ui/server.mjs");
const indexPath = path.join(sourceRepo, "scripts/coding-assistant/chat-ui/index.html");
const tempRoot = mkdtempSync(path.join(tmpdir(), "coding-assistant-context-"));
const firstRepo = path.join(tempRoot, "first");
const secondRepo = path.join(tempRoot, "second");
const agentRoot = path.join(tempRoot, "agent");
const skillsRoot = path.join(tempRoot, "skills");
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
  for (const repo of [firstRepo, secondRepo]) {
    mkdirSync(repo, { recursive: true });
    writeFileSync(path.join(repo, "package.json"), "{}\n");
  }
  writeFileSync(path.join(firstRepo, "selected.txt"), "SELECTED_FILE_MARKER\n");
  mkdirSync(path.join(skillsRoot, "demo"), { recursive: true });
  writeFileSync(path.join(skillsRoot, "demo", "SKILL.md"), "SKILL_MARKER\n");

  upstream = createHttpServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      prompts.push(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "ready" } }] }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [serverScript, "--port", String(port), "--ollama", `http://127.0.0.1:${upstream.address().port}`], {
    cwd: sourceRepo,
    env: {
      ...process.env,
      RUNCALC_REPO: firstRepo,
      CA_AGENT_ROOT: agentRoot,
      CA_SKILLS_DIR: skillsRoot,
      CA_PROMPT_TOKEN_BUDGET: "900",
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

test("memory and imported context are isolated by repository and the pack is opt-in", async () => {
  for (const [sessionId, repo] of [["first-context", firstRepo], ["second-context", secondRepo]]) {
    const response = await post("/api/repo", { sessionId, path: repo });
    assert.equal(response.status, 200);
  }
  assert.equal((await post("/api/memory", { sessionId: "first-context", append: "MEMORY_MARKER" })).status, 200);
  assert.equal((await post("/api/context/import", { sessionId: "first-context", name: "research.md", content: "CONTEXT_PACK_MARKER" })).status, 200);

  const secondMemory = await (await fetch(baseUrl + "/api/memory?sessionId=second-context")).json();
  const secondContext = await (await fetch(baseUrl + "/api/context?sessionId=second-context")).json();
  assert.equal(secondMemory.content, "");
  assert.deepEqual(secondContext.files, []);

  const payload = {
    sessionId: "first-context",
    messages: [{ role: "user", content: "LATEST_MARKER" }],
    contextFiles: ["selected.txt"],
    skills: ["demo"],
    includeContext: false,
    stream: false,
  };
  const response = await post("/api/chat", payload);
  assert.equal(response.status, 200);
  const system = prompts.at(-1).messages[0].content;
  assert.match(system, /MEMORY_MARKER/);
  assert.match(system, /SELECTED_FILE_MARKER/);
  assert.match(system, /SKILL_MARKER/);
  assert.doesNotMatch(system, /CONTEXT_PACK_MARKER/);

  payload.includeContext = true;
  assert.equal((await post("/api/chat", payload)).status, 200);
  assert.match(prompts.at(-1).messages[0].content, /CONTEXT_PACK_MARKER/);

  const second = await post("/api/chat", { sessionId: "second-context", messages: [{ role: "user", content: "SECOND_REPO_MARKER" }], includeContext: true });
  assert.equal(second.status, 200);
  const secondPrompt = JSON.stringify(prompts.at(-1));
  assert.doesNotMatch(secondPrompt, /MEMORY_MARKER|CONTEXT_PACK_MARKER|SELECTED_FILE_MARKER/);
});

test("one estimate covers memory, pack, skills, files, attachments, and history", async () => {
  const payload = {
    sessionId: "first-context",
    messages: [
      { role: "user", content: "OLD_HISTORY_MARKER" },
      { role: "assistant", content: "ATTACHMENT_HOLDER", attachments: [{ name: "notes.txt", text: "ATTACHMENT_MARKER" }] },
      { role: "user", content: "LATEST_MARKER" },
    ],
    contextFiles: ["selected.txt"],
    skills: ["demo"],
    includeContext: true,
    stream: false,
  };
  const estimateResponse = await post("/api/context/estimate", payload);
  assert.equal(estimateResponse.status, 200);
  const estimate = await estimateResponse.json();
  assert.equal(estimate.budgetTokens, 900);
  assert.equal(estimate.estimatedTokens <= estimate.budgetTokens, true);
  for (const part of ["memory", "contextPack", "skills", "files", "history"]) {
    assert.equal(estimate.parts[part] > 0, true, part);
  }

  const response = await post("/api/chat", payload);
  assert.equal(response.status, 200);
  assert.equal(Number(response.headers.get("X-Prompt-Estimated-Tokens")), estimate.estimatedTokens);
  const serialized = JSON.stringify(prompts.at(-1));
  for (const marker of ["MEMORY_MARKER", "CONTEXT_PACK_MARKER", "SKILL_MARKER", "SELECTED_FILE_MARKER", "OLD_HISTORY_MARKER", "ATTACHMENT_MARKER", "LATEST_MARKER"]) {
    assert.match(serialized, new RegExp(marker));
  }
});

test("oversized history is truncated within the total budget while the latest request survives", async () => {
  const payload = {
    sessionId: "first-context",
    messages: [
      { role: "user", content: "HISTORY_FILLER".repeat(5000) },
      { role: "user", content: "LATEST_REQUEST_SURVIVES" },
    ],
    contextFiles: ["selected.txt"],
    skills: ["demo"],
    includeContext: true,
    stream: false,
  };
  const estimate = await (await post("/api/context/estimate", payload)).json();
  assert.equal(estimate.truncated, true);
  assert.equal(estimate.truncatedParts.includes("history"), true);
  assert.equal(estimate.estimatedTokens <= 900, true);

  const response = await post("/api/chat", payload);
  assert.equal(response.status, 200);
  const prompt = prompts.at(-1);
  assert.equal(prompt.messages.at(-1).content, "LATEST_REQUEST_SURVIVES");
  assert.equal(JSON.stringify(prompt).includes("HISTORY_FILLER".repeat(5000)), false);
  assert.match(JSON.stringify(prompt), /truncated to fit the total prompt budget/);
});

test("session opt-in persists and the browser uses server content estimates", async () => {
  const saved = await post("/api/sessions", { id: "first-context", includeContext: true });
  assert.equal(saved.status, 200);
  const restored = await (await fetch(baseUrl + "/api/session?id=first-context")).json();
  assert.equal(restored.includeContext, true);

  const html = readFileSync(indexPath, "utf8");
  assert.match(html, /id="contextPack"/);
  assert.match(html, /\/api\/context\/estimate/);
  assert.match(html, /promptPayload\(codingMode\)/);
  assert.doesNotMatch(html, /join\(" "\)\.length \/ 4/);
});
