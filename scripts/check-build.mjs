import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { sourceDigest } from "./source-digest.mjs";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "dist/index.html"), "utf8");
const assets = [...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map(
  (match) => match[1],
);
assert(
  assets.some((asset) => asset.endsWith(".js")),
  "Missing production JavaScript",
);
assert(
  assets.some((asset) => asset.endsWith(".css")),
  "Missing production CSS",
);
for (const asset of assets) {
  assert(
    existsSync(resolve(root, `dist${asset}`)),
    `Missing output asset: ${asset}`,
  );
}
const client = assets
  .filter((asset) => asset.endsWith(".js"))
  .map((asset) => readFileSync(resolve(root, `dist${asset}`), "utf8"))
  .join("\n");
assert(
  client.includes(
    "https://sgp.cloud.appwrite.io/v1/functions/web-provider-query/executions",
  ),
  "Production must use the deployed public Appwrite query",
);
assert(
  !existsSync(resolve(root, "dist/.env")),
  "Environment file must not be published",
);
assert(
  !existsSync(resolve(root, "dist/server")),
  "Server source must not be published as static content",
);
const sceneChunks = readdirSync(resolve(root, "dist/assets")).filter((name) =>
  /^CareScene-.*\.js$/.test(name),
);
assert.equal(sceneChunks.length, 1, "Missing separately loaded 3D scene");
assert(
  client.includes(sceneChunks[0]),
  "The landing must reference its scene chunk",
);
for (const model of ["archive-cassette.glb", "archive-assembly.glb"]) {
  const bytes = readFileSync(resolve(root, `dist/assets/${model}`));
  assert.equal(
    bytes.subarray(0, 4).toString(),
    "glTF",
    `Invalid model: ${model}`,
  );
}
assert(
  existsSync(resolve(root, "dist/images/childcare-book-cover.png")),
  "Missing childcare picture-book texture",
);
const source = sourceDigest(root);
writeFileSync(
  resolve(root, "dist/build-info.json"),
  JSON.stringify(
    { source, builtAt: new Date().toISOString(), assets },
    null,
    2,
  ),
);
console.log(`Validated ${assets.length} entry assets for source ${source}`);
