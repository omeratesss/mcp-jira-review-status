import type { PullRequestSummary } from "../providers/github.js";
import type { ResolveResult } from "../resolve/taskToPr.js";

export function formatReport(issueKey: string, result: ResolveResult): string {
  if (result.pullRequests.length === 0) {
    const scopeDesc = result.searchedScope.length > 0
      ? result.searchedScope.join(", ")
      : "(empty — no org detected)";
    const hasRepoScope = result.searchedScope.some((s) => s.includes("/") && !s.includes(":"));
    return [
      `${issueKey}: no pull request found.`,
      `Searched in: ${scopeDesc}`,
      hasRepoScope
        ? "Looked in both PR title/body and open-PR branch names."
        : "Looked in PR title/body only. Add an `owner/repo` to your scope to also scan open-PR branch names.",
      "If the PR exists, verify:",
      "  • your GitHub token has `repo` + `read:org` scopes,",
      "  • and — for SSO orgs — the token is authorized at github.com/settings/tokens.",
    ].join("\n");
  }

  const lines: string[] = [];
  lines.push(`${issueKey}: ${result.pullRequests.length} PR${result.pullRequests.length === 1 ? "" : "s"}`);

  for (const pr of result.pullRequests) {
    lines.push("");
    const stateLabel =
      pr.state === "merged" ? "MERGED" : pr.state === "closed" ? "CLOSED" : "OPEN";
    lines.push(`#${pr.number} ${stateLabel} ${pr.url}`);

    const total = pr.reviewers.length;
    const approvedCount = pr.approved.length;

    if (total === 0) {
      lines.push("No reviewers assigned.");
      continue;
    }

    lines.push(`Approved (${approvedCount}/${total}): ${pr.approved.join(", ") || "—"}`);

    const notApproved = pr.reviewers
      .filter((r) => r.status !== "approved")
      .map((r) => r.login);
    if (notApproved.length) {
      lines.push(`Not approved (${notApproved.length}): ${notApproved.join(", ")}`);
    }
  }

  return lines.join("\n");
}

export function trimmedPullRequest(pr: PullRequestSummary) {
  return {
    url: pr.url,
    number: pr.number,
    state: pr.state,
    reviewerCount: pr.reviewers.length,
    approved: pr.approved,
    notApproved: pr.reviewers
      .filter((r) => r.status !== "approved")
      .map((r) => r.login),
  };
}
