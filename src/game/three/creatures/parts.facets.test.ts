import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { colorFacetsByNormal } from "./parts";

/** Average vertex color of the i-th triangle (indexed or not). */
function triangleColor(
  geometry: THREE.BufferGeometry,
  triangle: number,
): THREE.Color {
  const color = geometry.attributes.color as THREE.BufferAttribute;
  const index = geometry.index;
  const a = index ? index.getX(triangle * 3) : triangle * 3;
  const c = new THREE.Color(
    color.getX(a),
    color.getY(a),
    color.getZ(a),
  );
  return c;
}

describe("colorFacetsByNormal", () => {
  it("colors up-facing facets with the top color and the rest with the side color (non-indexed geometry, the production path)", () => {
    // Production always feeds colorFacetsByNormal non-indexed merged geometry
    // (props.ts runs it on withColor/mergeParts output); cover that branch.
    const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const up = new THREE.Color(0xff0000);
    const side = new THREE.Color(0x00ff00);
    const colored = colorFacetsByNormal(box, up, side, 0.5);

    const color = colored.attributes.color as THREE.BufferAttribute;
    const triangles = color.count; // non-indexed: one vertex per corner
    let topTriangles = 0;
    let sideTriangles = 0;
    for (let t = 0; t < triangles; t += 3) {
      // Read ALL three vertices of the triangle and require one shared color.
      const corners = [0, 1, 2].map((k) => new THREE.Color(color.getX(t + k), color.getY(t + k), color.getZ(t + k)));
      for (const corner of corners.slice(1)) expect(corner.equals(corners[0])).toBe(true);
      const isTop = corners[0].getHex() === up.getHex();
      const isSide = corners[0].getHex() === side.getHex();
      expect(isTop || isSide).toBe(true);
      if (isTop) topTriangles++;
      else sideTriangles++;
    }
    // A box has exactly one +Y face (2 triangles) colored as top.
    expect(topTriangles).toBe(2);
    expect(sideTriangles).toBe(triangles / 3 - 2);

    box.dispose();
    colored.dispose();
  });

  it("colors up-facing facets with the top color and the rest with the side color", () => {
    const box = new THREE.BoxGeometry(1, 1, 1); // indexed, flat per-face normals
    const up = new THREE.Color(0xff0000);
    const side = new THREE.Color(0x00ff00);
    const colored = colorFacetsByNormal(box, up, side, 0.5);

    const position = colored.attributes.position as THREE.BufferAttribute;
    const color = colored.attributes.color as THREE.BufferAttribute;
    const triangles = (colored.index?.count ?? position.count) / 3;
    let topTriangles = 0;
    let sideTriangles = 0;
    for (let t = 0; t < triangles; t++) {
      const c = triangleColor(colored, t);
      // All three vertices of a triangle share one color.
      const index = colored.index!;
      const b = index.getX(t * 3 + 1);
      const c2 = new THREE.Color(color.getX(b), color.getY(b), color.getZ(b));
      expect(c2.equals(c)).toBe(true);
      const isTop = c.getHex() === up.getHex();
      const isSide = c.getHex() === side.getHex();
      expect(isTop || isSide).toBe(true);
      if (isTop) topTriangles++;
      else sideTriangles++;
    }
    // A box has exactly one +Y face (2 triangles) colored as top.
    expect(topTriangles).toBe(2);
    expect(sideTriangles).toBe(triangles - 2);

    box.dispose();
    colored.dispose();
  });

  it("returns a NEW geometry and leaves the source untouched", () => {
    const source = new THREE.BoxGeometry(1, 1, 1);
    const before = source.attributes.color;
    const colored = colorFacetsByNormal(
      source,
      new THREE.Color(0xffffff),
      new THREE.Color(0x000000),
      0.5,
    );
    expect(colored).not.toBe(source);
    expect(source.attributes.color).toBe(before);
    colored.dispose();
    source.dispose();
  });
});
