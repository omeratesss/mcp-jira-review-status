import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { GitHubClient, parsePullRequestUrl } from "../src/providers/github.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("parsePullRequestUrl", () => {
  it("parses a standard PR url", () => {
    expect(parsePullRequestUrl("https://github.com/acme/repo/pull/42")).toEqual({
      owner: "acme",
      repo: "repo",
      number: 42,
    });
  });
  it("rejects unrelated urls", () => {
    expect(parsePullRequestUrl("https://example.com/foo")).toBeNull();
  });
});

function stubPr(
  owner: string,
  repo: string,
  number: number,
  overrides: Partial<{
    merged: boolean;
    state: "open" | "closed";
    draft: boolean;
    requestedUsers: string[];
    reviews: Array<{
      login: string;
      state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";
      submitted_at: string;
    }>;
  }> = {},
) {
  const base = `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`;
  return [
    http.get(base, () =>
      HttpResponse.json({
        number,
        html_url: `https://github.com/${owner}/${repo}/pull/${number}`,
        title: "Test PR",
        state: overrides.state ?? "open",
        merged: overrides.merged ?? false,
        draft: overrides.draft ?? false,
        user: { login: "author1" },
        base: { ref: "main" },
        head: { ref: "feature/x" },
      }),
    ),
    http.get(`${base}/requested_reviewers`, () =>
      HttpResponse.json({
        users: (overrides.requestedUsers ?? []).map((login) => ({ login })),
        teams: [],
      }),
    ),
    http.get(`${base}/reviews`, () =>
      HttpResponse.json(
        (overrides.reviews ?? []).map((r, i) => ({
          id: i + 1,
          user: { login: r.login },
          state: r.state,
          submitted_at: r.submitted_at,
        })),
      ),
    ),
  ];
}

describe("GitHubClient.getPullRequestSummary", () => {
  const client = GitHubClient.fromToken("test-token");

  it("aggregates latest-wins per reviewer and keeps requested-but-unreviewed as pending", async () => {
    server.use(
      ...stubPr("acme", "repo", 1, {
        requestedUsers: ["alice", "bob", "carol"],
        reviews: [
          { login: "alice", state: "CHANGES_REQUESTED", submitted_at: "2026-04-10T10:00:00Z" },
          { login: "alice", state: "APPROVED", submitted_at: "2026-04-11T10:00:00Z" },
          { login: "bob", state: "COMMENTED", submitted_at: "2026-04-10T09:00:00Z" },
          { login: "dave", state: "CHANGES_REQUESTED", submitted_at: "2026-04-09T12:00:00Z" },
        ],
      }),
    );
    const summary = await client.getPullRequestSummary("acme", "repo", 1);
    expect(summary.state).toBe("open");
    expect(summary.approved).toEqual(["alice"]);
    expect(summary.changesRequested).toEqual(["dave"]);
    expect(summary.commented).toEqual(["bob"]);
    expect(summary.pending).toEqual(["carol"]);
  });

  it("marks state as merged when merged", async () => {
    server.use(
      ...stubPr("acme", "repo", 2, {
        merged: true,
        state: "closed",
        reviews: [
          { login: "alice", state: "APPROVED", submitted_at: "2026-04-11T10:00:00Z" },
        ],
      }),
    );
    const summary = await client.getPullRequestSummary("acme", "repo", 2);
    expect(summary.state).toBe("merged");
    expect(summary.approved).toEqual(["alice"]);
  });

  it("ignores dismissed reviews", async () => {
    server.use(
      ...stubPr("acme", "repo", 3, {
        requestedUsers: ["alice"],
        reviews: [
          { login: "alice", state: "APPROVED", submitted_at: "2026-04-10T10:00:00Z" },
          { login: "alice", state: "DISMISSED", submitted_at: "2026-04-11T10:00:00Z" },
        ],
      }),
    );
    const summary = await client.getPullRequestSummary("acme", "repo", 3);
    expect(summary.approved).toEqual(["alice"]);
    expect(summary.pending).toEqual([]);
  });
});
