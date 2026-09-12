import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { careArtworks } from "./care-artworks.js";

export async function loadCareArtworks() {
  const results = await Promise.allSettled(
    careArtworks.map(async ({ image }) => {
      const texture = await new THREE.TextureLoader().loadAsync(
        `${import.meta.env.BASE_URL}${image}`,
      );
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    }),
  );
  const textures = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (textures.length !== careArtworks.length) {
    textures.forEach((texture) => texture.dispose());
    throw new Error("Care artwork could not load");
  }
  return textures;
}

// A printed art insert inside the original glass case. Preserve its shell and optics.
export function createChildcareMeshes(picture: THREE.Texture) {
  const backing = new THREE.Mesh(
    new RoundedBoxGeometry(3.98, 2.7, 0.07, 3, 0.035),
    new THREE.MeshPhysicalMaterial({ color: "#e8dfca", roughness: 0.8 }),
  );
  backing.position.set(0, 1.42, 0.3);
  backing.userData.surface = "Childcare_ArtBacking";
  backing.receiveShadow = true;
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(3.84, 2.56),
    new THREE.MeshPhysicalMaterial({ map: picture, roughness: 0.88 }),
  );
  print.position.set(0, 1.42, 0.341);
  print.userData.surface = "Childcare_PictureBook";
  return [backing, print];
}
