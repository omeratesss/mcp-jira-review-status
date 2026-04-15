export interface JiraIssueSummary {
  key: string;
  id: string;
  summary: string;
  status: string;
  assignee: string | null;
  reporter: string | null;
  url: string;
}

export interface JiraPullRequestRef {
  url: string;
  status: string;
  source: "jira-dev-status";
}

export interface JiraClientDeps {
  site: string;
  email: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl?: typeof fetch;

  constructor(deps: JiraClientDeps) {
    this.baseUrl = `https://${deps.site}`;
    this.authHeader =
      "Basic " + Buffer.from(`${deps.email}:${deps.apiToken}`).toString("base64");
    this.fetchImpl = deps.fetchImpl;
  }

  private doFetch(url: string, init?: RequestInit) {
    const f = this.fetchImpl ?? globalThis.fetch;
    return f(url, init);
  }

  private headers() {
    return {
      Authorization: this.authHeader,
      Accept: "application/json",
    };
  }

  async getIssue(key: string): Promise<JiraIssueSummary> {
    const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,assignee,reporter`;
    const res = await this.doFetch(url, { headers: this.headers() });
    if (res.status === 404) {
      throw new Error(`Jira issue ${key} not found`);
    }
    if (!res.ok) {
      throw new Error(`Jira getIssue failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      id: string;
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        assignee: { displayName: string } | null;
        reporter: { displayName: string } | null;
      };
    };
    return {
      id: data.id,
      key: data.key,
      summary: data.fields.summary,
      status: data.fields.status.name,
      assignee: data.fields.assignee?.displayName ?? null,
      reporter: data.fields.reporter?.displayName ?? null,
      url: `${this.baseUrl}/browse/${data.key}`,
    };
  }

  async getDevStatusPullRequests(issueId: string): Promise<JiraPullRequestRef[]> {
    const url = `${this.baseUrl}/rest/dev-status/1.0/issue/detail?issueId=${encodeURIComponent(issueId)}&applicationType=GitHub&dataType=pullrequest`;
    const res = await this.doFetch(url, { headers: this.headers() });
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) return [];
      throw new Error(
        `Jira dev-status failed (${res.status}): ${await res.text()}`,
      );
    }
    const data = (await res.json()) as {
      detail?: Array<{
        pullRequests?: Array<{ url: string; status: string }>;
      }>;
    };
    const prs: JiraPullRequestRef[] = [];
    for (const detail of data.detail ?? []) {
      for (const pr of detail.pullRequests ?? []) {
        prs.push({ url: pr.url, status: pr.status, source: "jira-dev-status" });
      }
    }
    return prs;
  }
}
