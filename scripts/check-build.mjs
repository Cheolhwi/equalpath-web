import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
