import prompts from "prompts";
import { candidateClientTargets, mergeMcpServerConfig } from "./clientConfig.js";
import { validateGithub, validateJira } from "./validate.js";

const SERVER_NAME = "jira-review-status";

function abort(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function ask<T extends string>(questions: prompts.PromptObject<T>[]) {
  const answers = await prompts(questions, {
    onCancel: () => abort("Setup cancelled."),
  });
  return answers;
}

export async function runSetup(): Promise<void> {
  console.log("\nmcp-jira-review-status — setup\n");
  console.log("This wizard will:");
  console.log("  1. Collect your Jira + GitHub credentials");
  console.log("  2. Verify they work");
  console.log("  3. Add the server to your MCP client config\n");

  const normalizeSite = (input: string) =>
    input.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

  const creds = await ask<string>([
    {
      type: "text",
      name: "jiraSite",
      message: "Jira site (e.g. your-org.atlassian.net)",
      validate: (v: string) => (v.trim().length > 0 ? true : "required"),
      format: normalizeSite,
    },
    {
      type: "text",
      name: "jiraEmail",
      message: "Jira email address",
      validate: (v: string) => (/.+@.+\..+/.test(v) ? true : "must be an email"),
    },
    {
      type: "password",
      name: "jiraApiToken",
      message: "Jira API token (from id.atlassian.com/manage-profile/security/api-tokens)",
      validate: (v: string) => (v.trim().length > 10 ? true : "looks too short"),
    },
    {
      type: "password",
      name: "githubToken",
      message: "GitHub token (scopes: repo, read:org — github.com/settings/tokens/new)",
      validate: (v: string) => (v.trim().length > 10 ? true : "looks too short"),
    },
    {
      type: "text",
      name: "repos",
      message: "Fallback repos (comma-separated owner/repo, optional)",
      initial: "",
    },
  ]);

  console.log("\nVerifying credentials…");
  const [jiraResult, ghResult] = await Promise.all([
    validateJira({
      site: creds.jiraSite,
      email: creds.jiraEmail,
      apiToken: creds.jiraApiToken,
    }),
    validateGithub(creds.githubToken),
  ]);
  console.log(`  ${jiraResult.ok ? "✓" : "✗"} ${jiraResult.message}`);
  console.log(`  ${ghResult.ok ? "✓" : "✗"} ${ghResult.message}`);
  if (!jiraResult.ok || !ghResult.ok) {
    abort("Fix the failing credential(s) and re-run `npx mcp-jira-review-status setup`.");
  }

  const targets = candidateClientTargets();
  const choices = targets.map((t) => ({
    title: `${t.name}${t.exists ? "" : " (file will be created)"}`,
    description: t.path,
    value: t.id,
  }));

  const { clientId } = await ask<string>([
    {
      type: "select",
      name: "clientId",
      message: "Which MCP client should I install to?",
      choices,
      initial: 0,
    },
  ]);

  const target = targets.find((t) => t.id === clientId);
  if (!target) abort("No target selected.");

  const env: Record<string, string> = {
    JIRA_SITE: creds.jiraSite,
    JIRA_EMAIL: creds.jiraEmail,
    JIRA_API_TOKEN: creds.jiraApiToken,
    GITHUB_TOKEN: creds.githubToken,
  };
  const reposTrimmed = (creds.repos ?? "").trim();
  if (reposTrimmed) env.MCP_JIRA_REVIEW_REPOS = reposTrimmed;

  try {
    const result = mergeMcpServerConfig({
      path: target!.path,
      serverName: SERVER_NAME,
      env,
    });
    console.log(`\n✓ Wrote ${result.wrote}`);
    if (result.backupPath) console.log(`  Backup: ${result.backupPath}`);
    if (result.replacedExisting) console.log(`  (replaced existing '${SERVER_NAME}' entry)`);
  } catch (err) {
    abort((err as Error).message);
  }

  console.log(`\nAll set. Restart ${target!.name}, then ask:`);
  console.log(`  "Use ${SERVER_NAME} to check PROJ-123"\n`);
}
