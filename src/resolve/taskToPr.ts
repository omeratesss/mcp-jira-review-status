import { GitHubClient, parsePullRequestUrl } from "../providers/github.js";
import type { PullRequestSummary } from "../providers/github.js";

export interface ResolveResult {
  pullRequests: PullRequestSummary[];
  searchedScope: string[];
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

  const urls = new Set<string>(await github.searchPullRequestUrlsByKey(scope, issueKey));

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
      // Skip PRs we can't access — don't abort whole result.
    }
  }

  return { pullRequests: summaries, searchedScope: scope };
}

async function detectDefaultScope(github: GitHubClient): Promise<string[]> {
  const orgs = await github.getUserOrgs();
  if (orgs.length > 0) return orgs;
  const login = await github.getCurrentUserLogin();
  return [`user:${login}`];
}
