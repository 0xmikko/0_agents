import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearOwnerWait,
  markOwnerWait,
  ownerWaitPath,
  readOwnerWait,
} from "../src/core/task-run";

describe("planctl structured owner waits", () => {
  /*
   * @test-id: tst_cli_planctl_owner_wait_001
   * @scenario: scn_planctl_owner_wait_001
   * @covers: planctl/src/core/task-run.ts::markOwnerWait,clearOwnerWait
   * @deterministic: yes
   * @fixtures: temporary Git-common directory
   * Test environment: Bun filesystem test
   * Clients: planctl needs-owner and resume-task commands
   * Mocks: injected timestamp
   * Data: safe-line structured marker and transcript-like unstructured text
   */
  it("tst_cli_planctl_owner_wait_001 creates only a structured marker and clears it atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "planctl-owner-wait-"));
    try {
      const path = ownerWaitPath(root, "docs/plans/observer.md", "PLCTL_014");
      expect(readOwnerWait(path)).toBeNull();

      const marker = markOwnerWait(path, {
        plan: "docs/plans/observer.md",
        taskId: "PLCTL_014",
        reason: "Choose the externally reachable hostname",
        startedAt: "2026-08-29T20:00:00.000Z",
      });
      expect(marker.version).toBe(1);
      expect(readOwnerWait(path)).toEqual(marker);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(marker);

      expect(() => markOwnerWait(path, {
        plan: "docs/plans/observer.md",
        taskId: "PLCTL_014",
        reason: "Question?\nMaybe this means the owner owes a response",
        startedAt: "2026-08-29T20:00:00.000Z",
      })).toThrow("reason must be one safe line");
      expect(readOwnerWait(path)).toEqual(marker);

      expect(clearOwnerWait(path)).toBe(true);
      expect(readOwnerWait(path)).toBeNull();
      expect(clearOwnerWait(path)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
