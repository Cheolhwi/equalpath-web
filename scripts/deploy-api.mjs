import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
const root = resolve(import.meta.dirname, ".."),
  backend = resolve(root, "../appwrite-backend"),
  cli = resolve(backend, "node_modules/.bin/appwrite"),
  id = "web-provider-query";
function run(args, missing = false) {
  const r = spawnSync(cli, [...args, "--json"], {
    cwd: backend,
    encoding: "utf8",
    maxBuffer: 4000000,
    timeout: 90000,
  });
  if (r.status !== 0) {
    if (
      missing &&
      /not found|could not be found|not exist/i.test(r.stdout + r.stderr)
    )
      return null;
    throw Error(`Appwrite ${args[0]}/${args[1]} failed; raw output withheld`);
  }
  return JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
}
const path = resolve(root, ".build/function");
mkdirSync(path, { recursive: true });
for (const d of ["server", "shared"])
  mkdirSync(resolve(path, d), { recursive: true });
mkdirSync(resolve(path, "server/data"), { recursive: true });
for (const f of [
  "server/api.mjs",
  "server/function.mjs",
  "server/geography.mjs",
  "server/fixtures.mjs",
  "server/providers.mjs",
  "server/appwrite-store.mjs",
  "shared/request.mjs",
  "shared/conditions.mjs",
  "server/data/service-boundaries.json",
  "server/data/provenance-index.json",
  "server/data/boundary-source.json",
])
  cpSync(resolve(root, f), resolve(path, f));
writeFileSync(
  resolve(path, "package.json"),
  JSON.stringify({
    name: "equalpath-web-provider-query",
    version: "1.0.0",
    private: true,
    type: "module",
  }),
);
if (!process.argv.includes("--deploy")) {
  console.log(
    JSON.stringify({
      mode: "dry_run",
      function: id,
      runtime: "node-22",
      execute: ["any"],
      scopes: [],
      logging: false,
      package: path,
    }),
  );
  process.exit(0);
}
const existing = run(["functions", "get", "--function-id", id], true);
if (!existing)
  run([
    "functions",
    "create",
    "--function-id",
    id,
    "--name",
    "EqualPath Web — public discovery",
    "--runtime",
    "node-22",
    "--execute",
    "any",
    "--timeout",
    "120",
    "--enabled=true",
    "--logging=false",
    "--entrypoint",
    "server/function.mjs",
    "--commands",
    "node --version",
  ]);
else if (
  existing.runtime !== "node-22" ||
  JSON.stringify(existing.execute) !== JSON.stringify(["any"])
)
  throw Error("Existing new-web function differs; refusing to repurpose it");
const deployment = run([
  "functions",
  "create-deployment",
  "--function-id",
  id,
  "--entrypoint",
  "server/function.mjs",
  "--commands",
  "node --version",
  "--code",
  path,
  "--activate=true",
]);
const receipt = {
  created_at: new Date().toISOString(),
  function: id,
  deployment: deployment.$id,
  status: deployment.status,
  execute: ["any"],
  scopes: [],
  logging: false,
  owner_resources_accessed: false,
  production_domains_changed: false,
};
writeFileSync(
  resolve(root, "evidence/api-deployment.json"),
  JSON.stringify(receipt, null, 2),
);
console.log(JSON.stringify(receipt));
