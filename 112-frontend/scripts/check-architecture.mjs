import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("src");
const layers = ["shared", "entities", "features", "widgets", "pages", "app"];
const decompositionLimits = new Map([
  ["features/card-authoring/model/useCardEditor.ts", 300],
  ["features/card-generation/ui/CardGenerationDialog.tsx", 120],
]);
const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
const errors = [];
const relative = (file) => path.relative(root, file).split(path.sep);
const identity = (file) => {
  const [layer, slice] = relative(file);
  return { layer, slice, level: layers.indexOf(layer) };
};
const resolve = (specifier, file) => {
  const base = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(file), specifier)
      : undefined;
  if (!base) return;
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ].find(
    (candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
  );
};
for (const file of files(root)) {
  const parts = relative(file);
  const label = parts.join("/");
  const fail = (message) => errors.push(`${label}: ${message}`);
  const maxLines = decompositionLimits.get(label);
  if (
    maxLines &&
    fs.readFileSync(file, "utf8").split(/\r?\n/).length > maxLines
  )
    fail(`exceeds ${maxLines} lines; split the responsibility first`);
  if (label === "entities/training/types/types.ts")
    fail("use a domain-specific type file instead of a generic types.ts");
  if (file.endsWith(".scss") && !parts.includes("styles"))
    fail("SCSS must be in a styles segment");
  if (!/\.tsx?$/.test(file) || /\.d\.ts$/.test(file)) continue;
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const test = /\.(test|spec)\./.test(file);
  const from = identity(file);
  for (const node of source.statements) {
    if (
      !test &&
      (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
      !parts.includes("types")
    )
      fail("named contracts must be in a types segment");
    if (
      parts.includes("types") &&
      ![
        ts.SyntaxKind.ImportDeclaration,
        ts.SyntaxKind.ExportDeclaration,
        ts.SyntaxKind.InterfaceDeclaration,
        ts.SyntaxKind.TypeAliasDeclaration,
        ts.SyntaxKind.EmptyStatement,
      ].includes(node.kind)
    )
      fail("types segments must not contain runtime values");
  }
  const visit = (node) => {
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined;
    if (!test && specifier && ts.isStringLiteral(specifier)) {
      const target = resolve(specifier.text, file);
      if (target) {
        const to = identity(target);
        const same = from.layer === to.layer && from.slice === to.slice;
        if (from.level >= 0 && to.level >= 0 && from.level < to.level)
          fail(`upward dependency: ${specifier.text}`);
        if (
          from.level > 0 &&
          from.layer !== "app" &&
          from.layer === to.layer &&
          !same
        )
          fail(`cross-slice dependency: ${specifier.text}`);
        if (
          !same &&
          to.level > 0 &&
          to.layer !== "app" &&
          relative(target).length > 2 &&
          !(
            relative(target).length === 3 &&
            /^index\.tsx?$/.test(path.basename(target))
          )
        )
          fail(`use the slice public API: ${specifier.text}`);
      }
    }
    if (
      !test &&
      ts.isJsxAttribute(node) &&
      ["sx", "style"].includes(node.name.getText(source)) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    ) {
      let expression = node.initializer.expression;
      if (expression && ts.isAsExpression(expression))
        expression = expression.expression;
      if (expression && ts.isObjectLiteralExpression(expression))
        fail("move inline style objects to a styles segment");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log("FSD: layers, public APIs, types and styles verified.");
}
