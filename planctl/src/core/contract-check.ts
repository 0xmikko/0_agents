import { spawnSync } from "node:child_process";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { Content, Root } from "mdast";
import ts from "typescript";
import type { GateViolation } from "./plan-gate";
import { contractChangePaths, repositoryEnvironment } from "./plan-update";

function nodes(node: Root | Content): (Root | Content)[] {
  return [node, ...("children" in node ? node.children.flatMap(nodes) : [])];
}

function declarations(text: string, path: string, exportedOnly: boolean) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const printer = ts.createPrinter({ removeComments: true });
  const normalized = (node: ts.Node): string => {
    const transformed = ts.transform(node, [context => root => {
      const visit = (child: ts.Node): ts.Node => {
        const current = ts.visitEachChild(child, visit, context);
        if (ts.isStringLiteral(current)) return ts.factory.createStringLiteral(current.text);
        if (ts.isPropertySignature(current)) return ts.factory.updatePropertySignature(current,
          current.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ReadonlyKeyword),
          current.name, current.questionToken, current.type);
        return current;
      };
      return visit(root);
    }]);
    try {
      const current = transformed.transformed[0];
      if (current === undefined) throw new Error(`cannot normalize contract in ${path}`);
      return printer.printNode(ts.EmitHint.Unspecified, current, source).replace(/\s+/g, " ").trim();
    } finally { transformed.dispose(); }
  };
  const localExports = new Set(source.statements.flatMap(s => ts.isExportDeclaration(s) && !s.moduleSpecifier && s.exportClause && ts.isNamedExports(s.exportClause)
    ? s.exportClause.elements.map(e => (e.propertyName ?? e.name).text) : []));
  const localTypes = new Map(source.statements.flatMap(s => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s) ? [[s.name.text, s] as const] : []));
  const result = new Map<string, { text: string; members: ReadonlyMap<string, string> | null; inferred: boolean; callable: boolean; dependencies: ReadonlyMap<string, string> }>();
  for (const statement of source.statements) {
    if ((!ts.isInterfaceDeclaration(statement) && !ts.isTypeAliasDeclaration(statement) && !ts.isFunctionDeclaration(statement)) || !statement.name) continue;
    if (exportedOnly && !localExports.has(statement.name.text) && !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const members = ts.isInterfaceDeclaration(statement) ? statement.members : ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type) ? statement.type.members : null;
    const fields = members === null && !ts.isFunctionDeclaration(statement) ? null : new Map<string, string>();
    if (ts.isFunctionDeclaration(statement) && fields !== null) {
      statement.parameters.forEach((p, index) => fields.set(`<argument:${index}>`,
        `${p.dotDotDotToken ? "..." : ""}${p.questionToken || p.initializer ? "optional " : ""}${p.type ? normalized(p.type) : "inferred"}`));
      fields.set("<return>", statement.type ? normalized(statement.type) : "inferred");
      if (statement.typeParameters) fields.set("<parameters>", statement.typeParameters.map(normalized).join(","));
    }
    if (members !== null && fields !== null) {
      for (const m of members) {
        const name = m.name === undefined ? normalized(m) : m.name.getText(source).replace(/^['"]|['"]$/g, "");
        fields.set(name, [fields.get(name), normalized(m)].filter(Boolean).join(" "));
      }
      if (ts.isInterfaceDeclaration(statement) && statement.heritageClauses) fields.set("<extends>", statement.heritageClauses.map(normalized).join(" "));
      if (statement.typeParameters) fields.set("<parameters>", statement.typeParameters.map(normalized).join(","));
    }
    let inferred = false;
    const dependencies = new Map<string, string>();
    const strip = (s: string) => s.replace(/^(?:(?:export|default|declare)\s+)+/, "");
    const visit = (node: ts.Node): void => {
      if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
        const name = node.typeName.text;
        const local = localTypes.get(name);
        if (local && name !== statement.name?.text && !dependencies.has(name)) {
          dependencies.set(name, strip(normalized(local)));
          visit(local);
        }
      }
      if (ts.isTypeQueryNode(node) && ts.isIdentifier(node.exprName)) {
        const name = node.exprName.text;
        inferred = true;
        for (const s of source.statements) if (ts.isVariableStatement(s)) {
          for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) dependencies.set(name, normalized(d.initializer));
        }
      }
      ts.forEachChild(node, visit);
    };
    const signature = ts.isFunctionDeclaration(statement) ? ts.factory.updateFunctionDeclaration(statement,
      statement.modifiers, statement.asteriskToken, statement.name, statement.typeParameters, statement.parameters, statement.type, undefined) : statement;
    visit(signature);
    const text = strip(normalized(signature));
    const previous = result.get(statement.name.text);
    result.set(statement.name.text, { text: previous && ts.isFunctionDeclaration(statement) ? `${previous.text}\n${text}` : text,
      members: fields, inferred, callable: ts.isFunctionDeclaration(statement), dependencies });
  }
  return result;
}

