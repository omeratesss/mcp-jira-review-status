import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  jiraSite: z.string().min(1, "JIRA_SITE is required (e.g. your-org.atlassian.net)"),
  jiraEmail: z.string().email("JIRA_EMAIL must be a valid email"),
  jiraApiToken: z.string().min(1, "JIRA_API_TOKEN is required"),
  githubToken: z.string().min(1, "GITHUB_TOKEN is required"),
  repos: z.array(z.string().regex(/^[^/]+\/[^/]+$/, "repo must be 'owner/name'")).default([]),
});

export type Config = z.infer<typeof ConfigSchema>;

const UserConfigFileSchema = z
  .object({
    jiraSite: z.string().optional(),
    jiraEmail: z.string().optional(),
    jiraApiToken: z.string().optional(),
    githubToken: z.string().optional(),
    repos: z.array(z.string()).optional(),
  })
  .partial();

const WorkspaceConfigSchema = z.object({
  repos: z.array(z.string()).optional(),
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

  const normalizeSite = (site: string | undefined) =>
    site?.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const merged = {
    jiraSite: normalizeSite(process.env.JIRA_SITE) ?? normalizeSite(userFile?.jiraSite),
    jiraEmail: process.env.JIRA_EMAIL ?? userFile?.jiraEmail,
    jiraApiToken: process.env.JIRA_API_TOKEN ?? userFile?.jiraApiToken,
    githubToken: process.env.GITHUB_TOKEN ?? userFile?.githubToken,
    repos:
      parseRepoList(process.env.MCP_JIRA_REVIEW_REPOS) ??
      workspaceFile?.repos ??
      userFile?.repos ??
      [],
  };

  return ConfigSchema.parse(merged);
}

function parseRepoList(value: string | undefined): string[] | null {
  if (!value) return null;
  return value
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}
