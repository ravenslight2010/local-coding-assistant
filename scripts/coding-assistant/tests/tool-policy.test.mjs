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

test("Code loop routes PR proposals through the existing approval path", () => {
  for (const tool of ["edit", "shell", "git_pr"]) {
    assert.equal(supportsCodingLoopTool(tool), true, tool);
  }
  for (const tool of ["unknown", "goldset", "git_push"]) {
    assert.equal(supportsCodingLoopTool(tool), false, tool);
  }
});
