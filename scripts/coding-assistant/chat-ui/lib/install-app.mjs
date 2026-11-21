import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const windows = process.platform === "win32";
const installerTimeoutMs = 10 * 60_000;
const startupWindowMs = 750;

export function detectInstall(file) {
  for (const script of ["scripts/self-host/Install-RunCalcHost.ps1", "scripts/install-host.ps1", "install.ps1"]) {
    if (file(script)) return { kind: "script", script };
  }
  if (file("CA-Setup.cmd") && file("scripts/ca/setup.ps1")) {
    return { error: "This is Code Agent itself. On Windows, run CA-Setup.cmd from this repository to use its setup and elevation prompts." };
  }
  if (["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"].some(file)) {
    return { kind: "docker", setup: "docker compose up -d --build" };
  }
  if (file("Dockerfile")) return { kind: "docker", setup: "docker build -t app . && docker run -d -p 3000:3000 app" };
  const packageFile = file("package.json");
  if (packageFile) {
    let pkg;
    try { pkg = JSON.parse(readFileSync(packageFile, "utf8")); }
    catch { return { error: "package.json is not valid JSON." }; }
    const pm = file("pnpm-lock.yaml") ? "pnpm" : file("yarn.lock") ? "yarn" : "npm";
    const script = ["start", "dev"].find((name) => typeof pkg?.scripts?.[name] === "string" && pkg.scripts[name].trim());
    if (!script) return { error: "This Node project has no start or dev script in package.json." };
    return { kind: "node", setup: `${pm} install`, launch: `${pm} run ${script}` };
  }
  if (file("requirements.txt") || file("pyproject.toml")) {
    const python = windows ? "python" : "python3";
    return {
      kind: "python",
      setup: `${python} -m pip install ${file("requirements.txt") ? "-r requirements.txt" : "-e ."}`,
      launch: `${python} -m app`,
    };
  }
  if (file("index.html")) return { kind: "static", launch: "npx --yes serve -l 3000" };
  return { error: "Could not detect how to install this repository." };
}

function command(root, plan, step) {
  if (plan.script) return [windows ? "powershell.exe" : "pwsh", ["-NoProfile", "-NonInteractive", "-File", path.join(root, plan.script), "-NonInteractive"]];
  return windows ? ["cmd.exe", ["/d", "/s", "/c", plan[step]]] : ["bash", ["-c", plan[step]]];
}

function runSetup(root, plan) {
  const [program, args] = command(root, plan, "setup");
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(program, args, { cwd: root, windowsHide: true, detached: !windows, stdio: ["ignore", "pipe", "pipe"] });
    const append = (chunk) => { output = (output + chunk.toString()).slice(-4000); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const timer = setTimeout(() => {
      timedOut = true;
      if (windows) {
        const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
        killer.on("error", () => child.kill());
      } else {
        try { process.kill(-child.pid, "SIGKILL"); } catch {}
      }
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ ok: false, error: "Installation timed out.", output });
    }, installerTimeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Could not start ${program}. Check that it is installed.`, output });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (!timedOut) resolve(code === 0 ? { ok: true } : { ok: false, error: `Installation exited with code ${code}.`, output });
    });
  });
}

function launchApp(root, plan, running) {
  const [program, args] = command(root, plan, "launch");
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd: root, windowsHide: true, detached: true, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.unref();
      resolve({ ok: true, status: "launched" });
    }, startupWindowMs);
    running.set(root, child);
    child.once("error", () => {
      clearTimeout(timer);
      running.delete(root);
      resolve({ ok: false, error: `Could not start ${program}. Check that it is installed.` });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      running.delete(root);
      resolve(code === 0 ? { ok: true, status: "completed" } : { ok: false, error: `The app exited during startup (code ${code}). Try its start command in a terminal for details.` });
    });
  });
}

export function createInstaller() {
  const running = new Map();
  let installing = false;
  return async function install(root, plan) {
    if (running.has(root)) return { ok: false, error: "An app launched by Code Agent is already running from this repository." };
    if (installing) return { ok: false, error: "Another installation is already running." };
    installing = true;
    try {
      if (plan.setup || plan.script) {
        const result = await runSetup(root, plan);
        if (!result.ok) return result;
      }
      return plan.launch ? await launchApp(root, plan, running)
        : { ok: true, status: plan.kind === "docker" ? "launched" : "completed" };
    } finally {
      installing = false;
    }
  };
}
