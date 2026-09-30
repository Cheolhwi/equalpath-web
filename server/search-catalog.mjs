import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ServiceError } from './service-error.mjs';

export const searchCatalogSchema = 'equalpath-search-catalog-v1';
const root = new URL('./data/search-index/', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

export function decodeSearchArtifact(compressed, metadata) {
  try {
    if (!metadata || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw Error();
    const bytes = gunzipSync(compressed, { maxOutputLength: 80 * 1024 * 1024 });
    if (bytes.length !== metadata.bytes || sha(bytes) !== metadata.sha256) throw Error();
    return JSON.parse(bytes);
  } catch { throw new ServiceError('SOURCE_INVALID'); }
}

// Immutable publication artifacts only. No database, full-directory decode or
// review-text import on the short-care search path. Promises also dedupe reads.
export function createSearchStore({ read = name => readFile(new URL(name, root)) } = {}) {
  let manifest;
  const catalogs = new Map(), extras = new Map();
  const guarded = async task => {
    try { return await task(); }
    catch (error) { throw error instanceof ServiceError ? error : new ServiceError('SOURCE_UNAVAILABLE'); }
  };
  const index = () => manifest ??= guarded(async () => {
    const value = JSON.parse(await read('manifest.json'));
    if (value.schema !== searchCatalogSchema || !value.version || !value.partitions || !value.extras)
      throw new ServiceError('SOURCE_INVALID');
    return value;
  });
  return {
    prepared: true,
    catalog(careType) {
      if (!['short_term', 'regular'].includes(careType)) return Promise.reject(new ServiceError('INVALID_REQUEST', 422));
      if (!catalogs.has(careType)) catalogs.set(careType, guarded(async () => {
        const meta = await index();
        const catalog = decodeSearchArtifact(await read(`${careType}.json.gz`), meta.partitions[careType]);
        const shortIds = new Set(catalog.shortCareIds);
        if (catalog.version !== meta.version || catalog.release !== meta.release || !catalog.shortCareReady ||
            !Array.isArray(catalog.items) || !Array.isArray(catalog.held) ||
            catalog.items.length !== meta.partitions[careType].providers ||
            new Set(catalog.items.map(p => p.id)).size !== catalog.items.length ||
            catalog.items.some(p => p.mode !== 'live' || p.version !== meta.version ||
              shortIds.has(p.id) !== (careType === 'short_term')))
          throw new ServiceError('SOURCE_INVALID');
        return catalog;
      }));
      return catalogs.get(careType);
    },
    extras(id) {
      if (!extras.has(id)) extras.set(id, guarded(async () => {
        const meta = await index();
        if (!Object.hasOwn(meta.extras, id)) return {};
        const info = meta.extras[id];
        const value = decodeSearchArtifact(await read(`extras/${sha(id)}.json.gz`), info);
        if (value.id !== id || value.version !== meta.version) throw new ServiceError('SOURCE_INVALID');
        return value.fields;
      }));
      return extras.get(id);
    },
  };
}
