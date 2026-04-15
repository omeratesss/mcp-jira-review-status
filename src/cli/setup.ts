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

  const entry: McpServerEntry = {
    type: "stdio",
    command: "npx",
    args: ["-y", `${PACKAGE_NAME}@${VERSION}`],
    env: { GITHUB_TOKEN: githubToken },
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
    const restartHint = target === "claude-code"
      ? "\nIn Claude Code, run `/mcp` to see the server, then ask:"
      : `\nRestart ${clientName(target)}, then ask:`;
    console.log(restartHint);
    console.log(`  "Use ${SERVER_NAME} to check PROJ-123"\n`);
    console.log(`Later, update with: npx -y ${PACKAGE_NAME}@latest update\n`);
  } catch (err) {
    abort((err as Error).message);
  }
}
