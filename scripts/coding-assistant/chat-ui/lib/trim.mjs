export function trimMessages(messages, { maxTurns = 12, maxChars = 24000 } = {}) {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  const recent = rest.slice(-maxTurns);
  let total = 0;
  const kept = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const content = typeof recent[i].content === "string" ? recent[i].content : JSON.stringify(recent[i].content || "");
    if (total + content.length > maxChars && kept.length > 2) break;
    total += content.length;
    kept.unshift(recent[i]);
  }
  return [...system, ...kept];
}
