const maxPoints = 40920;

export class ModelPoint {
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

export class Model {
  constructor(val) {
    // Array of model values, provided by loadModelFromPLY, 9 values per point
    if (Array.isArray(val)) {
      const modelValues = val;
      this.count = modelValues.length / 9;
      this.array = new SharedArrayBuffer(this.count * 16 * 4);
      this.data = new Float32Array(this.array);
      for (let ix = 0; ix < this.count; ++ix) {
        const ofsValues = ix * 9;
        const ofsData = ix * 16;
        for (let j = 0; j < 9; ++j)
          this.data[ofsData + j] = modelValues[ofsValues + j];
      }
    }
    // Existing SharedArrayBuffer of a model
    else {
      this.array = val;
      this.count = this.array.byteLength / 16 / 4;
      this.data = new Float32Array(this.array);
    }
  }
  /**
   * @param {number} ix Index of point to retrieve
   * @param {ModelPoint} mp ModelPoint instance that will receive values
   */
  getPoint(ix, mp) {
    const ofs = ix * 16;
    mp.mx = this.data[ofs];
    mp.my = this.data[ofs + 1];
    mp.mz = this.data[ofs + 2];
    mp.r = this.data[ofs + 3];
    mp.g = this.data[ofs + 4];
    mp.b = this.data[ofs + 5];
    mp.nx = this.data[ofs + 6];
    mp.ny = this.data[ofs + 7];
    mp.nz = this.data[ofs + 8];
    mp.cx = this.data[ofs + 9];
    mp.cy = this.data[ofs + 10];
    mp.cz = this.data[ofs + 11];
    mp.vx = this.data[ofs + 12];
    mp.vy = this.data[ofs + 13];
    mp.vz = this.data[ofs + 14];
    mp.age = this.data[ofs + 15];
  }

  updatePoint(ix, cx, cy, cz, vx, vy, vz, age) {
    const ofs = ix * 16;
    this.data[ofs + 9] = cx;
    this.data[ofs + 10] = cy;
    this.data[ofs + 11] = cz;
    this.data[ofs + 12] = vx;
    this.data[ofs + 13] = vy;
    this.data[ofs + 14] = vz;
    this.data[ofs + 15] = age;
  }

  setPointAge(ix, age) {
    this.data[ix * 16 + 15] = age;
  }

  putAllOnModel() {
    for (let ix = 0; ix < this.count; ++ix) {
      const ofs = ix * 16;
      this.data[ofs + 9] = this.data[ofs];
      this.data[ofs + 10] = this.data[ofs + 1];
      this.data[ofs + 11] = this.data[ofs + 2];
    }
  }

  scatterAll() {
    for (let ix = 0; ix < this.count; ++ix) {
      const ofs = ix * 16;
      this.data[ofs + 9] =  Math.random() - 0.5;
      this.data[ofs + 10] = Math.random() - 0.5;
      this.data[ofs + 11] = Math.random() - 0.5;
    }
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}

/**
 * @returns {Promise<Model>}
 */
export async function loadModelFromPLY(THREE, url, rot) {

  const resp = await fetch(url);
  const ply = await resp.text();
  const lines = ply.split("\n");

  // Shuffle points; keep only up to maxPoints
  const filteredLines = [];
  let headerOver = false;
  for (const ln of lines) {
    if (ln == "end_header") { headerOver = true; continue; }
    else if (!headerOver || ln == "") continue;
    filteredLines.push(ln);
  }
  shuffle(filteredLines);
  if (maxPoints !== undefined && filteredLines.length > maxPoints)
    filteredLines.length = maxPoints;

  const values = [];
  let xMin = Number.MAX_VALUE, xMax = Number.MIN_VALUE;
  let yMin = Number.MAX_VALUE, yMax = Number.MIN_VALUE;
  let zMin = Number.MAX_VALUE, zMax = Number.MIN_VALUE;

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

  return new Model(values);
}

function rotate(THREE, values, rot) {
  const vec = new THREE.Vector3();
  const nItems = values.length / 9;
  for (let ix = 0; ix < nItems; ++ix) {
    vec.set(values[ix*9], values[ix*9+1], values[ix*9+2]);
    vec.applyMatrix4(rot);
    values[ix*9] = vec.x;
    values[ix*9+1] = vec.y;
    values[ix*9+2] = vec.z;
  }
}

function normalize(values, ofs, min, max, maxRange) {
  const range = max - min;
  const aspect = range / maxRange;
  const center = (min + max) / 2;
  const nItems = values.length / 9;
  for (let ix = 0; ix < nItems; ++ix) {
    const val = values[ix * 9 + ofs];
    const normalized = (val - center) / range * 2 * aspect;
    values[ix * 9 + ofs] = normalized;
  }
}

function parseLine(ln) {
  const parts = ln.split(" ");
  if (parts.length != 9) throw new Error(`Line should have 9 values; found ${ln.length}`);
  const res = [];
  for (let i = 0; i < 3; ++i)
    res.push(Number.parseFloat(parts[i]));
  for (let i = 3; i < 6; ++i)
    res.push(Number.parseInt(parts[i]));
  for (let i = 6; i < 9; ++i)
    res.push(Number.parseFloat(parts[i]));
  return res;
}