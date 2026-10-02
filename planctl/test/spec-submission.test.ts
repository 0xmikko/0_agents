import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
  for (const [path, text] of [["src/change.ts", "export const change = 1;\n"], ["src/save.ts", "export const save = 1;\n"], ["test/change.test.ts", "export {};\n"]] as const) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
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
   * @invariant: a submission preserves authored words, reports editorial advice without blocking, refuses stale and locked revisions, and approval on the same bytes finds nothing new.
   */
  it("tst_unit_planctl_spec_submission_001 preserves words, reports advice, and refuses stale and locked revisions", async () => {
    const root = repository();
    try {
      const base = protocolSpecHash(readFileSync(join(root, PLAN), "utf8"));
      const draft = spec.replace("The current parser accepts empty names.", `The blueprint document names the parser. ${"word ".repeat(31)}ends.`).replace(/\n/g, "\r\n");
      const result = await submitSpec(root, { plan: PLAN, baseRevision: base, ownerRequest: "Reject empty names", spec: draft });
      expect(result.state).toBe("SPEC_DRAFT");
      expect(result.corrections).toEqual([]);
      const saved = readFileSync(join(root, PLAN), "utf8");
      expect(saved).not.toContain("\r");
      expect(saved.split("<!-- plan:spec:start -->")[1]?.split("<!-- plan:spec:end -->")[0]?.trim()).toBe(draft.replace(/\r\n/g, "\n").trim());
      expect(result.revision).toBe(protocolSpecHash(saved));
      expect(result.findings.map((finding) => finding.rule)).toEqual(["vocabulary", "sentence"]);
      expect(result.findings.every((finding) => !finding.blocking)).toBe(true);
      const approval = await lint(saved, root);
      expect(approval.violations.map((finding) => `${finding.line}:${finding.text}`)).toEqual(result.findings.map((finding) => `${finding.line}:${finding.text}`));

      await expect(submitSpec(root, { plan: PLAN, baseRevision: base, ownerRequest: "Reject empty names", spec })).rejects.toThrow(/stale revision/);
      mutatePlanFile(root, PLAN, "lock-spec", (body) => lockPlanSpec(body, "word"));
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
      // A SPEC in another language is refused before anything is written: nothing to save, nothing to publish.
      const before = readFileSync(join(root, PLAN), "utf8");
      await expect(submitSpec(root, { plan: PLAN, baseRevision: checked.revision, ownerRequest: "x", spec: spec.replace("Ship one observable result.", "Отгрузить один наблюдаемый результат.") })).rejects.toThrow("the plan is written in English");
      expect(readFileSync(join(root, PLAN), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
