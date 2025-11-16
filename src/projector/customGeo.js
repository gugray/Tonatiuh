import * as THREE from "three";

export async function loadTextureAsync(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => resolve(tex),
      undefined,
      (err) => reject(err),
    );
  });
}

export function hackBoxMaterial(geo, mat) {
  mat.onBeforeCompile = (shader) => {
    // This comes first in code => we'll use mapColor later.
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
float alpha = 0.4;
diffuseColor.rgb *= 2.0;
// diffuseColor whatevs
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", `
#include <dithering_fragment>
gl_FragColor.a = alpha;
    `);
  };

  const uvAttribute = geo.getAttribute("uv");
  // prettier-ignore
  const uvMap = [
    0, 0.75, 0, 1, 1, 0.75, 1, 1,
    0, 0.25, 0, 0.5, 1, 0.25, 1, 0.5,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0.5, 0, 0.75, 1, 0.5, 1, 0.75,
    0, 0, 0, 0.25, 1, 0, 1, 0.25,
  ];
  for (let i = 0; i < 24; ++i) uvAttribute.setXY(i, uvMap[2 * i], uvMap[2 * i + 1]);
}
