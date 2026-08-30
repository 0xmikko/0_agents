import type { SessionActivity, SessionFileCursor, SessionFileScan, SessionSourceIssue } from "./session-source";

import { readJsonlTail } from "./jsonl-tail-reader";
import { sessionCursor } from "./session-source";

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Readonly<Record<string, unknown>>;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function later(current: string | null, candidate: unknown): string | null {
  const text = optionalText(candidate);
  if (text === null || !Number.isFinite(Date.parse(text))) return current;
  return current === null || Date.parse(text) > Date.parse(current) ? text : current;
}

/**
 * @tested-by: tst_svc_planctld_sessions_001
 * @invariant: Claude message content is never retained; only top-level identity, cwd and timestamp metadata enter observations.
 */
export function scanClaudeSessionFile(path: string, from: SessionFileCursor | number): SessionFileScan {
  const previous = sessionCursor(from);
  const tail = readJsonlTail(path, previous.offset);
  let sessionId = previous.sessionId;
  let cwd = previous.cwd;
  let lastActivityAt = previous.lastActivityAt;
  for (const entry of tail.records) {
    const value = record(entry.value);
    if (value === null) continue;
    sessionId = optionalText(value.sessionId) ?? sessionId;
    cwd = optionalText(value.cwd) ?? cwd;
    lastActivityAt = later(lastActivityAt, value.timestamp);
  }
  const cursor = { offset: tail.nextOffset, sessionId, cwd, lastActivityAt } satisfies SessionFileCursor;
  const issues: SessionSourceIssue[] = tail.issues.map((issue) => ({ ...issue, sourcePath: path }));
  if (tail.pendingBytes > 0 && tail.issues.length === 0) {
    issues.push({ sourcePath: path, code: "truncated_tail", offset: tail.nextOffset, message: "Claude JSONL tail is incomplete" });
  }
  if (tail.records.length > 0 && (sessionId === null || cwd === null || lastActivityAt === null)) {
    issues.push({ sourcePath: path, code: "missing_metadata", offset: tail.nextOffset, message: "Claude session metadata is incomplete" });
  }
  const activity: SessionActivity | null = sessionId === null || cwd === null || lastActivityAt === null
    ? null
    : { agentId: `claude:${sessionId}`, provider: "claude", sessionId, cwd, sourcePath: path, lastActivityAt };
  return { activity, cursor, issues };
}
