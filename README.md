# mcp-jira-review-status

MCP server that answers one question project managers ask every day:

> "Task `PROJ-123` is in review — **who still needs to approve it?**"

Give it a Jira issue key. It finds the linked pull request(s) and reports:

- Is the PR open, merged, or closed?
- Who are the reviewers?
- Who **already approved**, who **requested changes**, who is **still pending**?

So managers can nudge the right person instead of broadcasting to the team.

---

## Setup (5 minutes)

### Step 1 — Generate an Atlassian API token

1. Go to <https://id.atlassian.com/manage-profile/security/api-tokens>
2. **Create API token** → name it `mcp-jira-review-status` → **Copy**.
3. Note your Jira site (e.g. `your-org.atlassian.net`) and the email you use for Jira.

### Step 2 — Generate a GitHub Personal Access Token

1. Go to <https://github.com/settings/tokens/new>
2. Note: `mcp-jira-review-status`
3. Scopes: **`repo`** and **`read:org`**
4. Expiration: whatever you prefer → **Generate token** → **Copy**.

### Step 3 — Add the MCP server to your client

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "jira-review-status": {
      "command": "npx",
      "args": ["-y", "mcp-jira-review-status"],
      "env": {
        "JIRA_SITE": "your-org.atlassian.net",
        "JIRA_EMAIL": "you@example.com",
        "JIRA_API_TOKEN": "paste-atlassian-token",
        "GITHUB_TOKEN": "ghp_paste-github-token",
        "MCP_JIRA_REVIEW_REPOS": "your-org/android,your-org/api"
      }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`) uses the same block under `mcpServers`.

`MCP_JIRA_REVIEW_REPOS` is a comma-separated `owner/repo` list. It's only
used as a **fallback** when Jira's GitHub integration hasn't linked the PR to
the issue — then the server searches for `is:pr {ISSUE-KEY} in:title,body`
across these repos.

### Step 4 — Restart the client and try it

Restart Claude Desktop / Cursor. Then ask:

> "Use jira-review-status to check PROJ-123."

You should see a reviewer breakdown for any linked PRs.

---

## Tool: `get_review_status`

**Input:** `{ "issueKey": "PROJ-123" }`

**Output (text):**

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

## Alternative: config file instead of env

If you prefer not to put tokens in the client config, put them in
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

Per-project repo overrides can live in `./.mcp-jira-review.json`:

```json
{ "repos": ["your-org/android", "your-org/ios"] }
```

Precedence: env → workspace file → user config file.

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
