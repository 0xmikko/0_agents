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
 * @invariant: Codex payload content is never retained; only session_meta identity and top-level timestamps enter observations.
 */
export function scanCodexSessionFile(path: string, from: SessionFileCursor | number): SessionFileScan {
  const previous = sessionCursor(from);
  const tail = readJsonlTail(path, previous.offset);
  let sessionId = previous.sessionId;
  let cwd = previous.cwd;
  let lastActivityAt = previous.lastActivityAt;
  for (const entry of tail.records) {
    const value = record(entry.value);
    if (value === null) continue;
    lastActivityAt = later(lastActivityAt, value.timestamp);
    if (value.type !== "session_meta") continue;
    const payload = record(value.payload);
    if (payload === null) continue;
    sessionId = optionalText(payload.id) ?? sessionId;
    cwd = optionalText(payload.cwd) ?? cwd;
  }
  const cursor = { offset: tail.nextOffset, sessionId, cwd, lastActivityAt } satisfies SessionFileCursor;
  const issues: SessionSourceIssue[] = tail.issues.map((issue) => ({ ...issue, sourcePath: path }));
  if (tail.pendingBytes > 0 && tail.issues.length === 0) {
    issues.push({ sourcePath: path, code: "truncated_tail", offset: tail.nextOffset, message: "Codex JSONL tail is incomplete" });
  }
  if (tail.records.length > 0 && (sessionId === null || cwd === null || lastActivityAt === null)) {
    issues.push({ sourcePath: path, code: "missing_metadata", offset: tail.nextOffset, message: "Codex session metadata is incomplete" });
  }
  const activity: SessionActivity | null = sessionId === null || cwd === null || lastActivityAt === null
    ? null
    : { agentId: `codex:${sessionId}`, provider: "codex", sessionId, cwd, sourcePath: path, lastActivityAt };
  return { activity, cursor, issues };
}
