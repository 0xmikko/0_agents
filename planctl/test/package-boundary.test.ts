import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, it } from "bun:test";

import { installStack } from "../../shared/code-production/agent-stack";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
const CANONICAL_RUNTIME = [
  ["src/cli/main.ts", ".agents/code-production/runtime/planctl.ts"],
  ["src/core/plan-update.ts", ".agents/code-production/runtime/plan-update.ts"],
  ["src/core/plan-gate.ts", ".agents/code-production/runtime/plan-gate.ts"],
] as const;

function git(root: string, ...args: readonly string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function consumerPackage(): string {
  const scripts = {
    "agent:install": "bun -e \"process.exit(0)\"",
    "agent:test:backend": "bun -e \"process.exit(0)\"",
    "agent:test:frontend": "bun -e \"process.exit(0)\"",
    "agent:test:e2e": "bun -e \"process.exit(0)\"",
    "agent:verify:commit": "bun -e \"process.exit(0)\"",
    "agent:verify:pr": "bun -e \"process.exit(0)\"",
    "agent:verify:docs": "bun -e \"process.exit(0)\"",
  };
  return `${JSON.stringify({ name: "planctl-package-consumer", private: true, scripts }, null, 2)}\n`;
}

/**
 * @test-id: tst_unit_planctl_package_001
 * @scenario: scn_planctl_package_001
 * @covers: planctl/src/cli/main.ts, shared/code-production/agent-stack.ts::managedFiles
 * @deterministic: yes
 * @fixtures: temporary Git consumer repository
 *
 * Test environment: dedicated planctl Bun package and temporary consumer repository
 * Clients: CLI and direct stack installer
 * Mocks: package scripts are deterministic process exits
 * Data: canonical CLI/core source bytes and seven managed consumer targets
 */
it("tst_unit_planctl_package_001 launches canonical planctl and preserves consumer targets", () => {
  const cli = join(REPOSITORY_ROOT, "planctl/src/cli/main.ts");
  const help = spawnSync("bun", [cli, "--help"], { cwd: REPOSITORY_ROOT, encoding: "utf8" });

  expect(help.status).toBe(0);
  expect(help.stdout).toContain("planctl <command>");
  expect(readFileSync(join(REPOSITORY_ROOT, "bin/planctl"), "utf8")).toContain("planctl/src/cli/main.ts");

  const consumer = mkdtempSync(join(tmpdir(), "planctl-package-consumer-"));
  try {
    git(consumer, "init", "-q");
    git(consumer, "config", "user.email", "planctl@example.test");
    git(consumer, "config", "user.name", "Planctl Test");
    writeFileSync(join(consumer, "package.json"), consumerPackage());
    mkdirSync(join(consumer, "docs/plans"), { recursive: true });
    git(consumer, "add", ".");
    git(consumer, "commit", "-qm", "test: consumer fixture");

    const installed = installStack(consumer);

    expect(installed.files).toHaveLength(7);
    for (const [source, target] of CANONICAL_RUNTIME) {
      expect(readFileSync(join(consumer, target), "utf8")).toBe(
        readFileSync(join(REPOSITORY_ROOT, "planctl", source), "utf8"),
      );
    }
    const installedHelp = spawnSync(
      "bun",
      [join(consumer, ".agents/code-production/runtime/planctl.ts"), "--help"],
      { cwd: consumer, encoding: "utf8" },
    );
    expect(installedHelp.status).toBe(0);
    expect(installedHelp.stdout).toContain("planctl <command>");
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
});
