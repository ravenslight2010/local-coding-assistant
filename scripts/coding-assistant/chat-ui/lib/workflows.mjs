export const WORKFLOWS = {
  "gold-set": {
    title: "Create a gold set",
    steps: [
      "Identify the import family (spec, premix, cheese, sauce, dough, shipping).",
      "Read the source fixture. Do not invent values.",
      "Draft expected JSON with family, source, notes, and expected.",
      "Save under the repo gold/ folder.",
      "Open a review task.",
    ],
    skill: "gold-set-workflow",
  },
  "ci-green": {
    title: "Fix red CI",
    steps: [
      "List failing checks on the target repo.",
      "Read the failing log.",
      "Propose the smallest fix.",
      "Ask before committing or opening a PR.",
    ],
    skill: "dependabot-ci-green",
  },
  "version-diff": {
    title: "Compare versions",
    steps: [
      "Confirm the two repo paths (v1 and v2).",
      "Diff the named file or folder.",
      "Summarize behavior differences, not just line changes.",
    ],
    skill: "version-diff",
  },
  "security-audit": {
    title: "Security and vulnerability audit",
    steps: [
      "Run the dependency audit.",
      "Scan for committed secrets.",
      "Check auth, session, and CSRF on changed routes.",
      "Check path traversal, injection, and error leakage.",
      "Report by severity with the smallest fix.",
    ],
    skill: "security-testing",
  },
  "full-test": {
    title: "Full test ladder",
    steps: [
      "Discover test scripts in the repo.",
      "Run static checks.",
      "Run unit tests for the changed area.",
      "Probe local API routes the change touches.",
      "If imports changed, validate gold sets.",
      "If UI changed, run Playwright and axe.",
      "Report what ran, what failed, and what was skipped.",
    ],
    skill: "full-test-suite",
  },
  "bug-intake": {
    title: "Intake a bug",
    steps: [
      "Capture title, type, and details.",
      "Attach changed-since for the active repo.",
      "Create a task and suggest a first investigation step.",
    ],
    skill: "sync-diagnostics",
  },
};

export function listWorkflows() {
  return Object.entries(WORKFLOWS).map(([id, w]) => ({ id, title: w.title, skill: w.skill }));
}
export function getWorkflow(id) {
  return WORKFLOWS[id] || null;
}
