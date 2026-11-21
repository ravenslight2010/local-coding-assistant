export function gitEnvironment(baseEnvironment, token) {
  const env = { ...baseEnvironment, GIT_TERMINAL_PROMPT: "0" };
  delete env.GITHUB_TOKEN;
  if (!token) return env;

  const count = Number(env.GIT_CONFIG_COUNT || 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("GIT_CONFIG_COUNT must be a non-negative integer");
  }
  env.GIT_CONFIG_COUNT = String(count + 1);
  env[`GIT_CONFIG_KEY_${count}`] = "http.https://github.com/.extraheader";
  env[`GIT_CONFIG_VALUE_${count}`] = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`, "utf8").toString("base64")}`;
  return env;
}
