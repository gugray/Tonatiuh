import {shuffle} from "./random.js";

const maxParticles = 40920;
// const maxParticles = 400;

export class ParticleData {
  constructor() {
    // Model point coordinates
    this.mx = 0;
    this.my = 0;
    this.mz = 0;
    // Model point color
    this.r = 0;
    this.g = 0;
    this.b = 0;
    // Model point normal
    this.nx = 0;
    this.ny = 0;
    this.nz = 0;
    // Current point coordinates (when animating)
    this.cx = 0;
    this.cy = 0;
    this.cz = 0;
    // Curent point velocity (when animating)
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    // Current particle age
    this.age = 0;
  }
}

export class ParticleSystem {
  constructor(val1, val2) {
    // Array of model values, provided by loadModelFromPLY, 9 values per point
    // In this case val2 is undefined
    if (Array.isArray(val1)) {
      const modelValues = val1;
      this.count = modelValues.length / 9;
      // 9 values per point from model
      this.modelBuffer = new SharedArrayBuffer(this.count * 9 * 4);
      this.modelArray = new Float32Array(this.modelBuffer);
      for (let i = 0; i < this.modelArray.length; ++i) this.modelArray[i] = modelValues[i];
      // 7 values per point in simulation
      this.simBuffer = new SharedArrayBuffer(this.count * 7 * 4);
      this.simArray = new Float32Array(this.simBuffer);
    }
    // Existing SharedArrayBuffers of a model
    else {
      this.modelBuffer = val1;
      this.simBuffer = val2;
      this.modelArray = new Float32Array(this.modelBuffer);
      this.simArray = new Float32Array(this.simBuffer);
      this.count = this.modelArray.length / 9;
    }
  }
  /**
   * @param {number} ix Index of point to retrieve
   * @param {ParticleData} mp ModelPoint instance that will receive values
   */
  getParticle(ix, mp) {
    const mofs = ix * 9;
    const sofs = ix * 7;
    mp.mx = this.modelArray[mofs];
    mp.my = this.modelArray[mofs + 1];
    mp.mz = this.modelArray[mofs + 2];
    mp.r = this.modelArray[mofs + 3];
    mp.g = this.modelArray[mofs + 4];
    mp.b = this.modelArray[mofs + 5];
    mp.nx = this.modelArray[mofs + 6];
    mp.ny = this.modelArray[mofs + 7];
    mp.nz = this.modelArray[mofs + 8];
    mp.cx = this.simArray[sofs];
    mp.cy = this.simArray[sofs + 1];
    mp.cz = this.simArray[sofs + 2];
    mp.vx = this.simArray[sofs + 3];
    mp.vy = this.simArray[sofs + 4];
    mp.vz = this.simArray[sofs + 5];
    mp.age = this.simArray[sofs + 6];
  }

  updateParticle(ix, cx, cy, cz, vx, vy, vz, age) {
    const ofs = ix * 7;
    this.simArray[ofs] = cx;
    this.simArray[ofs + 1] = cy;
    this.simArray[ofs + 2] = cz;
    this.simArray[ofs + 3] = vx;
    this.simArray[ofs + 4] = vy;
    this.simArray[ofs + 5] = vz;
    this.simArray[ofs + 6] = age;
  }

  setParticleAge(ix, age) {
    this.simArray[ix * 7 + 6] = age;
  }

  putAllOnModel() {
    for (let ix = 0; ix < this.count; ++ix) {
      const mofs = ix * 9;
      const sofs = ix * 7;
      this.simArray[sofs] = this.modelArray[mofs];
      this.simArray[sofs + 1] = this.modelArray[mofs + 1];
      this.simArray[sofs + 2] = this.modelArray[mofs + 2];
    }
  }

  scatterAll() {
    for (let ix = 0; ix < this.count; ++ix) {
      const sofs = ix * 7;
      this.simArray[sofs] = Math.random() - 0.5;
      this.simArray[sofs + 1] = Math.random() - 0.5;
      this.simArray[sofs + 2] = Math.random() - 0.5;
    }
  }
}

