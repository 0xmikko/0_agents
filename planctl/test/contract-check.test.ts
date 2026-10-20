import { expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContractChanges } from "../src/core/contract-check";

/**
 * @test-id: tst_unit_planctl_contract_001
 * @scenario: scn_planctl_contract_shape_001
 * @covers: planctl/src/core/contract-check.ts::checkContractChanges
 * @deterministic: yes
 * @invariant: naming an interface does not authorize changed nullability, removal or an undeclared field.
 */
it("tst_unit_planctl_contract_001 compares actual fields with every flow's contract", async () => {
  const root = mkdtempSync(join(tmpdir(), "contract-check-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "feat/contracts"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    writeFileSync(join(root, "model.ts"), "export interface Result { value: string; count: number }\n");
    git("add", "."); git("commit", "-qm", "before");
    writeFileSync(join(root, "model.ts"), "export interface Result { value: string | null; count: number; invented: boolean }\n");
    git("add", "."); git("commit", "-qm", "after");
    const spec = "### First\n#### Interfaces\n```typescript\nexport interface Request { id: string }\n```\n"
      + "### Second\n#### Interfaces\n```typescript\nexport interface Result { value: string | null }\n```\n";
    const findings = await checkContractChanges(root, git("rev-parse", "HEAD"), spec);
    expect(findings.some(f => f.text.includes("invented"))).toBe(true);
    expect(findings.some(f => f.quote.includes("value"))).toBe(false);
    const wrong = spec.replace("value: string | null", "value: string");
    expect((await checkContractChanges(root, git("rev-parse", "HEAD"), wrong)).some(f => f.text.includes("value"))).toBe(true);
    writeFileSync(join(root, "model.ts"), "export interface Result { value: string | null; invented: boolean }\n");
    git("add", "."); git("commit", "-qm", "remove required field");
    expect((await checkContractChanges(root, git("rev-parse", "HEAD"), spec)).some(f => f.text.includes("count"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
