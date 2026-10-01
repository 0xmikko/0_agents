import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lint } from "../src/core/plan-gate";
import { createDraftPlan, journalCreatedPlan, lockPlanSpec, mutatePlanFile, protocolSpecHash } from "../src/core/plan-update";
import { submitSpec } from "../src/core/spec-submission";


const PLAN = "docs/plans/2026-09-25-fixture.md";

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "spec-submission-"));
  const git = (...args: readonly string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "feat/fixture");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("commit", "-q", "--allow-empty", "-m", "the repository");
  mkdirSync(join(root, "docs/plans"), { recursive: true });
  const body = createDraftPlan("Fixture plan");
  writeFileSync(join(root, PLAN), body);
  git("add", PLAN);
  journalCreatedPlan(root, PLAN, body);
  return root;
}

const spec = readFileSync(join(import.meta.dir, "fixtures/plan-lint.md"), "utf8").replace("Reduce invalid changes from three per release to zero.", "Ship one observable result.");

describe("submit_spec", () => {
  /**
   * @test-id: tst_unit_planctl_spec_submission_001
   * @scenario: scn_planctl_spec_submission_001
   * @covers: planctl/src/core/spec-submission.ts::submitSpec
   * @deterministic: yes
   * @invariant: a submission fixes line endings and vocabulary itself, returns every lint error at once, refuses a stale revision and a locked plan, and approval on the same bytes finds nothing new.
   */
  it("tst_unit_planctl_spec_submission_001 corrects, reports, refuses stale and locked, and leaves approval nothing new", async () => {
    const root = repository();
    try {
      const base = protocolSpecHash(readFileSync(join(root, PLAN), "utf8"));
      const draft = spec.replace("The current parser accepts empty names.", `The blueprint document names the parser. ${"word ".repeat(31)}ends.`).replace(/\n/g, "\r\n");
      const result = await submitSpec(root, { plan: PLAN, baseRevision: base, ownerRequest: "Reject empty names", spec: draft });
      expect(result.state).toBe("SPEC_DRAFT");
      expect(result.corrections).toEqual([{ line: expect.any(Number), before: expect.stringContaining("The blueprint document names the parser."), after: expect.stringContaining("The plan names the parser.") }]);
      expect(result.corrections[0]?.after).not.toContain("blueprint document");
      const saved = readFileSync(join(root, PLAN), "utf8");
      expect(saved).not.toContain("\r");
      expect(saved).toContain("The plan names the parser.");
      expect(result.revision).toBe(protocolSpecHash(saved));
      expect(result.findings.map((finding) => finding.rule)).toEqual(["sentence"]);
      const approval = await lint(saved, root);
      expect(approval.violations.map((finding) => `${finding.line}:${finding.text}`)).toEqual(result.findings.map((finding) => `${finding.line}:${finding.text}`));

      await expect(submitSpec(root, { plan: PLAN, baseRevision: base, ownerRequest: "Reject empty names", spec })).rejects.toThrow(/stale revision/);
      mutatePlanFile(root, PLAN, "lock-spec", (body) => lockPlanSpec(body.replace(`The plan names the parser. ${"word ".repeat(31)}ends.`, "The current parser accepts empty names."), "word"));
      const locked = protocolSpecHash(readFileSync(join(root, PLAN), "utf8"));
      await expect(submitSpec(root, { plan: PLAN, baseRevision: locked, ownerRequest: "Reject empty names", spec })).rejects.toThrow(/locked/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /**
   * @test-id: tst_unit_planctl_spec_submission_002
   * @scenario: scn_planctl_spec_submission_002
   * @covers: planctl/src/core/spec-submission.ts::submitSpec
   * @deterministic: yes
   * @invariant: a submission is judged by the deterministic lint alone: no model is called, its findings are the lint's, and unchanged text reports no_change without writing.
   */
  it("tst_unit_planctl_spec_submission_002 judges by the lint alone and reports no_change for unchanged text", async () => {
    const root = repository();
    try {
      const base = protocolSpecHash(readFileSync(join(root, PLAN), "utf8"));
      const checked = await submitSpec(root, { plan: PLAN, baseRevision: base, ownerRequest: "Reject empty names before saving", spec });
      expect(checked.checkStatus).toBe("checked");
      expect(checked.findings).toEqual((await lint(readFileSync(join(root, PLAN), "utf8"), root)).violations);
      const unchanged = await submitSpec(root, { plan: PLAN, baseRevision: checked.revision, ownerRequest: "Reject empty names before saving", spec });
      expect(unchanged.checkStatus).toBe("no_change");
      expect(unchanged.revision).toBe(checked.revision);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
