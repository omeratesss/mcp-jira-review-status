export interface JiraCreds {
  site: string;
  email: string;
  apiToken: string;
}

export async function validateJira(c: JiraCreds): Promise<{ ok: boolean; message: string }> {
  const url = `https://${c.site}/rest/api/3/myself`;
  const auth = "Basic " + Buffer.from(`${c.email}:${c.apiToken}`).toString("base64");
  try {
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Jira rejected the credentials (401/403). Check email + API token." };
    }
    if (res.status === 404) {
      return { ok: false, message: `Jira site not found: ${c.site}` };
    }
    if (!res.ok) {
      return { ok: false, message: `Jira error ${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as { displayName?: string; emailAddress?: string };
    return { ok: true, message: `Jira OK — ${data.displayName ?? data.emailAddress ?? "authenticated"}` };
  } catch (err) {
    return { ok: false, message: `Jira connection failed: ${(err as Error).message}` };
  }
}

export async function validateGithub(token: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (res.status === 401) {
      return { ok: false, message: "GitHub rejected the token (401). Generate a new one with 'repo' + 'read:org' scopes." };
    }
    if (!res.ok) {
      return { ok: false, message: `GitHub error ${res.status}: ${await res.text()}` };
    }
    const data = (await res.json()) as { login?: string };
    return { ok: true, message: `GitHub OK — logged in as ${data.login ?? "unknown"}` };
  } catch (err) {
    return { ok: false, message: `GitHub connection failed: ${(err as Error).message}` };
  }
}
