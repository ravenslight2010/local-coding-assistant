import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("one-click bootstrap is commit-pinned, hash-verified, and avoids execution-policy bypass", () => {
  const source = readFileSync(path.join(root, "Get-CodeAgent.cmd"), "utf8");
  assert.match(source, /set "VERSION=[0-9a-f]{40}"/);
  assert.match(source, /set "EXPECTED=[0-9a-f]{64}"/);
  assert.match(source, /codeload\.github\.com\/ravenslight2010\/local-coding-assistant\/zip\/%VERSION%/);
  assert.match(source, /Get-FileHash/);
  assert.doesNotMatch(source, /raw\.githubusercontent\.com.*setup\.ps1/);
  assert.doesNotMatch(source, /ExecutionPolicy Bypass/i);
});
