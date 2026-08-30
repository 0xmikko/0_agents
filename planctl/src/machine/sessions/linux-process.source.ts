import { readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

import type { AgentProcessIdentity } from "./session-source";

function sessionIdentity(environment: string): Pick<AgentProcessIdentity, "provider" | "sessionId"> | null {
  let codexSession: string | null = null;
  let claudeSession: string | null = null;
  for (const entry of environment.split("\0")) {
    const separator = entry.indexOf("=");
    if (separator < 1) continue;
    const key = entry.slice(0, separator);
    const value = entry.slice(separator + 1);
    if (value === "") continue;
    if (key === "CODEX_SESSION_ID" || (key === "CODEX_THREAD_ID" && codexSession === null)) codexSession = value;
    if (key === "CLAUDE_SESSION_ID") claudeSession = value;
  }
  if (codexSession !== null) return { provider: "codex", sessionId: codexSession };
  if (claudeSession !== null) return { provider: "claude", sessionId: claudeSession };
  return null;
}

/**
 * @tested-by: tst_svc_planctld_sessions_001
 * @invariant: process discovery exports only provider/session/cwd identity and cannot leak unrelated environment variables.
 */
export function discoverLinuxAgentProcesses(procRoot = "/proc"): readonly AgentProcessIdentity[] {
  const identities: AgentProcessIdentity[] = [];
  let entries: string[];
  try {
    entries = readdirSync(procRoot);
  } catch {
    return identities;
  }
  for (const entry of entries.sort((left, right) => Number(left) - Number(right))) {
    if (!/^[1-9]\d*$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const identity = sessionIdentity(readFileSync(join(procRoot, entry, "environ"), "utf8"));
      if (identity === null) continue;
      identities.push({ pid, ...identity, cwd: readlinkSync(join(procRoot, entry, "cwd")) });
    } catch {
      // Processes can exit or become unreadable between directory enumeration and metadata reads.
    }
  }
  return identities;
}
