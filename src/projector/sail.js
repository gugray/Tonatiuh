import * as THREE from "three";
import * as noise from "./noise.js";
import {simplex3curl} from "./curl.js";

const sizeFactor = 300;
const initDistFromCam = 60;
const simFieldMul = 1;
const simSpeed = 0.00002;
const easeInMsec = 400;
const easeOutMsec = 4000;

noise.seed(0);
let renderOrder = 1000;

export class Sail {
  constructor(tx, w, h, canvW, camAzim, camAlt, camPan, lifeTime) {
    const szHoriz = 1;
    const szVert = h / w;
    const nHoriz = Math.round(w / 5);
    const nVert = Math.round(h / 5);
    const meshScale = (w / canvW / devicePixelRatio) * sizeFactor;

    console.log(canvW);
    console.log(w);
    // console.log(`Sail ${szHoriz} x ${szVert} pixels => ${nHoriz} x ${nVert} segments`);

    this.nVerts = (nHoriz + 1) * (nVert + 1);
    // Shared array buffer with vertex positions
    this.sarrBuf = initPositions(nHoriz, nVert, szHoriz, szVert);
    // Geometry
    this.mesh = makeCodeSailMesh(tx, nHoriz, nVert, new Float32Array(this.sarrBuf));
    this.mesh.scale.set(meshScale, meshScale, 1);
    positionMesh(this.mesh, camAzim, camAlt, camPan);
    this.mesh.material.map = tx;
    this.mesh.material.needsUpdate = true;
    // Vertex position updater in worker thread
    const simCanvas = document.createElement("canvas").transferControlToOffscreen();
    this.updater = new Worker("uwSail.js");
    this.updater.postMessage(
      {
        simCanvas: simCanvas,
        simBuffer: this.sarrBuf,
        simFieldMul,
        simSpeed,
      },
      [simCanvas],
    );
    // We're young
    this.age = 0;
    this.lifeTime = lifeTime;
    this.isOver = false;
  }

  updatePositions(dt) {
    const posArr = new Float32Array(this.sarrBuf);
    for (let i = 0; i < this.nVerts; ++i) {
      const cx = posArr[i * 3];
      const cy = posArr[i * 3 + 1];
      const cz = posArr[i * 3 + 2];
      let curl = simplex3curl(cx * simFieldMul, cy * simFieldMul, cz * simFieldMul);
      if (curl[0] != curl[0] || curl[1] != curl[1] || curl[2] != curl[2]) {
        curl = [0, 0, 0];
      }
      const vx = simSpeed * curl[0];
      const vy = simSpeed * curl[1];
      const vz = simSpeed * curl[2];
      posArr[i * 3] = cx + vx;
      posArr[i * 3 + 1] = cy + vy;
      posArr[i * 3 + 2] = cz + vz + 0.003;
    }
    this.age += dt;
  }

  update(dt) {
    this.age += dt;
    if (this.age > this.lifeTime) {
      this.isOver = true;
      this.updater.postMessage({});
      return;
    }
    const posAttribute = this.mesh.geometry.getAttribute("position");
    const trgArr = posAttribute.array;
    const posArr = new Float32Array(this.sarrBuf);
    for (let i = 0; i < this.nVerts * 3; ++i) {
      trgArr[i] = posArr[i];
    }
    posAttribute.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();

    // Fading in and out
    const easeOutStart = this.lifeTime - easeOutMsec;
    let strength;
    // Ease in quickly
    if (this.age <= easeInMsec) {
      let t = this.age / easeInMsec;
      strength = t * t;
    }
    // Sustain
    else if (this.age < easeOutStart) strength = 1;
    // Ease out
    else {
      let t = (this.age - easeOutStart) / easeOutMsec;
      strength = (1 - t) * (1 - t);
    }
    if (strength > 1) strength = 1;
    else if (strength < 0) strength = 0;

    // Update strength via our custom uniform
    if (this.mesh.material.userData.hasOwnProperty("strength")) {
      this.mesh.material.userData.strength.value = strength;
    }
  }
}

