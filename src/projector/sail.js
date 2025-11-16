import * as THREE from "three";
import * as CG from "./customGeo.js";
import * as noise from "./noise.js";
import {simplex3curl} from "./curl.js";

const simFieldMul = 1;
const simSpeed = 0.00001;

noise.seed(0);
let renderOrder = 10000;

export class Sail {
  constructor(nHoriz, nVert, szHoriz, szVert, tx) {
    this.nVerts = (nHoriz + 1) * (nVert + 1);
    // Shared array buffer with vertex positions
    this.sarrBuf = initPositions(nHoriz, nVert, szHoriz, szVert);
    // Geometry
    this.mesh = makeCodeSailMesh(tx, nHoriz, nVert, new Float32Array(this.sarrBuf));
    this.mesh.scale.set(20, 20, 20);
    this.mesh.position.z = 13;
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

  updateGeometry() {
    const posAttribute = this.mesh.geometry.getAttribute("position");
    const trgArr = posAttribute.array;
    const posArr = new Float32Array(this.sarrBuf);
    for (let i = 0; i < this.nVerts * 3; ++i) {
      trgArr[i] = posArr[i];
    }
    posAttribute.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
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

  CG.hackSailForCodeTexture(mat);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = renderOrder--;
  return mesh;
}
