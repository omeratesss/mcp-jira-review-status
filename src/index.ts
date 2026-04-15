import { runServer } from "./server.js";

async function main() {
  const arg = process.argv[2];
  if (arg === "setup") {
    const { runSetup } = await import("./cli/setup.js");
    await runSetup();
    return;
  }
  if (arg === "update") {
    const { runUpdate } = await import("./cli/update.js");
    await runUpdate();
    return;
  }
  if (arg === "--help" || arg === "-h" || arg === "help") {
    process.stdout.write(
      [
        "mcp-jira-review-status — report PR review status for a ticket key",
        "",
        "Usage:",
        "  mcp-jira-review-status          Start the MCP server (stdio). Used by your MCP client.",
        "  mcp-jira-review-status setup    Interactive setup: prompts for your GitHub token + picks a client.",
        "  mcp-jira-review-status update   Upgrade every installation to the latest version on npm.",
        "  mcp-jira-review-status --help   Show this help.",
        "",
        "Docs: https://github.com/omeratesss/mcp-jira-review-status",
        "",
      ].join("\n"),
    );
    return;
  }
  await runServer();
}

main().catch((err) => {
  process.stderr.write(`[mcp-jira-review-status] fatal: ${err?.message ?? err}\n`);
  process.exit(1);
});
