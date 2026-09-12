import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Small physical props on the original cassette face; the shell and array stay intact.
export function createChildcareMeshes() {
  const meshes: THREE.Mesh[] = [];
  const add = (
    name: string,
    size: number[],
    position: number[],
    color: string,
    radius = 0.04,
  ) => {
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.67,
      metalness: 0,
      clearcoat: 0.08,
    });
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius),
      material,
    );
    mesh.position.set(position[0], position[1], position[2]);
    mesh.userData.surface = `Childcare_${name}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.push(mesh);
    return mesh;
  };
  add("BookCover", [2.42, 1.7, 0.12], [-0.83, 1.55, 0.31], "#8a9a71");
  add("BookPages", [2.31, 1.59, 0.07], [-0.8, 1.55, 0.39], "#f1ead8", 0.018);
  const picture = new THREE.TextureLoader().load(
    `${import.meta.env.BASE_URL}images/childcare-book-cover.png`,
  );
  picture.colorSpace = THREE.SRGBColorSpace;
  const page = new THREE.Mesh(
    new THREE.PlaneGeometry(2.27, 1.51),
    new THREE.MeshPhysicalMaterial({ map: picture, roughness: 0.88 }),
  );
  page.position.set(-0.8, 1.55, 0.432);
  page.userData.surface = "Childcare_PictureBook";
  meshes.push(page);
  const letters = [
    { text: "A", color: "#c99268", x: 0.87, y: 1.08, angle: -0.07 },
    { text: "B", color: "#bdaf71", x: 1.6, y: 1.08, angle: 0.07 },
    { text: "C", color: "#91a17e", x: 1.21, y: 1.81, angle: -0.13 },
  ];
  for (const block of letters) {
    const mesh = add(
      `Block_${block.text}`,
      [0.66, 0.66, 0.32],
      [block.x, block.y, 0.43],
      block.color,
      0.055,
    );
    mesh.rotation.z = block.angle;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = block.color;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "#f8f1dc";
    ctx.lineWidth = 5;
    ctx.strokeRect(22, 22, 212, 212);
    ctx.font = "bold 174px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f8f1dc";
    ctx.fillText(block.text, 128, 137);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.57, 0.57),
      new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.8 }),
    );
    face.position.set(block.x, block.y, 0.596);
    face.rotation.z = block.angle;
    face.userData.surface = `Childcare_Letter_${block.text}`;
    meshes.push(face);
  }
  return meshes;
}
