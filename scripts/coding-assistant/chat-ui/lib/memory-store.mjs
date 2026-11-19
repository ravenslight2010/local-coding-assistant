import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

function file(agentRoot, repoKey) {
  return path.join(agentRoot, "repositories", repoKey, "memory-index.json");
}
function load(agentRoot, repoKey) {
  const p = file(agentRoot, repoKey);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return []; }
}
function save(agentRoot, repoKey, items) {
  const p = file(agentRoot, repoKey);
  const dir = path.dirname(p);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(p, JSON.stringify(items.slice(-500), null, 2));
}
function score(text, q) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const t = text.toLowerCase();
  return terms.reduce((n, term) => n + (t.includes(term) ? 1 : 0), 0);
}

export function addMemory(agentRoot, repoKey, { text, tags = [], kind = "note" }) {
  const items = load(agentRoot, repoKey);
  const item = { id: randomUUID().slice(0, 8), text: String(text).slice(0, 4000), tags, kind, created: Date.now() };
  items.push(item);
  save(agentRoot, repoKey, items);
  return item;
}
export function searchMemory(agentRoot, repoKey, query, limit = 8) {
  const items = load(agentRoot, repoKey);
  return items
    .map((it) => ({ ...it, score: score(it.text + " " + (it.tags || []).join(" "), query) }))
    .filter((it) => it.score > 0)
    .sort((a, b) => b.score - a.score || b.created - a.created)
    .slice(0, limit);
}
export function listMemory(agentRoot, repoKey, limit = 20) {
  return load(agentRoot, repoKey).slice(-limit).reverse();
}