/**
 * @returns {Promise<ParticleSystem>}
 */
export async function loadModelFromPLY(THREE, url, rot) {
  const resp = await fetch(url);
  const ply = (await resp.text()).replaceAll("\r", "");
  const lines = ply.split("\n");

  // Shuffle points; keep only up to maxParticles
  const filteredLines = [];
  let headerOver = false;
  for (const ln of lines) {
    if (ln == "end_header") {
      headerOver = true;
      continue;
    } else if (!headerOver || ln == "") continue;
    filteredLines.push(ln);
  }
  shuffle(filteredLines);
  if (maxParticles !== undefined && filteredLines.length > maxParticles) filteredLines.length = maxParticles;

  const values = [];
  let xMin = Number.MAX_VALUE,
    xMax = Number.MIN_VALUE;
  let yMin = Number.MAX_VALUE,
    yMax = Number.MIN_VALUE;
  let zMin = Number.MAX_VALUE,
    zMax = Number.MIN_VALUE;

  for (const ln of filteredLines) {
    const ptvals = parseLine(ln.trim());
    if (ptvals[0] < xMin) xMin = ptvals[0];
    if (ptvals[0] > xMax) xMax = ptvals[0];
    if (ptvals[1] < yMin) yMin = ptvals[1];
    if (ptvals[1] > yMax) yMax = ptvals[1];
    if (ptvals[2] < zMin) zMin = ptvals[2];
    if (ptvals[2] > zMax) zMax = ptvals[2];
    values.push(...ptvals);
  }

  let maxRange = xMax - xMin;
  if (yMax - yMin > maxRange) maxRange = yMax - yMin;
  if (zMax - zMin > maxRange) maxRange = zMax - zMin;
  normalize(values, 0, xMin, xMax, maxRange);
  normalize(values, 1, yMin, yMax, maxRange);
  normalize(values, 2, zMin, zMax, maxRange);

  if (rot) rotate(THREE, values, rot);

  return new ParticleSystem(values);
}

function rotate(THREE, values, rot) {
  const vec = new THREE.Vector3();
  const nItems = values.length / 9;

  for (let ix = 0; ix < nItems; ++ix) {
    // Rotate position
    vec.set(values[ix * 9], values[ix * 9 + 1], values[ix * 9 + 2]);
    vec.applyMatrix4(rot);
    values[ix * 9] = vec.x;
    values[ix * 9 + 1] = vec.y;
    values[ix * 9 + 2] = vec.z;

    // Rotate normal
    // This was not done in original sketch lol
    // Made for an interesting outcome - revisit?
    vec.set(values[ix * 9 + 6], values[ix * 9 + 7], values[ix * 9 + 8]);
    vec.applyMatrix4(rot);
    values[ix * 9 + 6] = vec.x;
    values[ix * 9 + 7] = vec.y;
    values[ix * 9 + 8] = vec.z;
  }
}

function normalize(values, ofs, min, max, maxRange) {
  const range = max - min;
  const aspect = range / maxRange;
  const center = (min + max) / 2;
  const nItems = values.length / 9;
  for (let ix = 0; ix < nItems; ++ix) {
    const val = values[ix * 9 + ofs];
    const normalized = ((val - center) / range) * 2 * aspect;
    values[ix * 9 + ofs] = normalized;
  }
}

function parseLine(ln) {
  const parts = ln.split(" ");
  if (parts.length != 9) throw new Error(`Line should have 9 values; found ${ln.length}`);
  const res = [];
  for (let i = 0; i < 3; ++i) res.push(Number.parseFloat(parts[i]));
  for (let i = 3; i < 6; ++i) res.push(Number.parseInt(parts[i]));
  for (let i = 6; i < 9; ++i) res.push(Number.parseFloat(parts[i]));
  return res;
}
