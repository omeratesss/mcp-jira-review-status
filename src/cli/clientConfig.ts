import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export type ClientId = "claude-desktop" | "claude-code" | "cursor";

export interface ClientTarget {
  id: ClientId;
  name: string;
  hint: string;
  exists: boolean;
}

export function candidateClientTargets(): ClientTarget[] {
  const cc = resolveClaudeCodeCli();
  return [
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      hint: claudeDesktopConfigPath(),
      exists: existsSync(claudeDesktopConfigPath()),
    },
    {
      id: "claude-code",
      name: "Claude Code (terminal)",
      hint: cc ? `via \`${cc}\` CLI` : "via `claude` CLI (not on PATH)",
      exists: Boolean(cc),
    },
    {
      id: "cursor",
      name: "Cursor",
      hint: cursorConfigPath(),
      exists: existsSync(cursorConfigPath()),
    },
  ];
}

export function claudeDesktopConfigPath(): string {
  const home = homedir();
  const plat = platform();
  if (plat === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  if (plat === "win32") {
    return join(
      process.env.APPDATA ?? join(home, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json",
    );
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

export function cursorConfigPath(): string {
  return join(homedir(), ".cursor", "mcp.json");
}

export function resolveClaudeCodeCli(): string | null {
  const candidates = ["claude"];
  for (const cmd of candidates) {
    const res = spawnSync("command", ["-v", cmd], { encoding: "utf8", shell: true });
    if (res.status === 0 && res.stdout.trim()) return cmd;
  }
  return null;
}

export interface MergeParams {
  serverName: string;
  env: Record<string, string>;
}

export interface MergeResult {
  wrote: string;
  backupPath: string | null;
  replacedExisting: boolean;
}

export function installToJsonConfig(
  path: string,
  { serverName, env }: MergeParams,
): MergeResult {
  let existing: Record<string, unknown> = {};
  let replacedExisting = false;
  let backupPath: string | null = null;

  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8");
    try {
      existing = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      throw new Error(`Existing config at ${path} is not valid JSON — refusing to overwrite. Fix or remove it first.`);
    }
    backupPath = `${path}.backup-${Date.now()}`;
    copyFileSync(path, backupPath);
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }

  const mcpServers =
    (existing.mcpServers as Record<string, unknown> | undefined) ?? {};
  replacedExisting = Object.prototype.hasOwnProperty.call(mcpServers, serverName);

  mcpServers[serverName] = {
    command: "npx",
    args: ["-y", "mcp-jira-review-status"],
    env,
  };
  existing.mcpServers = mcpServers;

  writeFileSync(path, JSON.stringify(existing, null, 2) + "\n", { mode: 0o600 });
  return { wrote: path, backupPath, replacedExisting };
}

export function installToClaudeCode({ serverName, env }: MergeParams): {
  wrote: string;
  command: string;
} {
  const cli = resolveClaudeCodeCli();
  if (!cli) {
    throw new Error(
      "`claude` CLI not found on PATH. Install Claude Code first: https://docs.claude.com/claude-code",
    );
  }

  const envArgs: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    envArgs.push("-e", `${key}=${value}`);
  }

  const args = [
    "mcp",
    "add",
    serverName,
    "--scope",
    "user",
    ...envArgs,
    "--",
    "npx",
    "-y",
    "mcp-jira-review-status",
  ];

  const removeFirst = spawnSync(cli, ["mcp", "remove", serverName, "--scope", "user"], {
    encoding: "utf8",
  });
  void removeFirst;

  const res = spawnSync(cli, args, { encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(
      `\`${cli} ${args.join(" ")}\` failed (exit ${res.status}):\n${res.stderr || res.stdout}`,
    );
  }

  return { wrote: "Claude Code user scope", command: `${cli} ${args.join(" ")}` };
}
