import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { GitHubClient } from "./providers/github.js";
import { resolveTaskPullRequests } from "./resolve/taskToPr.js";
import { formatReport, trimmedPullRequest } from "./mcp/formatReport.js";

export async function runServer(): Promise<void> {
  const config = loadConfig();
  const github = GitHubClient.fromToken(config.githubToken);

  const server = new McpServer({
    name: "mcp-jira-review-status",
    version: "0.6.0",
  });

  server.tool(
    "get_review_status",
    [
      "Report which reviewers have approved a PR and which have not, given a ticket key.",
      "Return exactly the text provided — do not add PR state details, CI check results, merge conflicts,",
      "labels, branch names, authors, or any other metadata. The project manager only needs to know",
      "how many reviewers are on the PR, who approved, and who did not.",
    ].join(" "),
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
                searchedScope: result.searchedScope,
                matchedVia: result.matchedVia,
                pullRequests: result.pullRequests.map(trimmedPullRequest),
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
