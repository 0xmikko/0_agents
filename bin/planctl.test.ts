import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("planctl launcher", () => {
  /**
   * @test-id: tst_agent_unit_planctl_001
   * @scenario: scn_planctl_install_001
   * @covers: bin/planctl::symlink-resolution
   * @deterministic: yes
   * @fixtures: none
   *
   * Test environment: repository planctl launcher through an installed symlink
   * Clients: direct calls
   * Mocks: none
   * Data: temporary bin directory
   */
  it("tst_agent_unit_planctl_001 runs through the installed symlink", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "planctl-launcher-"));
    const temporaryBin = join(temporaryRoot, "bin");
    const installedLauncher = join(temporaryBin, "planctl");

    try {
      mkdirSync(temporaryBin);
      symlinkSync(join(import.meta.dir, "planctl"), installedLauncher);

      const result = spawnSync(installedLauncher, ["--help"], { encoding: "utf8" });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Usage: planctl <command>");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
