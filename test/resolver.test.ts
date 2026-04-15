import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { JiraClient } from "../src/providers/jira.js";
import { GitHubClient } from "../src/providers/github.js";
import { resolveTaskPullRequests } from "../src/resolve/taskToPr.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function stubGithubPr(owner: string, repo: string, number: number) {
  const base = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
  return [
    http.get(base, () =>
      HttpResponse.json({
        number,
        html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
        title: "Test",
        state: "open",
        merged: false,
        draft: false,
        user: { login: "author" },
        base: { ref: "main" },
        head: { ref: "feat" },
      }),
    ),
    http.get(`${base}/requested_reviewers`, () =>
      HttpResponse.json({ users: [], teams: [] }),
    ),
    http.get(`${base}/reviews`, () => HttpResponse.json([])),
  ];
}

describe("resolveTaskPullRequests", () => {
  const jira = new JiraClient({
    site: "example.atlassian.net",
    email: "x@y.z",
    apiToken: "t",
  });
  const github = GitHubClient.fromToken("gh-token");

  it("uses Jira dev-status PRs when present", async () => {
    server.use(
      http.get(
        "https://example.atlassian.net/rest/dev-status/1.0/issue/detail",
        () =>
          HttpResponse.json({
            detail: [
              {
                pullRequests: [
                  {
                    url: "https://github.com/acme/repo/pull/7",
                    status: "OPEN",
                  },
                ],
              },
            ],
          }),
      ),
      ...stubGithubPr("acme", "repo", 7),
    );

    const result = await resolveTaskPullRequests({
      jira,
      github,
      issueKey: "PROJ-1",
      issueId: "1001",
      repos: ["acme/repo"],
    });
    expect(result.source).toBe("jira-dev-status");
    expect(result.pullRequests).toHaveLength(1);
    expect(result.pullRequests[0]!.number).toBe(7);
  });

  it("falls back to GitHub search when dev-status is empty", async () => {
    server.use(
      http.get(
        "https://example.atlassian.net/rest/dev-status/1.0/issue/detail",
        () => HttpResponse.json({ detail: [{ pullRequests: [] }] }),
      ),
      http.get("https://api.github.com/search/issues", () =>
        HttpResponse.json({
          items: [
            {
              html_url: "https://github.com/acme/repo/pull/9",
              pull_request: { url: "x" },
            },
          ],
        }),
      ),
      ...stubGithubPr("acme", "repo", 9),
    );

    const result = await resolveTaskPullRequests({
      jira,
      github,
      issueKey: "PROJ-2",
      issueId: "1002",
      repos: ["acme/repo"],
    });
    expect(result.source).toBe("github-search");
    expect(result.pullRequests).toHaveLength(1);
    expect(result.pullRequests[0]!.number).toBe(9);
  });

  it("returns empty result with source=none when nothing matches", async () => {
    server.use(
      http.get(
        "https://example.atlassian.net/rest/dev-status/1.0/issue/detail",
        () => HttpResponse.json({ detail: [] }),
      ),
      http.get("https://api.github.com/search/issues", () =>
        HttpResponse.json({ items: [] }),
      ),
    );
    const result = await resolveTaskPullRequests({
      jira,
      github,
      issueKey: "PROJ-3",
      issueId: "1003",
      repos: ["acme/repo"],
    });
    expect(result.source).toBe("none");
    expect(result.pullRequests).toHaveLength(0);
  });
});
