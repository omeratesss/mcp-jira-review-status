export interface GithubValidation {
  ok: boolean;
  message: string;
  login?: string;
  orgs?: string[];
}

export async function validateGithubAndDetectScope(token: string): Promise<GithubValidation> {
  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (userRes.status === 401) {
      return { ok: false, message: "GitHub rejected the token (401). Generate a new one with `repo` + `read:org` scopes." };
    }
    if (!userRes.ok) {
      return { ok: false, message: `GitHub error ${userRes.status}: ${await userRes.text()}` };
    }
    const user = (await userRes.json()) as { login: string };

    const orgsRes = await fetch("https://api.github.com/user/orgs?per_page=100", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    let orgs: string[] = [];
    if (orgsRes.ok) {
      const data = (await orgsRes.json()) as Array<{ login: string }>;
      orgs = data.map((o) => o.login);
    }

    return {
      ok: true,
      message: `GitHub OK — logged in as ${user.login}${orgs.length ? `, orgs: ${orgs.join(", ")}` : " (no orgs detected)"}`,
      login: user.login,
      orgs,
    };
  } catch (err) {
    return { ok: false, message: `GitHub connection failed: ${(err as Error).message}` };
  }
}
