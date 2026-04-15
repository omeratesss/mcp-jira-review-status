import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  githubToken: z.string().min(1, "GITHUB_TOKEN is required"),
  searchScope: z.array(z.string().min(1)).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

const UserConfigFileSchema = z
  .object({
    githubToken: z.string().optional(),
    searchScope: z.array(z.string()).optional(),
  })
  .partial();

const WorkspaceConfigSchema = z.object({
  searchScope: z.array(z.string()).optional(),
});

function readJson<T>(path: string, schema: z.ZodType<T>): T | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return schema.parse(parsed);
  } catch {
    return null;
  }
}

export function loadConfig(cwd: string = process.cwd()): Config {
  const userFile = readJson(
    join(homedir(), ".config", "mcp-jira-review", "config.json"),
    UserConfigFileSchema,
  );
  const workspaceFile = readJson(
    join(cwd, ".mcp-jira-review.json"),
    WorkspaceConfigSchema,
  );

  const merged = {
    githubToken: process.env.GITHUB_TOKEN ?? userFile?.githubToken,
    searchScope:
      parseList(process.env.MCP_JIRA_REVIEW_SEARCH_SCOPE) ??
      workspaceFile?.searchScope ??
      userFile?.searchScope ??
      [],
  };

  return ConfigSchema.parse(merged);
}

function parseList(value: string | undefined): string[] | null {
  if (!value) return null;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
