import {
  clientName,
  findInstallations,
  writeMcpServerEntry,
} from "./clientConfig.js";
import { PACKAGE_NAME } from "../version.js";

const SERVER_NAME = "jira-review-status";

function abort(msg: string): never {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

async function fetchLatestVersion(): Promise<string> {
  const res = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status}`);
  }
  const data = (await res.json()) as { version: string };
  return data.version;
}

const VERSION_PATTERN = new RegExp(`^${PACKAGE_NAME}(?:@[^@]+)?$`);

function currentPinnedVersion(args: string[]): string | null {
  for (const arg of args) {
    if (VERSION_PATTERN.test(arg)) {
      const at = arg.lastIndexOf("@");
      return at > 0 ? arg.slice(at + 1) : "unpinned";
    }
  }
  return null;
}

export async function runUpdate(): Promise<void> {
  console.log("\nmcp-jira-review-status — update\n");

  const latest = await fetchLatestVersion();
  console.log(`Latest on npm: ${latest}`);

  const installs = findInstallations(SERVER_NAME);
  if (installs.length === 0) {
    abort(
      `No installations of '${SERVER_NAME}' found. Run \`npx -y ${PACKAGE_NAME}@latest setup\` first.`,
    );
  }

  let updatedCount = 0;
  for (const install of installs) {
    const before = currentPinnedVersion(install.entry.args);
    const newArgs = rebuildArgs(install.entry.args, latest);
    const newEntry = {
      ...install.entry,
      args: newArgs,
    };

    if (before === latest) {
      console.log(`  • ${clientName(install.clientId)}: already at ${latest}, skipping.`);
      continue;
    }

    writeMcpServerEntry({
      path: install.path,
      serverName: SERVER_NAME,
      entry: newEntry,
    });
    updatedCount++;
    console.log(
      `  ✓ ${clientName(install.clientId)}: ${before ?? "?"} → ${latest}`,
    );
  }

  if (updatedCount > 0) {
    console.log(
      "\nRestart any running MCP clients (Claude Desktop / Cursor) or reload Claude Code to pick up the new version.",
    );
  } else {
    console.log("\nAll installations are already up to date.");
  }
  console.log();
}

function rebuildArgs(args: string[], version: string): string[] {
  const pinned = `${PACKAGE_NAME}@${version}`;
  let replaced = false;
  const out = args.map((arg) => {
    if (VERSION_PATTERN.test(arg)) {
      replaced = true;
      return pinned;
    }
    return arg;
  });
  if (!replaced) out.push(pinned);
  return out;
}
