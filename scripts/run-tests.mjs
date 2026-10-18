// The project's test runner. There is no vitest or jest here: every test file under a __tests__
// folder is a plain Node script that asserts with node:assert and prints one "ok - <name>" line
// per passing case, which is the convention the existing tests already follow. This file finds
// them, runs each in its own process, and fails the whole run if any file fails.
//
// Node 22 executes the TypeScript directly (--experimental-strip-types). That works here because
// tsconfig.app.json sets erasableSyntaxOnly, which guarantees no enums, namespaces or parameter
// properties, the only TS features stripping cannot handle. So tests need no build step and no
// tsx install.
//
//   npm test                     run everything
//   npm test -- payPortal        run only files whose path contains "payPortal"
import { readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOADER = "./src/lib/__tests__/stubSupabaseClientLoader.mjs";
const SEARCH_ROOTS = ["src", "supabase/functions"];
const filter = process.argv[2] ?? "";

function findTests(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) findTests(full, found);
    else if (entry.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

const files = SEARCH_ROOTS.flatMap((r) => findTests(join(ROOT, r)))
  .map((f) => relative(ROOT, f).split("\\").join("/"))
  .filter((f) => f.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(filter ? `No test files match "${filter}".` : "No test files found.");
  process.exit(1);
}

let passedFiles = 0;
let passedCases = 0;
const failures = [];

for (const file of files) {
  const run = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--experimental-loader", LOADER, file],
    { cwd: ROOT, encoding: "utf8" },
  );
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const cases = (output.match(/^ok - /gm) ?? []).length;
  passedCases += cases;
  if (run.status === 0) {
    passedFiles++;
    console.log(`PASS  ${file}  (${cases} case${cases === 1 ? "" : "s"})`);
  } else {
    failures.push({ file, output });
    console.log(`FAIL  ${file}  (${cases} case${cases === 1 ? "" : "s"} passed before the failure)`);
  }
}

if (failures.length > 0) {
  console.log("");
  for (const { file, output } of failures) {
    console.log(`----- ${file} -----`);
    // The whole output would bury the summary, and the useful part is the failing assertion.
    const lines = output.split("\n").filter((l) => !l.startsWith("ok - "));
    console.log(lines.slice(0, 14).join("\n").trimEnd());
    console.log("");
  }
}

console.log(`${passedFiles}/${files.length} file(s) passed, ${passedCases} case(s) passed.`);
process.exit(failures.length > 0 ? 1 : 0);
