import { spawnSync } from "node:child_process";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Content, Root } from "mdast";
import ts from "typescript";
import type { GateViolation } from "./plan-gate";
import { repositoryEnvironment } from "./plan-update";

function nodes(node: Root | Content): (Root | Content)[] {
  return [node, ...("children" in node ? node.children.flatMap(nodes) : [])];
}

function declarations(text: string, path: string, exportedOnly: boolean) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  const normalized = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, source).replace(/\s+/g, " ").trim();
  const localExports = new Set(source.statements.flatMap(s => ts.isExportDeclaration(s) && !s.moduleSpecifier && s.exportClause && ts.isNamedExports(s.exportClause)
    ? s.exportClause.elements.map(e => (e.propertyName ?? e.name).text) : []));
  const result = new Map<string, { text: string; members: ReadonlyMap<string, string> | null; inferred: boolean }>();
  for (const statement of source.statements) {
    if (!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement)) continue;
    if (exportedOnly && !localExports.has(statement.name.text) && !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const members = ts.isInterfaceDeclaration(statement) ? statement.members : ts.isTypeLiteralNode(statement.type) ? statement.type.members : null;
    const fields = members === null ? null : new Map<string, string>();
    if (members !== null && fields !== null) {
      for (const m of members) {
        const name = m.name === undefined ? normalized(m) : m.name.getText(source).replace(/^['"]|['"]$/g, "");
        fields.set(name, [fields.get(name), normalized(m)].filter(Boolean).join(" "));
      }
      if (ts.isInterfaceDeclaration(statement) && statement.heritageClauses) fields.set("<extends>", statement.heritageClauses.map(normalized).join(" "));
      if (statement.typeParameters) fields.set("<parameters>", statement.typeParameters.map(normalized).join(","));
    }
    let inferred = false;
    const dependencies: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName)) {
        const name = node.exprName.text;
        inferred = true;
        for (const s of source.statements) if (ts.isVariableStatement(s)) {
          for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) dependencies.push(normalized(d.initializer));
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(statement);
    result.set(statement.name.text, { text: normalized(statement).replace(/^export (?:default )?/, "") + dependencies.join("\n"), members: fields, inferred });
  }
  return result;
}

/**
 * @tested-by: tst_unit_planctl_contract_001
 * @invariant: compare changed members, not just names; unchanged moves and copies
 * reuse identical declarations. Unknown inferred contracts are never a pass.
 */
export async function checkContractChanges(root: string, commit: string, body: string, base = `${commit}^1`): Promise<readonly GateViolation[]> {
  const run = (...args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: repositoryEnvironment() });
  const read = (ref: string, path: string): string => {
    const r = run("show", `${ref}:${path}`);
    return r.status === 0 ? r.stdout : "";
  };
  const diff = run("diff", "--name-status", "-z", "--find-renames", "--find-copies-harder", base, commit, "--", "*.ts", "*.tsx");
  if (diff.status !== 0) throw new Error("Cannot establish the contract diff base");
  const approved = new Map<string, ReturnType<typeof declarations> extends Map<string, infer T> ? T : never>();
  const spec = body.includes("<!-- plan:spec:start -->")
    ? body.split("<!-- plan:spec:start -->")[1]?.split("<!-- plan:spec:end -->")[0] ?? "" : body;
  for (const node of nodes(fromMarkdown(spec))) {
    if (node.type === "code" && ["ts", "typescript", "tsx"].includes(node.lang ?? "")) {
      for (const [name, declaration] of declarations(node.value, "spec.ts", false)) {
        const previous = approved.get(name);
        if (previous?.members && declaration.members) {
          approved.set(name, { ...declaration, members: new Map([...previous.members, ...declaration.members]) });
        } else approved.set(name, declaration);
      }
    }
  }
  const findings: GateViolation[] = [];
  const add = (path: string, name: string, detail: string, quote: string): void => {
    findings.push({ kind: "protocol-shape", rule: "typescript", blocking: true, line: 1, quote,
      text: `${path}: ${name} ${detail}. Compare the actual declaration with the approved flow; correct an accidental mismatch autonomously.`, replacement: null });
  };
  const fields = diff.stdout.split("\0").filter(Boolean);
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    const oldPath = fields[index++];
    if (!status || !oldPath) break;
    const path = status.startsWith("R") || status.startsWith("C") ? fields[index++] : oldPath;
    if (!path) throw new Error("Incomplete Git contract diff");
    const before = declarations(read(base, oldPath), oldPath, true);
    const after = declarations(read(commit, path), path, true);
    for (const name of new Set([...before.keys(), ...after.keys()])) {
      const was = before.get(name);
      const now = after.get(name);
      if (was?.text === now?.text) continue;
      const contract = approved.get(name);
      if (now === undefined) {
        const rename = new RegExp(`\\brename[sd]?\\s+\`?${name}\`?\\s+to\\s+\`?([A-Za-z][A-Za-z0-9]*)`, "i").exec(spec)?.[1];
        if (rename && approved.has(rename) && after.has(rename)) continue;
        if (!new RegExp(`\\b(?:remove|delete|retire)[sd]?\\s+(?:the\\s+)?\`?${name}\\b`, "i").test(spec)) add(path, name, "was removed without an approved removal", was?.text ?? name);
        continue;
      }
      if (contract === undefined) { add(path, name, "has no approved contract", now.text); continue; }
      if (now.members !== null && contract.members !== null) {
        for (const key of new Set([...(was?.members?.keys() ?? []), ...now.members.keys()])) {
          if (was?.members?.get(key) === now.members.get(key)) continue;
          const actual = now.members.get(key);
          if (actual === undefined) {
            if (!new RegExp(`\\b(?:remove|delete|retire)[sd]?\\s+\`?${name}\\.${key}\\b`, "i").test(spec)) add(path, name, `removes ${key} without an approved removal`, was?.members?.get(key) ?? key);
          } else if (contract.members.get(key) !== actual) {
            add(path, name, `changes ${key} beyond its approved shape`, actual);
          }
        }
      } else if (now.text !== contract.text) {
        add(path, name, now.inferred ? "needs resolved schema evidence for its inferred contract" : "differs from its approved alias or variants", now.text);
      }
    }
    // Changed re-exports require their canonical declarations; never silently treat them as checked.
    const exports = (text: string) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true).statements
      .filter(s => ts.isExportDeclaration(s) && s.moduleSpecifier).map(s => s.getText()).join("\n");
    const oldExports = exports(read(base, oldPath));
    const newExports = exports(read(commit, path));
    if (oldExports !== newExports) add(path, "re-export", "needs canonical source verification", newExports || oldExports);
  }
  return findings;
}
