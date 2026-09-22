import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const evidencePath = resolve(import.meta.dirname, "data/short-care-review-evidence-20260922.json");
const payload = JSON.parse(readFileSync(evidencePath, "utf8"));
const evidenceById = new Map(payload.providers.map(entry => [entry.id, entry]));

/**
 * Attach only the derived, branch-matched review signals to a published
 * catalogue. The raw review wording stays out of the API response.
 */
export function applyReviewEvidence(catalog) {
  if (!catalog || !Array.isArray(catalog.items)) return catalog;
  return {
    ...catalog,
    items: catalog.items.map(provider => {
      const evidence = evidenceById.get(provider.id);
      if (!evidence) return provider;
      return {
        ...provider,
        ...(evidence.reviewTopics ? { reviewTopics: evidence.reviewTopics } : {}),
        reviewEvidence: {
          sourceKind: payload.sourceKind,
          retrievedOn: payload.retrievedOn,
          identityVerified: true,
          reviewCount: evidence.reviewCount,
          rating: evidence.rating,
          observedThemes: evidence.observedThemes,
          reviewTaxonomy: evidence.reviewTaxonomy ?? [],
          sourceUrl: evidence.sourceUrl,
        },
      };
    }),
  };
}
