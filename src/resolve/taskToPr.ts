import type { GitHubClient, PullRequestSummary } from "../providers/github.js";
import { parsePullRequestUrl } from "../providers/github.js";
import type { JiraClient } from "../providers/jira.js";

export interface ResolveResult {
  pullRequests: PullRequestSummary[];
  source: "jira-dev-status" | "github-search" | "none";
  searchedRepos: string[];
}

export async function resolveTaskPullRequests(params: {
  jira: JiraClient;
  github: GitHubClient;
  issueKey: string;
  issueId: string;
  repos: string[];
}): Promise<ResolveResult> {
  const { jira, github, issueKey, issueId, repos } = params;

  const devPrs = await jira.getDevStatusPullRequests(issueId);
  const urls = new Set<string>(devPrs.map((p) => p.url));
  let source: ResolveResult["source"] = urls.size > 0 ? "jira-dev-status" : "none";

  if (urls.size === 0 && repos.length > 0) {
    const found = await github.searchPullRequestUrlsByKey(repos, issueKey);
    for (const u of found) urls.add(u);
    if (urls.size > 0) source = "github-search";
  }

  const summaries: PullRequestSummary[] = [];
  for (const url of urls) {
    const parsed = parsePullRequestUrl(url);
    if (!parsed) continue;
    try {
      const summary = await github.getPullRequestSummary(
        parsed.owner,
        parsed.repo,
        parsed.number,
      );
      summaries.push(summary);
    } catch {
      // Skip PRs we can't access (token scope, deleted repo) — don't abort whole result.
    }
  }

  return { pullRequests: summaries, source, searchedRepos: repos };
}
