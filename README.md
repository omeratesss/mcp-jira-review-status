# mcp-jira-review-status

MCP server that answers one question project managers ask every day:

> "Task `PROJ-123` is in review — **who still needs to approve it?**"

Give it a ticket key. It searches GitHub for PRs whose title or body
contains the key and reports:

- Is the PR open, merged, or closed?
- Who are the reviewers?
- Who **already approved**, who **requested changes**, who is **still pending**?

So managers can nudge the right person instead of broadcasting to the team.

---

## Quick start

```sh
npx -y mcp-jira-review-status setup
```

Two questions only:

1. **GitHub token** — create one at <https://github.com/settings/tokens/new>
   with scopes **`repo`** and **`read:org`**.
2. **Which MCP client?** — Claude Desktop, Claude Code (terminal), or Cursor.

The wizard verifies your token, auto-detects which GitHub orgs to search in,
and installs the server. No manual JSON editing.

Restart your client (Claude Code picks it up on `/mcp` reload), then ask:

> "Use jira-review-status to check PROJ-123"

---

## Updating

```sh
npx -y mcp-jira-review-status@latest update
```

This walks through every client it finds installed (Claude Desktop, Claude
Code, Cursor), replaces the pinned version in each config with whatever is
latest on npm, and keeps your token untouched. Restart clients after
running.

---

## What you get

**Tool:** `get_review_status({ issueKey: "PROJ-123" })`

**Output (deliberately minimal — only what a PM needs to nudge the right person):**

```
PROJ-123: 1 PR

#482 OPEN https://github.com/your-org/app/pull/482
Approved (1/3): mehmet
Not approved (2): can, zeynep
```

No CI status, merge conflicts, labels, branches, or author info — the tool
answers one question ("who still needs to approve?") and stays out of the
way. The server prompts the LLM to not embellish this either.

A structured JSON copy is returned alongside the text for downstream tools.

---

## How it works

1. When the server starts, it reads your `GITHUB_TOKEN`.
2. When you call `get_review_status(issueKey)`, it runs a GitHub search:
   `org:<your-orgs> is:pr <issueKey> in:title,body`.
3. For each matching PR it fetches the PR state, `requested_reviewers`, and
   the reviews timeline, then aggregates per-user latest-wins:
   - The most recent non-dismissed review of type `APPROVED` or
     `CHANGES_REQUESTED` wins.
   - A user who only commented is reported separately.
   - Users in `requested_reviewers` with no review yet are `pending`.

### Customizing the search scope

By default the server searches every org the token has access to. Override
via env (comma-separated; `owner/repo` for repos, plain names for orgs):

```
MCP_JIRA_REVIEW_SEARCH_SCOPE=your-org,other-org/tools
```

Or in `~/.config/mcp-jira-review/config.json`:

```json
{ "searchScope": ["your-org", "other-org/tools"] }
```

Or per-project `./.mcp-jira-review.json`:

```json
{ "searchScope": ["your-org/android", "your-org/ios"] }
```

---

## Manual install (advanced)

If you skip the wizard, add this to your Claude Desktop or Cursor config:

```json
{
  "mcpServers": {
    "jira-review-status": {
      "command": "npx",
      "args": ["-y", "mcp-jira-review-status"],
      "env": { "GITHUB_TOKEN": "ghp_…" }
    }
  }
}
```

For Claude Code:

```sh
claude mcp add jira-review-status --scope user -e GITHUB_TOKEN=ghp_… -- npx -y mcp-jira-review-status
```

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
