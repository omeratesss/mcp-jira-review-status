import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
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
  const github = GitHubClient.fromToken("gh-token");

  it("searches in explicit scope override when provided", async () => {
    server.use(
      http.get("https://api.github.com/search/issues", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "";
        expect(q).toContain("org:acme");
        expect(q).toContain("is:pr PROJ-1");
        return HttpResponse.json({
          items: [
            {
              html_url: "https://github.com/acme/repo/pull/7",
              pull_request: { url: "x" },
            },
          ],
        });
      }),
      ...stubGithubPr("acme", "repo", 7),
    );

    const result = await resolveTaskPullRequests({
      github,
      issueKey: "PROJ-1",
      scopeOverride: ["acme"],
    });
    expect(result.searchedScope).toEqual(["acme"]);
    expect(result.pullRequests).toHaveLength(1);
    expect(result.pullRequests[0]!.number).toBe(7);
  });

  it("auto-detects orgs when no scope override", async () => {
    server.use(
      http.get("https://api.github.com/user/orgs", () =>
        HttpResponse.json([{ login: "alpha" }, { login: "beta" }]),
      ),
      http.get("https://api.github.com/search/issues", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "";
        expect(q).toContain("org:alpha");
        expect(q).toContain("org:beta");
        return HttpResponse.json({ items: [] });
      }),
    );

    const result = await resolveTaskPullRequests({ github, issueKey: "PROJ-2" });
    expect(result.searchedScope).toEqual(["alpha", "beta"]);
    expect(result.pullRequests).toEqual([]);
  });

  it("falls back to user scope when no orgs", async () => {
    server.use(
      http.get("https://api.github.com/user/orgs", () => HttpResponse.json([])),
      http.get("https://api.github.com/user", () =>
        HttpResponse.json({ login: "solo-dev" }),
      ),
      http.get("https://api.github.com/search/issues", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "";
        expect(q).toContain("user:solo-dev");
        expect(q).not.toContain("org:user:");
        return HttpResponse.json({ items: [] });
      }),
    );

    const result = await resolveTaskPullRequests({ github, issueKey: "PROJ-3" });
    expect(result.searchedScope).toEqual(["user:solo-dev"]);
  });

  it("supports mixed org + repo scope", async () => {
    server.use(
      http.get("https://api.github.com/search/issues", ({ request }) => {
        const q = new URL(request.url).searchParams.get("q") ?? "";
        expect(q).toContain("org:acme");
        expect(q).toContain("repo:other/tools");
        return HttpResponse.json({ items: [] });
      }),
    );

    const result = await resolveTaskPullRequests({
      github,
      issueKey: "PROJ-4",
      scopeOverride: ["acme", "other/tools"],
    });
    expect(result.pullRequests).toEqual([]);
  });
});
