import { Octokit } from "@octokit/rest";

export type ReviewStatus =
  | "approved"
  | "changes_requested"
  | "commented"
  | "pending";

export interface ReviewerState {
  login: string;
  type: "User" | "Team";
  status: ReviewStatus;
  lastReviewAt: string | null;
}

export interface PullRequestSummary {
  owner: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  author: string | null;
  baseBranch: string;
  headBranch: string;
  reviewers: ReviewerState[];
  approved: string[];
  changesRequested: string[];
  pending: string[];
  commented: string[];
}

const PR_URL_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export function parsePullRequestUrl(
  url: string,
): { owner: string; repo: string; number: number } | null {
  const match = PR_URL_PATTERN.exec(url);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!, number: Number(match[3]!) };
}

export class GitHubClient {
  constructor(private readonly octokit: Octokit) {}

  static fromToken(token: string): GitHubClient {
    return new GitHubClient(new Octokit({ auth: token }));
  }

  async getPullRequestSummary(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PullRequestSummary> {
    const [prRes, reviewersRes, reviewsRes] = await Promise.all([
      this.octokit.pulls.get({ owner, repo, pull_number: number }),
      this.octokit.pulls.listRequestedReviewers({ owner, repo, pull_number: number }),
      this.octokit.paginate(this.octokit.pulls.listReviews, {
        owner,
        repo,
        pull_number: number,
        per_page: 100,
      }),
    ]);

    const pr = prRes.data;
    const requestedUsers = reviewersRes.data.users ?? [];
    const requestedTeams = reviewersRes.data.teams ?? [];

    const reviewsByUser = new Map<
      string,
      { status: ReviewStatus; lastReviewAt: string }
    >();
    for (const review of reviewsRes) {
      const login = review.user?.login;
      if (!login) continue;
      const submitted = review.submitted_at;
      if (!submitted) continue;
      const state = review.state;
      if (state === "DISMISSED") continue;
      const mapped: ReviewStatus | null =
        state === "APPROVED"
          ? "approved"
          : state === "CHANGES_REQUESTED"
            ? "changes_requested"
            : state === "COMMENTED"
              ? "commented"
              : null;
      if (!mapped) continue;
      const existing = reviewsByUser.get(login);
      if (mapped === "commented" && existing && existing.status !== "commented") {
        continue;
      }
      if (!existing || submitted > existing.lastReviewAt) {
        reviewsByUser.set(login, { status: mapped, lastReviewAt: submitted });
      }
    }

    const reviewers: ReviewerState[] = [];

    for (const u of requestedUsers) {
      if (!u.login) continue;
      if (!reviewsByUser.has(u.login)) {
        reviewers.push({
          login: u.login,
          type: "User",
          status: "pending",
          lastReviewAt: null,
        });
      }
    }
    for (const t of requestedTeams) {
      const slug = t.slug ?? t.name;
      if (!slug) continue;
      reviewers.push({
        login: slug,
        type: "Team",
        status: "pending",
        lastReviewAt: null,
      });
    }
    for (const [login, rec] of reviewsByUser) {
      reviewers.push({
        login,
        type: "User",
        status: rec.status,
        lastReviewAt: rec.lastReviewAt,
      });
    }

    const state: "open" | "closed" | "merged" = pr.merged
      ? "merged"
      : pr.state === "closed"
        ? "closed"
        : "open";

    return {
      owner,
      repo,
      number,
      url: pr.html_url,
      title: pr.title,
      state,
      draft: pr.draft ?? false,
      author: pr.user?.login ?? null,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      reviewers,
      approved: reviewers.filter((r) => r.status === "approved").map((r) => r.login),
      changesRequested: reviewers
        .filter((r) => r.status === "changes_requested")
        .map((r) => r.login),
      commented: reviewers.filter((r) => r.status === "commented").map((r) => r.login),
      pending: reviewers.filter((r) => r.status === "pending").map((r) => r.login),
    };
  }

  async getCurrentUserLogin(): Promise<string> {
    const res = await this.octokit.users.getAuthenticated();
    return res.data.login;
  }

  async getUserOrgs(): Promise<string[]> {
    const orgs = await this.octokit.paginate(this.octokit.orgs.listForAuthenticatedUser, {
      per_page: 100,
    });
    return orgs.map((o) => o.login).filter((l): l is string => Boolean(l));
  }

  async searchPullRequestUrlsByKey(
    scope: string[],
    issueKey: string,
  ): Promise<string[]> {
    if (scope.length === 0) return [];
    const qualifiers = scope
      .map((s) =>
        s.includes(":") ? s : s.includes("/") ? `repo:${s}` : `org:${s}`,
      )
      .join(" ");
    const query = `${qualifiers} is:pr ${issueKey} in:title,body`;
    const res = await this.octokit.search.issuesAndPullRequests({
      q: query,
      per_page: 50,
    });
    return res.data.items
      .filter((i) => i.pull_request)
      .map((i) => i.html_url);
  }
}
