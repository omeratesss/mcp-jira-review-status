# mcp-jira-review-status

MCP server that answers one question project managers ask every day:

> "Task `PROJ-123` is in review — **who still needs to approve it?**"

Give it a Jira issue key. It finds the linked pull request(s) and reports:

- Is the PR open, merged, or closed?
- Who are the reviewers?
- Who **already approved**, who **requested changes**, who is **still pending**?

So managers can nudge the right person instead of broadcasting to the team.

---

## Quick start (one command)

```sh
npx -y mcp-jira-review-status setup
```

You'll be asked for:

1. **Jira site** — e.g. `your-org.atlassian.net`
2. **Jira email** — the email you sign in to Jira with
3. **Jira API token** — create one at
   <https://id.atlassian.com/manage-profile/security/api-tokens>
4. **GitHub token** — create one at
   <https://github.com/settings/tokens/new> with scopes **`repo`** and **`read:org`**
5. **Fallback repos** (optional) — comma-separated `owner/repo` list used
   only when Jira's GitHub integration hasn't linked the PR to the issue

The wizard **verifies both tokens** before writing anything, then installs
the server into your MCP client's config file (Claude Desktop or Cursor).
It **backs up** your existing config and **preserves** any other MCP
servers you already have.

Restart your client, then ask:

> "Use jira-review-status to check PROJ-123"

---

## What you get

**Tool:** `get_review_status({ issueKey: "PROJ-123" })`

**Output:**

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

A structured JSON copy is returned alongside the text for downstream tools.

---

## How task → PR resolution works

1. **Primary:** Jira Development panel
   (`/rest/dev-status/1.0/issue/detail`). If Jira is linked to GitHub,
   this returns the PR URLs directly — no branch/title convention needed.
2. **Fallback:** GitHub search
   (`is:pr {ISSUE-KEY} in:title,body`) across your configured repos.

Review status per user follows GitHub's latest-wins semantics: the most
recent non-dismissed review of type `APPROVED` or `CHANGES_REQUESTED`
wins; a user who only commented is reported separately; users in
`requested_reviewers` without any review are `pending`.

---

## Manual installation (advanced)

If you prefer to edit the MCP client config yourself, add this block to
your `claude_desktop_config.json` (or `~/.cursor/mcp.json`):

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

### Config file alternative

Instead of env in the client config, you can put credentials in
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

Per-project repo overrides: `./.mcp-jira-review.json`:

```json
{ "repos": ["your-org/android", "your-org/ios"] }
```

Precedence: env → workspace file → user config file.

---

## Development

```sh
git clone https://github.com/omeratesss/mcp-jira-review-status
cd mcp-jira-review-status
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
