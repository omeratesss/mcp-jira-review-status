import prompts from "prompts";
import {
  candidateClientTargets,
  claudeDesktopConfigPath,
  cursorConfigPath,
  installToClaudeCode,
  installToJsonConfig,
} from "./clientConfig.js";
import { validateGithubAndDetectScope } from "./validate.js";

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
  console.log("This wizard will:");
  console.log("  1. Verify your GitHub token");
  console.log("  2. Detect which orgs to search in");
  console.log("  3. Install the server to your MCP client\n");
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
  const choices = targets.map((t) => ({
    title: `${t.name}${t.exists ? "" : " (not detected)"}`,
    description: t.hint,
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

  const env: Record<string, string> = { GITHUB_TOKEN: githubToken };

  try {
    if (clientId === "claude-desktop") {
      const r = installToJsonConfig(claudeDesktopConfigPath(), {
        serverName: SERVER_NAME,
        env,
      });
      reportJsonInstall(r);
      console.log("\nRestart Claude Desktop, then ask:");
    } else if (clientId === "cursor") {
      const r = installToJsonConfig(cursorConfigPath(), {
        serverName: SERVER_NAME,
        env,
      });
      reportJsonInstall(r);
      console.log("\nRestart Cursor, then ask:");
    } else if (clientId === "claude-code") {
      const r = installToClaudeCode({ serverName: SERVER_NAME, env });
      console.log(`\n✓ Installed to ${r.wrote}`);
      console.log("\nIn Claude Code (terminal), ask:");
    } else {
      abort("Unknown client.");
    }
  } catch (err) {
    abort((err as Error).message);
  }

  console.log(`  "Use ${SERVER_NAME} to check PROJ-123"\n`);
}

function reportJsonInstall(r: {
  wrote: string;
  backupPath: string | null;
  replacedExisting: boolean;
}) {
  console.log(`\n✓ Wrote ${r.wrote}`);
  if (r.backupPath) console.log(`  Backup: ${r.backupPath}`);
  if (r.replacedExisting) console.log(`  (replaced existing '${SERVER_NAME}' entry)`);
}
