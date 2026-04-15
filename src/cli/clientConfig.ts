import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export type ClientId = "claude-desktop" | "claude-code" | "cursor";

export interface ClientTarget {
  id: ClientId;
  name: string;
  path: string;
  exists: boolean;
}

export function candidateClientTargets(): ClientTarget[] {
  return (["claude-desktop", "claude-code", "cursor"] as const).map((id) => {
    const path = clientConfigPath(id);
    return {
      id,
      name: clientName(id),
      path,
      exists: existsSync(path),
    };
  });
}

export function clientName(id: ClientId): string {
  switch (id) {
    case "claude-desktop":
      return "Claude Desktop";
    case "claude-code":
      return "Claude Code (terminal)";
    case "cursor":
      return "Cursor";
  }
}

export function clientConfigPath(id: ClientId): string {
  const home = homedir();
  const plat = platform();
  if (id === "claude-desktop") {
    if (plat === "darwin")
      return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
    if (plat === "win32")
      return join(
        process.env.APPDATA ?? join(home, "AppData", "Roaming"),
        "Claude",
        "claude_desktop_config.json",
      );
    return join(home, ".config", "Claude", "claude_desktop_config.json");
  }
  if (id === "claude-code") {
    return join(home, ".claude.json");
  }
  return join(home, ".cursor", "mcp.json");
}

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  type?: string;
}

export interface WriteParams {
  path: string;
  serverName: string;
  entry: McpServerEntry;
}

export interface WriteResult {
  wrote: string;
  backupPath: string | null;
  replacedExisting: boolean;
}

function loadConfigJson(path: string): { data: Record<string, unknown>; existed: boolean } {
  if (!existsSync(path)) return { data: {}, existed: false };
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return { data: {}, existed: true };
  try {
    return { data: JSON.parse(raw) as Record<string, unknown>, existed: true };
  } catch {
    throw new Error(`Existing config at ${path} is not valid JSON — refusing to overwrite. Fix or remove it first.`);
  }
}

function saveConfigJson(path: string, data: Record<string, unknown>) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

export function writeMcpServerEntry({ path, serverName, entry }: WriteParams): WriteResult {
  const { data, existed } = loadConfigJson(path);
  let backupPath: string | null = null;
  if (existed) {
    backupPath = `${path}.backup-${Date.now()}`;
    copyFileSync(path, backupPath);
  }

  const mcpServers =
    (data.mcpServers as Record<string, McpServerEntry> | undefined) ?? {};
  const replacedExisting = Object.prototype.hasOwnProperty.call(mcpServers, serverName);
  mcpServers[serverName] = entry;
  data.mcpServers = mcpServers;

  saveConfigJson(path, data);
  return { wrote: path, backupPath, replacedExisting };
}

export interface InstalledLookup {
  clientId: ClientId;
  path: string;
  entry: McpServerEntry;
}

export function findInstallations(serverName: string): InstalledLookup[] {
  const found: InstalledLookup[] = [];
  for (const target of candidateClientTargets()) {
    if (!target.exists) continue;
    try {
      const { data } = loadConfigJson(target.path);
      const servers = data.mcpServers as Record<string, McpServerEntry> | undefined;
      if (servers && servers[serverName]) {
        found.push({ clientId: target.id, path: target.path, entry: servers[serverName] });
      }
    } catch {
      // skip unreadable/invalid configs
    }
  }
  return found;
}
