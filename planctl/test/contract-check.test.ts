import { expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContractChanges } from "../src/core/contract-check";
import { undeclaredExportedTypes } from "../src/core/plan-gate";

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

/**
 * @test-id: tst_unit_planctl_contract_002
 * @scenario: scn_planctl_contract_reuse_001
 * @covers: planctl/src/core/contract-check.ts::checkContractChanges
 * @deterministic: yes
 * @invariant: copying an unchanged declaration and an explicitly approved rename
 * do not invent a new contract; omitting the rename still produces a finding.
 */
it("tst_unit_planctl_contract_002 recognizes copied contracts and approved aliases", async () => {
  const root = mkdtempSync(join(tmpdir(), "contract-reuse-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "feat/contracts"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    const original = "export type Envelope = { value: string };\n";
    writeFileSync(join(root, "model.ts"), original);
    git("add", "."); git("commit", "-qm", "original contract");
    writeFileSync(join(root, "generated.ts"), original);
    git("add", "."); git("commit", "-qm", "unchanged generated copy");
    expect(await checkContractChanges(root, git("rev-parse", "HEAD"), "No contracts change.")).toEqual([]);
    expect(await undeclaredExportedTypes(root, git("rev-parse", "HEAD"), "No contracts change.")).toEqual([]);
    writeFileSync(join(root, "model.ts"), "export type Message = { value: string };\nexport type Mode = 'open' | 'closed';\n");
    git("add", "."); git("commit", "-qm", "renamed contract and union");
    const spec = "Rename `Envelope` to `Message`.\n```typescript\ntype Message = { value: string };\ntype Mode = 'open' | 'closed';\n```";
    expect(await checkContractChanges(root, git("rev-parse", "HEAD"), spec)).toEqual([]);
    expect((await checkContractChanges(root, git("rev-parse", "HEAD"), spec.replace("Rename `Envelope` to `Message`.", "")))
      .some(f => f.text.includes("removed without"))).toBe(true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

/** @test-id: tst_unit_planctl_contract_003
 * @scenario: scn_planctl_indirect_contract_001
 * @covers: planctl/src/core/contract-check.ts::checkContractChanges
 * @deterministic: yes
 * @invariant: changing a public argument or its local alias is a contract change.
 */
it("tst_unit_planctl_contract_003 detects changed public arguments and local dependencies", async () => {
  const root = mkdtempSync(join(tmpdir(), "contract-indirect-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    const before = "type Value = string;\nexport interface Result { value: Value }\nexport function save(value: string): void { void value; }\n";
    writeFileSync(join(root, "model.ts"), before);
    git("add", "."); git("commit", "-qm", "before");
    writeFileSync(join(root, "model.ts"), before.replace("Value = string", "Value = number").replace("save(value: string)", "save(value: number)"));
    git("add", "."); git("commit", "-qm", "after");
    const findings = await checkContractChanges(root, git("rev-parse", "HEAD"), "No contracts change.");
    expect(findings.some(f => f.text.includes("Result"))).toBe(true);
    expect(findings.some(f => f.text.includes("save"))).toBe(true);
    const spec = "```typescript\ntype Value = number;\ninterface Result { value: Value }\ndeclare function save(value: number): void;\n```";
    expect(await checkContractChanges(root, git("rev-parse", "HEAD"), spec)).toEqual([]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
