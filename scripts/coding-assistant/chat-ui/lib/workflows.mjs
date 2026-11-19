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
