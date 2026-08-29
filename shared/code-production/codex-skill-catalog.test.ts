import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "bun:test";

const codexSkillsDirectory = resolve(import.meta.dir, "../../codex/skills");
const repositoryRoot = resolve(import.meta.dir, "../..");
const productionEntrypoints = ["blueprint", "blueprint-start", "end-work"] as const;
const repoScopedProcessSkills = [
  "plan",
  "review-implementation",
  "review-plan",
  "spec",
  "start-work",
] as const;

function installedSkillNames(): ReadonlySet<string> {
  return new Set(readdirSync(codexSkillsDirectory));
}

describe("Codex user-scope skill catalog", () => {
  /**
   * @test-id: tst_agent_skill_catalog_001
   * @scenario: scn_codex_skill_discovery_001
   * @covers: codex/skills
   * @deterministic: yes
   * @fixtures: repository-managed Codex skill catalog
   *
   * Test environment: local filesystem catalog
   * Clients: direct filesystem inspection
   * Mocks: none
   * Data: production entrypoints and legacy repo-scoped process names
   */
  test("tst_agent_skill_catalog_001 exposes three production entrypoints without repo-scope aliases", () => {
    const installed = installedSkillNames();
    const missingEntrypoints = productionEntrypoints.filter((name) => !installed.has(name));
    const duplicateCandidates = repoScopedProcessSkills.filter((name) => installed.has(name));

    expect(missingEntrypoints).toEqual([]);
    expect(duplicateCandidates).toEqual([]);
  });

  /**
   * @test-id: tst_agent_skill_catalog_002
   * @scenario: scn_codex_skill_discovery_002
   * @covers: codex/skills, shared/code-production/laws/plan-format.md
   * @deterministic: yes
   * @fixtures: repository-managed Codex skill catalog and portable plan law
   *
   * Test environment: local filesystem catalog
   * Clients: direct contract inspection
   * Mocks: none
   * Data: retired slash-command names
   */
  test("tst_agent_skill_catalog_002 published contracts never route into retired process aliases", () => {
    const retiredInvocation = /\/(?:plan|review-implementation|review-plan|spec|start-work)(?=[\s`'"),.;:]|$)/g;
    const contracts = readdirSync(codexSkillsDirectory).map((skillName) => (
      join(codexSkillsDirectory, skillName, "SKILL.md")
    ));
    contracts.push(join(import.meta.dir, "laws", "plan-format.md"));

    const staleReferences = contracts.flatMap((contract) => {
      const matches = readFileSync(contract, "utf8").match(retiredInvocation) ?? [];
      return matches.map((match) => `${contract.replace(`${repositoryRoot}/`, "")}: ${match}`);
    });

    expect(staleReferences).toEqual([]);
  });

  /**
   * @test-id: tst_agent_skill_catalog_003
   * @scenario: scn_codex_skill_discovery_003
   * @covers: lib/sync-codex-skills.sh
   * @deterministic: yes
   * @fixtures: temporary source and installed skill catalogs
   *
   * Test environment: temporary local filesystem catalogs
   * Clients: shell CLI
   * Mocks: none
   * Data: canonical, retired, and operator-owned skill links
   */
  test("tst_agent_skill_catalog_003 sync removes retired managed links and preserves operator skills", () => {
    const root = mkdtempSync(join(tmpdir(), "codex-skill-sync-"));
    const source = join(root, "source");
    const installed = join(root, "installed");
    const operatorSkill = join(root, "operator-skill");

    try {
      mkdirSync(source);
      mkdirSync(installed);
      mkdirSync(operatorSkill);
      writeFileSync(join(operatorSkill, "SKILL.md"), "---\nname: operator-skill\n---\n");
      mkdirSync(join(source, "operator-skill"));
      writeFileSync(
        join(source, "operator-skill", "SKILL.md"),
        "---\nname: repository-operator-skill\n---\n",
      );

      for (const skillName of productionEntrypoints) {
        const skillSource = join(source, skillName);
        mkdirSync(skillSource);
        writeFileSync(join(skillSource, "SKILL.md"), `---\nname: ${skillName}\n---\n`);
      }
      for (const skillName of repoScopedProcessSkills) {
        symlinkSync(join(source, skillName), join(installed, skillName));
      }
      symlinkSync(operatorSkill, join(installed, "operator-skill"));

      const result = spawnSync(
        "bash",
        [join(repositoryRoot, "lib", "sync-codex-skills.sh"), source, installed],
        { encoding: "utf8" },
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      for (const skillName of repoScopedProcessSkills) {
        expect(() => readlinkSync(join(installed, skillName))).toThrow();
      }
      for (const skillName of productionEntrypoints) {
        expect(readlinkSync(join(installed, skillName))).toBe(join(source, skillName));
      }
      expect(readlinkSync(join(installed, "operator-skill"))).toBe(operatorSkill);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
