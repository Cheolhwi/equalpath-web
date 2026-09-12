// Decorative illustrations, independent of the public institution directory.
export const careArtworks = [
  {
    id: "read",
    title: "READ",
    alt: "A caregiver reading with two young children",
  },
  {
    id: "play",
    title: "PLAY",
    alt: "Children and a caregiver building with wooden blocks",
  },
  {
    id: "create",
    title: "CREATE",
    alt: "Children drawing leaves and flowers with their caregiver",
  },
  {
    id: "together",
    title: "TOGETHER",
    alt: "A child with a backpack greeting a parent at pickup",
  },
].map((artwork) => ({
  ...artwork,
  image: `images/care-gallery/anime-v2/${artwork.id}.webp`,
}));

export function nextArtwork(index, direction, count = careArtworks.length) {
  if (count < 2) return { index: 0, direction: 1 };
  const nextDirection = index >= count - 1 ? -1 : index <= 0 ? 1 : direction;
  return { index: index + nextDirection, direction: nextDirection };
}

// One cancellable dwell; the host restarts it after selection or visibility changes.
export function artworkDwell(
  advance,
  { delay = 6500, schedule = setTimeout, cancel = clearTimeout } = {},
) {
  let active = true;
  const timer = schedule(() => {
    if (active) advance();
  }, delay);
  return () => {
    active = false;
    cancel(timer);
  };
}
