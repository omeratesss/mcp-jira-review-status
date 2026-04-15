import { GitHubClient, parsePullRequestUrl, parseRepoSpec } from "../providers/github.js";
import type { PullRequestSummary } from "../providers/github.js";

export interface ResolveResult {
  pullRequests: PullRequestSummary[];
  searchedScope: string[];
  matchedVia: "title-body" | "branch" | "none";
}

export async function resolveTaskPullRequests(params: {
  github: GitHubClient;
  issueKey: string;
  scopeOverride?: string[];
}): Promise<ResolveResult> {
  const { github, issueKey, scopeOverride } = params;

  const scope = scopeOverride && scopeOverride.length > 0
    ? scopeOverride
    : await detectDefaultScope(github);

  let matchedVia: ResolveResult["matchedVia"] = "none";
  const urls = new Set<string>(await github.searchPullRequestUrlsByKey(scope, issueKey));
  if (urls.size > 0) matchedVia = "title-body";

  if (urls.size === 0) {
    const repos = scope
      .map(parseRepoSpec)
      .filter((r): r is { owner: string; repo: string } => r !== null);
    const branchHits = await github.findOpenPullRequestsByBranchContains(repos, issueKey);
    for (const url of branchHits) urls.add(url);
    if (urls.size > 0) matchedVia = "branch";
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
      // Skip PRs we can't access.
    }
  }

  return { pullRequests: summaries, searchedScope: scope, matchedVia };
}

async function detectDefaultScope(github: GitHubClient): Promise<string[]> {
  const orgs = await github.getUserOrgs();
  if (orgs.length > 0) return orgs;
  const login = await github.getCurrentUserLogin();
  return [`user:${login}`];
}
