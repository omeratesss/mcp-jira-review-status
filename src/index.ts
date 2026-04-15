import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { JiraClient } from "./providers/jira.js";
import { GitHubClient } from "./providers/github.js";
import { resolveTaskPullRequests } from "./resolve/taskToPr.js";
import { formatReport } from "./mcp/formatReport.js";

async function main() {
  const config = loadConfig();
  const jira = new JiraClient({
    site: config.jiraSite,
    email: config.jiraEmail,
    apiToken: config.jiraApiToken,
  });
  const github = GitHubClient.fromToken(config.githubToken);

  const server = new McpServer({
    name: "mcp-jira-review-status",
    version: "0.1.0",
  });

  server.tool(
    "get_review_status",
    "Report PR review status for a Jira issue: which reviewers must still approve, who already did, and whether the PR is merged.",
    { issueKey: z.string().describe("Jira issue key, e.g. PROJ-123") },
    async ({ issueKey }) => {
      const issue = await jira.getIssue(issueKey);
      const result = await resolveTaskPullRequests({
        jira,
        github,
        issueKey: issue.key,
        issueId: issue.id,
        repos: config.repos,
      });
      return {
        content: [
          { type: "text", text: formatReport(issue, result) },
          {
            type: "text",
            text: JSON.stringify(
              {
                issue,
                pullRequests: result.pullRequests,
                source: result.source,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[mcp-jira-review-status] fatal: ${err?.message ?? err}\n`);
  process.exit(1);
});
