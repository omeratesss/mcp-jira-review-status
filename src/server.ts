import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { GitHubClient } from "./providers/github.js";
import { resolveTaskPullRequests } from "./resolve/taskToPr.js";
import { formatReport } from "./mcp/formatReport.js";

export async function runServer(): Promise<void> {
  const config = loadConfig();
  const github = GitHubClient.fromToken(config.githubToken);

  const server = new McpServer({
    name: "mcp-jira-review-status",
    version: "0.3.0",
  });

  server.tool(
    "get_review_status",
    "Report PR review status for a Jira/ticket key: which reviewers must still approve, who already did, and whether the PR is merged. Searches GitHub for PRs whose title or body contains the key.",
    { issueKey: z.string().describe("Ticket key to search for, e.g. PROJ-123") },
    async ({ issueKey }) => {
      const result = await resolveTaskPullRequests({
        github,
        issueKey,
        scopeOverride: config.searchScope.length > 0 ? config.searchScope : undefined,
      });
      return {
        content: [
          { type: "text", text: formatReport(issueKey, result) },
          {
            type: "text",
            text: JSON.stringify(
              {
                issueKey,
                pullRequests: result.pullRequests,
                searchedScope: result.searchedScope,
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
