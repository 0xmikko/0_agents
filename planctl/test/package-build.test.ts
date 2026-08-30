import { afterEach, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const roots: string[] = [];

function buildArguments(outputDirectory: string): readonly string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("planctl package manifest must be an object");
  }
  const scripts = (parsed as Readonly<Record<string, unknown>>).scripts;
  if (typeof scripts !== "object" || scripts === null || Array.isArray(scripts)) {
    throw new Error("planctl package scripts must be an object");
  }
  const command = (scripts as Readonly<Record<string, unknown>>).build;
  if (typeof command !== "string" || command === "") throw new Error("planctl build script is missing");
  const tokens = command.split(/\s+/);
  if (tokens[0] !== "bun" || tokens[1] !== "build") throw new Error("planctl build script must invoke bun build");
  const outdir = tokens.indexOf("--outdir");
  if (outdir === -1 || tokens[outdir + 1] === undefined) throw new Error("planctl build script must declare --outdir");
  tokens[outdir + 1] = outputDirectory;
  return tokens;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * @test-id: tst_cert_planctl_build_001
 * @scenario: scn_planctl_build_001
 * @covers: planctl/package.json#scripts.build
 * @deterministic: yes
 * @fixtures: isolated build output directory
 *
 * Test environment: Bun bundler over all three production entrypoints
 * Clients: declared package build command
 * Mocks: none
 * Data: CLI, machine collector and central server entrypoints
 */
it("tst_cert_planctl_build_001 bundles every production entrypoint without optional Nest peers", () => {
  const output = mkdtempSync(join(tmpdir(), "planctl-package-build-"));
  roots.push(output);
  const [executable, ...args] = buildArguments(output);
  if (executable === undefined) throw new Error("planctl build executable is missing");
  const built = spawnSync(executable, args, { cwd: PACKAGE_ROOT, encoding: "utf8" });

  expect(built.status, built.stderr).toBe(0);
  const artifacts = [
    "cli/main.js",
    "core/plan-gate.js",
    "core/plan-update.js",
    "machine/main.js",
    "server/main.js",
  ];
  expect(artifacts.every((artifact) => existsSync(join(output, artifact)))).toBeTrue();

  for (const [artifact, args, expectedStatus, expectedOutput] of [
    ["cli/main.js", ["--help"], 0, "planctl <command>"],
    ["machine/main.js", ["--help"], 0, "Usage: planctld"],
    ["server/main.js", ["--help"], 0, "Usage: planctl-server"],
    ["core/plan-gate.js", [], 64, "usage: bun"],
    ["core/plan-update.js", [], 64, "usage: bun"],
  ] as const) {
    const smoke = spawnSync("bun", [join(output, artifact), ...args], { cwd: output, encoding: "utf8" });
    expect(smoke.status, `${artifact}: ${smoke.stderr}`).toBe(expectedStatus);
    expect(`${smoke.stdout}${smoke.stderr}`).toContain(expectedOutput);
  }
});