function positionMesh(mesh, camAzim, camAlt, camPan) {
  // Recreate camera position, which includes pan
  // And camera direction, which is before XY pan
  const dirObj = new THREE.Object3D();
  const dirGroup = new THREE.Group();
  dirGroup.add(dirObj);
  const camObj = new THREE.Object3D();
  const panGroup = new THREE.Group();
  panGroup.add(camObj);
  const altGroup = new THREE.Group();
  altGroup.add(panGroup);
  altGroup.add(dirGroup);
  const azimGroup = new THREE.Group();
  azimGroup.add(altGroup);
  panGroup.position.copy(camPan);
  dirGroup.position.z = camPan.z;
  altGroup.rotation.x = camAlt;
  azimGroup.rotation.y = camAzim;
  camObj.updateMatrix();
  dirObj.updateMatrix();

  // Camera direction in world
  const dir = new THREE.Vector3();
  dirObj.getWorldPosition(dir);
  dir.normalize().multiplyScalar(-1);

  // Camera position in world
  const pos = new THREE.Vector3();
  camObj.getWorldPosition(pos);
  const quat = new THREE.Quaternion();
  camObj.getWorldQuaternion(quat);

  // Put sail in front of camera
  mesh.quaternion.copy(quat);
  mesh.updateMatrix();
  mesh.position.copy(pos);
  mesh.position.add(dir.clone().multiplyScalar(initDistFromCam));
}

function initPositions(nHoriz, nVert, szHoriz, szVert) {
  const nVerts = (nHoriz + 1) * (nVert + 1);
  const sarrBuf = new SharedArrayBuffer(nVerts * 3 * 4);
  const posArr = new Float32Array(sarrBuf);

  let posIx = 0;
  for (let iy = 0; iy <= nVert; iy++) {
    const y = -szVert * 0.5 + (szVert * iy) / nVert;
    for (let ix = 0; ix <= nHoriz; ix++) {
      const x = -szHoriz * 0.5 + (szHoriz * ix) / nHoriz;
      posArr[posIx++] = x;
      posArr[posIx++] = y;
      posArr[posIx++] = 0;
    }
  }

  return sarrBuf;
}

function makeCodeSailMesh(txBlack, nHoriz, nVert, posArr) {
  const nVerts = (nHoriz + 1) * (nVert + 1);
  const positions = new Float32Array(nVerts * 3);
  const uvs = new Float32Array(nVerts * 2);
  const indices = [];

  // Fill vertex positions
  for (let i = 0; i < nVerts * 3; ++i) {
    positions[i] = posArr[i];
  }

  // Fill UV values
  let uvIx = 0;
  for (let iy = 0; iy <= nVert; iy++) {
    const v = iy / nVert;
    for (let ix = 0; ix <= nHoriz; ix++) {
      const u = ix / nHoriz;
      uvs[uvIx++] = u;
      uvs[uvIx++] = v;
    }
  }

  // Build index buffer (two triangles per grid cell)
  for (let iy = 0; iy < nVert; iy++) {
    for (let ix = 0; ix < nHoriz; ix++) {
      // Four corners for segment
      const tl = iy * (nHoriz + 1) + ix;
      const tr = tl + 1;
      const bl = tl + (nHoriz + 1);
      const br = bl + 1;
      // Two triangles
      indices.push(tl, bl, tr);
      indices.push(tr, bl, br);
    }
  }

  // Create geometry
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshPhongMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.3,
    // color: 0x00008b,
    shininess: 60,
    // emissive: 0x111177,
    // emissiveIntensity: 5,
    specular: 0x222222,
    map: txBlack,
    depthWrite: false,
    depthTest: true,
  });

  hackSailForCodeTexture(mat);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = renderOrder++;
  return mesh;
}

function hackSailForCodeTexture(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.strength = {value: 0};
    mat.userData.strength = shader.uniforms.strength;
    // This comes first in code => we'll use mapColor later.
    shader.fragmentShader = "uniform float strength;\n" + shader.fragmentShader;
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("vec3 totalEmissiveRadiance = emissive;", `
vec4 mapColor = texture2D( map, vMapUv );
vec3 totalEmissiveRadiance;
float mapColorLength = length(mapColor.rgb);
if (mapColorLength > 0.3) totalEmissiveRadiance = mapColor.rgb * strength;
else totalEmissiveRadiance = emissive;
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
float alpha = 1.0;
if (mapColorLength > 0.3) diffuseColor = mapColor * strength;
else { diffuseColor.rgb = vec3(0.); alpha = 0.6 * strength; }
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", `
#include <dithering_fragment>
gl_FragColor.a = alpha;
    `);
  };
}
