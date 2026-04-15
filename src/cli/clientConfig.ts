import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export type ClientId = "claude-desktop" | "cursor";

export interface ClientTarget {
  id: ClientId;
  name: string;
  path: string;
  exists: boolean;
}

export function candidateClientTargets(): ClientTarget[] {
  const home = homedir();
  const plat = platform();

  const claudeDesktopPath =
    plat === "darwin"
      ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
      : plat === "win32"
        ? join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
        : join(home, ".config", "Claude", "claude_desktop_config.json");

  const cursorPath = join(home, ".cursor", "mcp.json");

  return [
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      path: claudeDesktopPath,
      exists: existsSync(claudeDesktopPath),
    },
    {
      id: "cursor",
      name: "Cursor",
      path: cursorPath,
      exists: existsSync(cursorPath),
    },
  ];
}

export interface MergeParams {
  path: string;
  serverName: string;
  env: Record<string, string>;
}

export interface MergeResult {
  wrote: string;
  backupPath: string | null;
  replacedExisting: boolean;
}

export function mergeMcpServerConfig({ path, serverName, env }: MergeParams): MergeResult {
  let existing: Record<string, unknown> = {};
  let replacedExisting = false;
  let backupPath: string | null = null;

  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8");
    try {
      existing = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch (err) {
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
