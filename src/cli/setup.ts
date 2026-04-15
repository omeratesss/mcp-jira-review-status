import prompts from "prompts";
import {
  candidateClientTargets,
  clientConfigPath,
  clientName,
  writeMcpServerEntry,
  type ClientId,
  type McpServerEntry,
} from "./clientConfig.js";
import { validateGithubAndDetectScope } from "./validate.js";
import { PACKAGE_NAME, VERSION } from "../version.js";

const SERVER_NAME = "jira-review-status";

function abort(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function ask<T extends string>(questions: prompts.PromptObject<T>[]) {
  return prompts(questions, { onCancel: () => abort("Setup cancelled.") });
}

function normalizeScopeList(input: string | undefined | null): string[] {
  if (!input) return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runSetup(): Promise<void> {
  console.log("\nmcp-jira-review-status — setup\n");
  console.log("Create a GitHub token at https://github.com/settings/tokens/new");
  console.log("Scopes required: `repo` + `read:org`\n");

  const { githubToken } = await ask<string>([
    {
      type: "password",
      name: "githubToken",
      message: "GitHub token",
      validate: (v: string) => (v.trim().length > 10 ? true : "looks too short"),
    },
  ]);

  console.log("\nVerifying…");
  const ghResult = await validateGithubAndDetectScope(githubToken);
  console.log(`  ${ghResult.ok ? "✓" : "✗"} ${ghResult.message}`);
  if (!ghResult.ok) {
    abort("Fix the token and re-run `npx mcp-jira-review-status setup`.");
  }

  const detectedOrgs = ghResult.orgs ?? [];
  console.log(
    detectedOrgs.length > 0
      ? `\nDetected orgs your token can see: ${detectedOrgs.join(", ")}`
      : "\nYour token doesn't expose any orgs to the API. This is common with SSO orgs where the token isn't authorized, or with fine-grained tokens scoped to specific repos.",
  );
  console.log(
    "You can add extra orgs or repos to search in (helpful when a PR has the ticket key only in the branch name — we'll scan open-PR branches for repos you list).",
  );

  const { scopeInput } = await ask<string>([
    {
      type: "text",
      name: "scopeInput",
      message:
        detectedOrgs.length === 0
          ? "Scope (required): comma-separated `owner/repo` or org names"
          : "Scope override (optional): comma-separated `owner/repo` or org names, blank = use detected",
      initial: "",
      validate: (v: string) => {
        if (detectedOrgs.length === 0 && normalizeScopeList(v).length === 0) {
          return "At least one org or owner/repo is required.";
        }
        return true;
      },
    },
  ]);

  const scope = normalizeScopeList(scopeInput);

  const targets = candidateClientTargets();
  const { clientId } = await ask<string>([
    {
      type: "select",
      name: "clientId",
      message: "Which MCP client should I install to?",
      choices: targets.map((t) => ({
        title: `${t.name}${t.exists ? "" : " (not detected)"}`,
        description: t.path,
        value: t.id,
      })),
      initial: 0,
    },
  ]);

  const env: Record<string, string> = { GITHUB_TOKEN: githubToken };
  if (scope.length > 0) env.MCP_JIRA_REVIEW_SEARCH_SCOPE = scope.join(",");

  const entry: McpServerEntry = {
    type: "stdio",
    command: "npx",
    args: ["-y", `${PACKAGE_NAME}@${VERSION}`],
    env,
  };

  try {
    const target = clientId as ClientId;
    const r = writeMcpServerEntry({
      path: clientConfigPath(target),
      serverName: SERVER_NAME,
      entry,
    });
    console.log(`\n✓ Installed ${PACKAGE_NAME}@${VERSION} to ${clientName(target)}`);
    console.log(`  Config: ${r.wrote}`);
    if (r.backupPath) console.log(`  Backup: ${r.backupPath}`);
    if (r.replacedExisting) console.log(`  (replaced existing '${SERVER_NAME}' entry)`);
    if (scope.length > 0) console.log(`  Search scope: ${scope.join(", ")}`);

    const restartHint =
      target === "claude-code"
        ? "\nIn Claude Code, reload with `/mcp`, then ask:"
        : `\nRestart ${clientName(target)}, then ask:`;
    console.log(restartHint);
    console.log(`  "Use ${SERVER_NAME} to check PROJ-123"\n`);
    console.log(`Later, update with: npx -y ${PACKAGE_NAME}@latest update\n`);
  } catch (err) {
    abort((err as Error).message);
  }
}
