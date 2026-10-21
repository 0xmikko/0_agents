/**
 * Opt-in regression of the reproduced missing-contract defect.
 * Run: bun bench/spec-quality-repro.ts
 * Exits 0 only when submission preserves the draft and reports absent solution contracts.
 *
 * @test-id: tst_unit_planctl_spec_submission_003
 * @scenario: scn_planctl_spec_quality_001
 * @covers: planctl/src/core/spec-submission.ts::submitSpec
 * @deterministic: yes
 * @fixtures: test/fixtures/spec-goals-without-solution.md
 * @invariant: a requested system design without its typed operation contracts
 * is an incomplete draft, even if its Markdown syntax is valid.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createDraftPlan, journalCreatedPlan, protocolSpecHash } from "../src/core/plan-update";
import { submitSpec } from "../src/core/spec-submission";

const root = mkdtempSync(join(tmpdir(), "spec-quality-repro-"));
const plan = "docs/plans/2026-10-20-quality-repro.md";
const git = (...args: string[]): void => {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
};
try {
  git("init", "-q", "-b", "feat/quality-repro");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("commit", "-q", "--allow-empty", "-m", "fixture");
  mkdirSync(dirname(join(root, plan)), { recursive: true });
  const body = createDraftPlan("Quality reproduction");
  writeFileSync(join(root, plan), body);
  git("add", plan);
  journalCreatedPlan(root, plan, body);

  const spec = readFileSync(join(import.meta.dir, "../test/fixtures/spec-goals-without-solution.md"), "utf8");
  const result = await submitSpec(root, {
    plan,
    baseRevision: protocolSpecHash(body),
    ownerRequest: "Describe the planctl MCP system: named commands, typed inputs and outputs, stored state, and operation and failure flows. Goals and workflow principles alone are insufficient.",
    spec,
  });
  assert.equal(result.state, "SPEC_DRAFT");
  assert.ok(readFileSync(join(root, plan), "utf8").includes(spec.trim()), "Keep the incomplete draft saveable");
  assert.ok(result.findings.some(finding =>
    finding.blocking && /interface|contract|typed/i.test(finding.text)
  ), "Missing solution contracts were not reported: valid Markdown is not a complete system SPEC");
} finally {
  rmSync(root, { recursive: true, force: true });
}
