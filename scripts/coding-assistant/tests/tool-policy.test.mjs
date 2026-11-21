import test from "node:test";
import assert from "node:assert/strict";
import { canAutoApplyTool, supportsCodingLoopTool } from "../chat-ui/tool-policy.mjs";

test("auto mode applies file edits but not Git or shell operations", () => {
  for (const tool of ["edit", "create", "patch"]) {
    assert.equal(canAutoApplyTool(tool), true, tool);
  }
  for (const tool of ["shell", "git_status", "git_pull", "git_push", "git_clone", "git_pr"]) {
    assert.equal(canAutoApplyTool(tool), false, tool);
  }
});

test("Code loop routes supported file and Git tools through approval", () => {
  for (const tool of ["edit", "create", "patch", "shell", "git_status", "git_pull", "git_push", "git_clone", "git_pr"]) {
    assert.equal(supportsCodingLoopTool(tool), true, tool);
  }
  for (const tool of ["unknown", "goldset"]) {
    assert.equal(supportsCodingLoopTool(tool), false, tool);
  }
});
