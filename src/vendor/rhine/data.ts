// These are decorative care themes, not institution records or availability claims.
import { careArtworks } from "../../care-artworks.js";
export const archiveColumns = careArtworks.map(artwork => artwork.title);
export const records = archiveColumns.flatMap((category, lane) =>
  Array.from({ length: 8 }, (_, row) => ({
    id: `CARE-${lane}-${row}`, category,
    title: category, en: category,
  })),
);
export function columnFiles(lane: number) {
  return records.flatMap((record, index) => record.category === archiveColumns[lane] ? [index] : []);
}
export function fileLocation(index: number) {
  const safe = ((index % records.length) + records.length) % records.length;
  const lane = archiveColumns.indexOf(records[safe].category);
  const row = 12 + columnFiles(lane).indexOf(safe);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
