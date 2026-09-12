import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
export function sourceDigest(root) {
  const hash = createHash("sha256");
  const files = [];
  function collect(path) {
    const stat = lstatSync(resolve(root, path));
    if (stat.isSymbolicLink())
      throw new Error("Release source must not contain symlinks");
    if (stat.isDirectory()) {
      for (const name of readdirSync(resolve(root, path)).sort())
        collect(`${path}/${name}`);
    } else files.push(path);
  }
  for (const path of [
    ".github",
    "src",
    "public",
    "shared",
    "server",
    "scripts",
    "tests",
    "index.html",
    "vite.config.js",
    "package.json",
    "package-lock.json",
  ])
    collect(path);
  for (const file of files.sort()) {
    hash
      .update(file)
      .update("\0")
      .update(readFileSync(resolve(root, file)))
      .update("\0");
  }
  return hash.digest("hex");
}