/**
 * @tested-by: tst_unit_planctl_contract_001
 * @invariant: compare changed members, not just names; unchanged moves and copies
 * reuse identical declarations. Missing definitions remain advice, never a
 * claim of approval; positively established contract conflicts still block.
 */
export async function checkContractChanges(root: string, commit: string, body: string, base = `${commit}^1`): Promise<readonly GateViolation[]> {
  const run = (...args: string[]) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", env: repositoryEnvironment() });
  const read = (ref: string, path: string): string => {
    const r = run("show", `${ref}:${path}`);
    return r.status === 0 ? r.stdout : "";
  };
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
  const add = (path: string, name: string, detail: string, quote: string, blocking = true): void => {
    if (findings.some(f => f.text.startsWith(`${path}: ${name} ${detail}.`))) return;
    findings.push({ kind: "protocol-shape", rule: "typescript", blocking, line: 1, quote,
      text: `${path}: ${name} ${detail}. Compare the actual declaration with the approved flow; correct an accidental mismatch autonomously.`, replacement: null });
  };
  const changes = contractChangePaths(root, base, commit);
  const currentExports = changes.flatMap(({ path }) => [...declarations(read(commit, path), path, true)]);
  for (const { path, previousPath: oldPath } of changes) {
    const before = declarations(read(base, oldPath), oldPath, true);
    const previousDeclarations = declarations(read(base, oldPath), oldPath, false);
    const after = declarations(read(commit, path), path, true);
    const currentDeclarations = declarations(read(commit, path), path, false);
    const compare = (name: string, was: ReturnType<typeof declarations> extends Map<string, infer T> ? T | undefined : never,
      now: ReturnType<typeof declarations> extends Map<string, infer T> ? T : never): void => {
      if (was?.text === now.text) return;
      // Positional argument names are implementation details; their types,
      // optionality and order remain part of the compared signature.
      if (now.callable && was?.members && now.members
        && JSON.stringify([...was.members]) === JSON.stringify([...now.members])) return;
      if (now.callable && was === undefined) return;
      const contract = approved.get(name);
      if (contract === undefined) { add(path, name, "is not listed in SPEC; record the implementation change without reopening approval", now.text, false); return; }
      // A complete final declaration already authorizes its field list and
      // parameters; it does not also need prose enumerating removed old fields.
      if (now.text === contract.text) return;
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
    };
    for (const name of new Set([...before.keys(), ...after.keys()])) {
      const was = before.get(name);
      const now = after.get(name);
      if (was?.text === now?.text && JSON.stringify([...(was?.dependencies ?? [])]) === JSON.stringify([...(now?.dependencies ?? [])])) continue;
      if (now === undefined) {
        if (was && currentExports.some(([candidate, declaration]) => candidate === name && declaration.text === was.text
          && JSON.stringify([...declaration.dependencies]) === JSON.stringify([...was.dependencies]))) continue;
        const rename = new RegExp(`\\brename[sd]?\\s+\`?${name}\`?\\s+to\\s+\`?([A-Za-z][A-Za-z0-9]*)`, "i").exec(spec)?.[1];
        if (rename && approved.has(rename) && after.has(rename)) continue;
        if (!new RegExp(`\\b(?:remove|delete|retire)[sd]?\\s+(?:the\\s+)?\`?${name}\\b`, "i").test(spec)) {
          const declared = approved.has(name);
          add(path, name, declared ? "was removed without an approved removal" : "was removed or moved; record its destination or reason", was?.text ?? name, declared);
        }
        continue;
      }
      for (const [dependency, actual] of now.dependencies) {
        if (was?.dependencies.get(dependency) === actual || previousDeclarations.get(dependency)?.text === actual) continue;
        const declaration = currentDeclarations.get(dependency);
        if (declaration) compare(dependency, previousDeclarations.get(dependency), declaration);
        else if (approved.get(dependency)?.text !== actual) add(path, name, `depends on changed ${dependency} without its approved definition`, actual);
      }
      compare(name, was, now);
    }
    // Changed re-exports require their canonical declarations; never silently treat them as checked.
    const exports = (text: string) => ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true).statements
      .filter(s => ts.isExportDeclaration(s) && s.moduleSpecifier).map(s => s.getText()).join("\n");
    const oldExports = exports(read(base, oldPath));
    const newExports = exports(read(commit, path));
    if (oldExports !== newExports) add(path, "re-export", "needs canonical source verification", newExports || oldExports, false);
  }
  return findings;
}
