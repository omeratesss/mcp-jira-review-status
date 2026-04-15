# mcp-jira-review-status

MCP server that answers one question project managers ask every day:

> "Task `PROJ-123` is in review — **who still needs to approve it?**"

Give it a Jira issue key. It finds the linked pull request(s) and reports:

- Is the PR open, merged, or closed?
- Who are the reviewers?
- Who **already approved**, who **requested changes**, who is **still pending**?

So managers can nudge the right person instead of broadcasting to the team.

## Install & configure

### 1. Generate tokens

- **Atlassian API token:** <https://id.atlassian.com/manage-profile/security/api-tokens>
- **GitHub Personal Access Token:** <https://github.com/settings/tokens> — scopes: `repo` (for private repos) and `read:org`.

### 2. Add to your MCP client

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "jira-review-status": {
      "command": "npx",
      "args": ["-y", "mcp-jira-review-status"],
      "env": {
        "JIRA_SITE": "your-org.atlassian.net",
        "JIRA_EMAIL": "you@example.com",
        "JIRA_API_TOKEN": "…",
        "GITHUB_TOKEN": "ghp_…",
        "MCP_JIRA_REVIEW_REPOS": "your-org/app,your-org/api"
      }
    }
  }
}
```

`MCP_JIRA_REVIEW_REPOS` is used as a fallback when Jira's GitHub integration
doesn't have the PR link. Comma-separated list of `owner/repo`.

### Alternative: config file

Instead of env, you can put the same values in
`~/.config/mcp-jira-review/config.json`:

```json
{
  "jiraSite": "your-org.atlassian.net",
  "jiraEmail": "you@example.com",
  "jiraApiToken": "…",
  "githubToken": "ghp_…",
  "repos": ["your-org/app", "your-org/api"]
}
```

Per-project repo list can also live in `./.mcp-jira-review.json`:

```json
{ "repos": ["your-org/android", "your-org/ios"] }
```

## Tool: `get_review_status`

Input: `{ "issueKey": "PROJ-123" }`

Output (text + structured JSON):

```
PROJ-123 — Wire new auth middleware
Status: In Review   Assignee: Ayşe Yılmaz
https://your-org.atlassian.net/browse/PROJ-123

Found 1 PR(s) via jira-dev-status:

  #482 Wire new auth middleware
  https://github.com/your-org/app/pull/482
  OPEN   your-org/app   feature/auth → develop   author: ayse
  Approved:          mehmet
  Pending review:    can, zeynep
```

## How task→PR resolution works

1. **Primary:** Jira Development panel
   (`/rest/dev-status/1.0/issue/detail`). If your Jira is linked to GitHub,
   this returns the PR URLs directly — no convention needed.
2. **Fallback:** GitHub search
   (`is:pr {ISSUE-KEY} in:title,body`) across the repos you listed.

Review status per user follows GitHub's latest-wins semantics: the most recent
non-dismissed review of type `APPROVED` or `CHANGES_REQUESTED` wins; a user
who only commented is reported separately; users in `requested_reviewers`
without any review are `pending`.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build    # → dist/index.js (with shebang, bin)
```

## License

MIT
