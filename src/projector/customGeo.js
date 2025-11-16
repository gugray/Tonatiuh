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
float alpha = 1.0;
// diffuseColor.rgb *= 2.0;
// diffuseColor whatevs
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", `
#include <dithering_fragment>
gl_FragColor.a = alpha;
    `);
  };
}
