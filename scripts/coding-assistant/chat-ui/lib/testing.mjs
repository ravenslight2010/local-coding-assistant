import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

export function discoverTests(root) {
  const pkgPath = path.join(root, "package.json");
  const scripts = {};
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
        if (/test|e2e|playwright|lint|check|typecheck/i.test(name)) scripts[name] = cmd;
      }
    } catch {}
  }
  const hasPlaywright = existsSync(path.join(root, "playwright.config.ts")) || existsSync(path.join(root, "playwright.config.js"));
  const hasGold = existsSync(path.join(root, "gold")) || existsSync(path.join(root, "docs", "gold"));
  return {
    scripts,
    hasPlaywright,
    hasGold,
    ladder: [
      scripts.check || scripts.typecheck ? "static" : null,
      scripts.test ? "unit" : null,
      "api",
      hasGold ? "gold-set" : null,
      hasPlaywright ? "e2e" : null,
      hasPlaywright ? "a11y" : null,
      hasPlaywright ? "visual" : null,
    ].filter(Boolean),
  };
}

export function planFor(changeHint, discovery) {
  const plan = [];
  if (discovery.ladder.includes("static")) plan.push({ step: "static", cmd: discovery.scripts.check || discovery.scripts.typecheck || "pnpm check" });
  if (discovery.ladder.includes("unit")) plan.push({ step: "unit", cmd: discovery.scripts.test || "pnpm test" });
  plan.push({ step: "api", cmd: "probe local health and changed routes" });
  if (discovery.hasGold && /import|gold|parser/i.test(changeHint || "")) plan.push({ step: "gold-set", cmd: "run parser against gold fixtures" });
  if (discovery.hasPlaywright && /ui|page|screen|e2e/i.test(changeHint || "")) plan.push({ step: "e2e", cmd: "npx playwright test --project=chromium" });
  return plan;
}
