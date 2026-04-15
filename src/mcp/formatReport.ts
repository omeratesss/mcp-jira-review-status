import type { JiraIssueSummary } from "../providers/jira.js";
import type { PullRequestSummary } from "../providers/github.js";
import type { ResolveResult } from "../resolve/taskToPr.js";

export function formatReport(
  issue: JiraIssueSummary,
  result: ResolveResult,
): string {
  const lines: string[] = [];
  lines.push(`${issue.key} — ${issue.summary}`);
  lines.push(`Status: ${issue.status}   Assignee: ${issue.assignee ?? "—"}`);
  lines.push(issue.url);
  lines.push("");

  if (result.pullRequests.length === 0) {
    lines.push("No linked pull requests found.");
    if (result.searchedRepos.length === 0) {
      lines.push(
        "Hint: configure repos via MCP_JIRA_REVIEW_REPOS env or .mcp-jira-review.json to enable GitHub search fallback.",
      );
    }
    return lines.join("\n");
  }

  lines.push(`Found ${result.pullRequests.length} PR(s) via ${result.source}:`);
  for (const pr of result.pullRequests) {
    lines.push("");
    const stateLabel =
      pr.state === "merged"
        ? "MERGED"
        : pr.state === "closed"
          ? "CLOSED"
          : pr.draft
            ? "OPEN (draft)"
            : "OPEN";
    lines.push(`  #${pr.number} ${pr.title}`);
    lines.push(`  ${pr.url}`);
    lines.push(
      `  ${stateLabel}   ${pr.owner}/${pr.repo}   ${pr.headBranch} → ${pr.baseBranch}   author: ${pr.author ?? "—"}`,
    );

    if (pr.reviewers.length === 0) {
      lines.push(`  Reviewers: none assigned`);
      continue;
    }
    if (pr.approved.length) lines.push(`  Approved:          ${pr.approved.join(", ")}`);
    if (pr.changesRequested.length)
      lines.push(`  Changes requested: ${pr.changesRequested.join(", ")}`);
    if (pr.pending.length) lines.push(`  Pending review:    ${pr.pending.join(", ")}`);
    if (pr.commented.length)
      lines.push(`  Only commented:    ${pr.commented.join(", ")}`);
  }

  return lines.join("\n");
}
