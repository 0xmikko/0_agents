import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export interface JsonlRecord {
  readonly value: unknown;
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface JsonlIssue {
  readonly code: "file_truncated" | "malformed_jsonl";
  readonly offset: number;
  readonly message: string;
}

export interface JsonlTailResult {
  readonly records: readonly JsonlRecord[];
  readonly issues: readonly JsonlIssue[];
  readonly nextOffset: number;
  readonly pendingBytes: number;
}

function assertOffset(offset: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("JSONL cursor offset must be a non-negative integer");
}

/**
 * @tested-by: tst_svc_planctld_sessions_001
 * @invariant: a byte cursor advances only after a newline-terminated JSON object; a partial or malformed tail cannot become activity.
 */
export function readJsonlTail(path: string, offset: number): JsonlTailResult {
  assertOffset(offset);
  const descriptor = openSync(path, "r");
  try {
    const size = fstatSync(descriptor).size;
    if (size < offset) {
      return {
        records: [],
        issues: [{ code: "file_truncated", offset, message: `source shrank from cursor ${offset} to ${size} bytes` }],
        nextOffset: 0,
        pendingBytes: size,
      };
    }
    const length = size - offset;
    if (length === 0) return { records: [], issues: [], nextOffset: offset, pendingBytes: 0 };
    const bytes = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
      const count = readSync(descriptor, bytes, read, length - read, offset + read);
      if (count === 0) break;
      read += count;
    }
    const data = bytes.subarray(0, read);
    const records: JsonlRecord[] = [];
    let lineStart = 0;
    let nextOffset = offset;
    for (let index = 0; index < data.length; index += 1) {
      if (data[index] !== 0x0a) continue;
      const end = data[index - 1] === 0x0d ? index - 1 : index;
      const line = data.subarray(lineStart, end).toString("utf8");
      const absoluteStart = offset + lineStart;
      if (line.length === 0) {
        return {
          records,
          issues: [{ code: "malformed_jsonl", offset: absoluteStart, message: "empty JSONL record" }],
          nextOffset,
          pendingBytes: size - nextOffset,
        };
      }
      let value: unknown;
      try {
        value = JSON.parse(line) as unknown;
      } catch {
        return {
          records,
          issues: [{ code: "malformed_jsonl", offset: absoluteStart, message: "invalid JSON object" }],
          nextOffset,
          pendingBytes: size - nextOffset,
        };
      }
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {
          records,
          issues: [{ code: "malformed_jsonl", offset: absoluteStart, message: "JSONL record is not an object" }],
          nextOffset,
          pendingBytes: size - nextOffset,
        };
      }
      const absoluteEnd = offset + index + 1;
      records.push({ value, startOffset: absoluteStart, endOffset: absoluteEnd });
      nextOffset = absoluteEnd;
      lineStart = index + 1;
    }
    return { records, issues: [], nextOffset, pendingBytes: size - nextOffset };
  } finally {
    closeSync(descriptor);
  }
}
