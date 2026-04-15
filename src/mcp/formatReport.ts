import type { PullRequestSummary } from "../providers/github.js";
import type { ResolveResult } from "../resolve/taskToPr.js";

export function formatReport(issueKey: string, result: ResolveResult): string {
  const lines: string[] = [];
  lines.push(`Ticket: ${issueKey}`);
  lines.push(`Searched in: ${result.searchedScope.join(", ") || "(empty)"}`);
  lines.push("");

  if (result.pullRequests.length === 0) {
    lines.push("No matching pull requests found.");
    lines.push(
      "Make sure the ticket key appears in the PR title or body, and that the PR lives in an org/repo your token can access.",
    );
    return lines.join("\n");
  }

  lines.push(`Found ${result.pullRequests.length} PR(s):`);
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
