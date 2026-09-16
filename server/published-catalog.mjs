import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { ServiceError } from "./appwrite-store.mjs";

export const snapshotSchema = "equalpath-published-catalog-v1";
const dataURL = new URL("./data/catalog-snapshot.json.gz", import.meta.url);
const metadataURL = new URL("./data/catalog-snapshot.meta.json", import.meta.url);

export function decodeCatalogSnapshot(compressed, metadata) {
  try {
    if (metadata.schema !== snapshotSchema || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw Error();
    const bytes = gunzipSync(compressed, { maxOutputLength: 80 * 1024 * 1024 });
    if (bytes.length !== metadata.bytes || createHash("sha256").update(bytes).digest("hex") !== metadata.sha256) throw Error();
    const catalog = JSON.parse(bytes);
    if (!Array.isArray(catalog.items) || !Array.isArray(catalog.held) || !Array.isArray(catalog.shortCareIds) ||
        catalog.release !== metadata.release || catalog.version !== metadata.version || catalog.shortCareReady !== true ||
        catalog.items.length !== metadata.providers || catalog.held.length !== metadata.held ||
        catalog.shortCareIds.length !== metadata.shortCareProviders || !catalog.items.length) throw Error();
    const ids = new Set(catalog.items.map(p => p.id));
    if (ids.size !== catalog.items.length || catalog.items.some(p => typeof p.id !== "string" || !p.id || p.mode !== "live" || p.version !== catalog.version) ||
        new Set(catalog.shortCareIds).size !== catalog.shortCareIds.length || catalog.shortCareIds.some(id => !ids.has(id))) throw Error();
    return catalog;
  } catch {
    throw new ServiceError("SOURCE_INVALID");
  }
}

// Public directory data is published together with the Function. Cold starts,
// health checks and user searches never read TablesDB or refresh a manifest.
export function createPublishedStore({ loadFiles = () => Promise.all([readFile(dataURL), readFile(metadataURL, "utf8")]) } = {}) {
  let pending;
  return {
    catalog() {
      if (!pending) pending = loadFiles()
        .then(([bytes, text]) => decodeCatalogSnapshot(bytes, JSON.parse(text)))
        .catch(error => {
          if (error instanceof ServiceError) throw error;
          throw new ServiceError("SOURCE_UNAVAILABLE");
        });
      return pending;
    },
  };
}
