import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { gitEnvironment } from "../chat-ui/lib/git-auth.mjs";

test("passes GitHub credentials only to the Git subprocess environment", () => {
  const baseEnvironment = {
    GITHUB_TOKEN: "inherited-value",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "manager",
  };
  const env = gitEnvironment(baseEnvironment, "fixture-token");

  assert.equal(env.GIT_CONFIG_COUNT, "2");
  assert.equal(env.GIT_CONFIG_KEY_0, "credential.helper");
  assert.equal(env.GIT_CONFIG_VALUE_0, "manager");
  assert.equal(env.GIT_CONFIG_KEY_1, "http.https://github.com/.extraheader");
  assert.equal(
    env.GIT_CONFIG_VALUE_1,
    `AUTHORIZATION: basic ${Buffer.from("x-access-token:fixture-token", "utf8").toString("base64")}`,
  );
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GIT_ASKPASS, undefined);
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(baseEnvironment.GITHUB_TOKEN, "inherited-value");
});

test("disables interactive Git prompts when no token is configured", () => {
  const env = gitEnvironment({}, "");

  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  assert.equal(env.GIT_CONFIG_COUNT, undefined);
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.GIT_ASKPASS, undefined);
});

test("Git reads the scoped GitHub auth header from process configuration", () => {
  const baseEnvironment = { ...process.env };
  for (const key of Object.keys(baseEnvironment)) {
    if (/^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$/.test(key)) delete baseEnvironment[key];
  }
  const env = gitEnvironment(baseEnvironment, "fixture-token");
  const result = spawnSync("git", ["config", "--get", "http.https://github.com/.extraheader"], {
    encoding: "utf8",
    env,
  });

  assert.equal(result.status, 0, "Git should read the injected HTTP header config");
  assert.equal(result.stdout.trim(), env.GIT_CONFIG_VALUE_0);
});
