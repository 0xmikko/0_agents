import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { retroRegister, retroStatus } from "../src/core/retro-register";

const LAW = `# The process

Some law.

## Register of experiments

| Date | Delivery | Experiment | Status |
|---|---|---|---|
`;

describe("retro-status", () => {
  // @test-id: tst_retro_status_001
  // @covers: planctl/src/core/retro-register.ts::retroRegister, retroStatus
  // @deterministic: yes
  // @invariant: the last experiment in the register must carry a status
  // (accepted or declined) before a Delivery may close; an empty register
  // passes; a malformed row is refused rather than read as a status.
  it("tst_retro_status_001 refuses a last experiment without a status and passes with one", () => {
    const root = mkdtempSync(join(tmpdir(), "retro-"));
    const law = join(root, "development-process.md");
    try {
      writeFileSync(law, LAW);
      expect(retroStatus(law)).toEqual({ ok: true, reason: "no experiment recorded yet" });

      writeFileSync(law, `${LAW}| 2026-09-17 | unified-launch PR #258 | check open PRs into staging before lock-spec | |\n`);
      expect(retroRegister(law)).toHaveLength(1);
      expect(retroStatus(law)).toEqual({ ok: false, reason: "the last experiment (2026-09-17, unified-launch PR #258) has no status; the owner accepts or declines it before the next Delivery closes" });

      writeFileSync(law, `${LAW}| 2026-09-17 | unified-launch PR #258 | check open PRs into staging before lock-spec | accepted 2026-09-18 |\n| 2026-09-18 | remove-desktop PR #265 | print the position at session start | |\n`);
      expect(retroStatus(law).ok).toBe(false);

      writeFileSync(law, `${LAW}| 2026-09-17 | unified-launch PR #258 | check open PRs into staging before lock-spec | declined 2026-09-18 |\n`);
      expect(retroStatus(law)).toEqual({ ok: true, reason: "the last experiment has a status: declined 2026-09-18" });

      writeFileSync(law, `${LAW}| 2026-09-17 | unified-launch PR #258 | check open PRs into staging before lock-spec | maybe |\n`);
      expect(() => retroStatus(law)).toThrow(/status must be "accepted" or "declined"/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
