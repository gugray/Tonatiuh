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

export function hackBlockForCodeTexture(geo, mat) {
  mat.onBeforeCompile = (shader) => {
    // console.log(shader.fragmentShader);
    // This comes first in code => we'll use mapColor later.
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("vec3 totalEmissiveRadiance = emissive;", `
vec4 mapColor = texture2D( map, vMapUv );
vec3 totalEmissiveRadiance;
float mapColorLength = length(mapColor.rgb);
if (mapColorLength > 0.3) totalEmissiveRadiance = mapColor.rgb * 0.5;
else totalEmissiveRadiance = emissive;
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
float alpha = 1.0;
if (mapColorLength > 0.3) diffuseColor = mapColor;
else { diffuseColor *= 0.9; alpha = 0.6; }
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

export function hackSailForCodeTexture(mat) {
  mat.onBeforeCompile = (shader) => {
    // console.log(shader.fragmentShader);
    // This comes first in code => we'll use mapColor later.
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("vec3 totalEmissiveRadiance = emissive;", `
vec4 mapColor = texture2D( map, vMapUv );
vec3 totalEmissiveRadiance;
float mapColorLength = length(mapColor.rgb);
if (mapColorLength > 0.3) totalEmissiveRadiance = mapColor.rgb * 1.;
else totalEmissiveRadiance = emissive;
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
float alpha = 1.0;
if (mapColorLength > 0.3) diffuseColor = mapColor;
else { diffuseColor.rgb = vec3(0.); alpha = 0.6; }
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", `
#include <dithering_fragment>
gl_FragColor.a = alpha;
    `);
  };
}
