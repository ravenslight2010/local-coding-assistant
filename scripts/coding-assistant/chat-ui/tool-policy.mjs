const AUTO_APPLY_TOOLS = new Set(["edit", "create", "patch"]);
const CODING_LOOP_TOOLS = new Set(["edit", "shell", "git_pr"]);

export function canAutoApplyTool(tool) {
  return AUTO_APPLY_TOOLS.has(tool);
}

export function supportsCodingLoopTool(tool) {
  return CODING_LOOP_TOOLS.has(tool);
}
