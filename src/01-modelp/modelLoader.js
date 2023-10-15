export class ModelPoint {
  constructor(x, y, z, r, g, b, nx, ny, nz) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.r = r;
    this.g = g;
    this.b = b;
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
  }
}

export class Model {
  constructor(values) {
    this.data = new Float32Array(values);
    this.count = values.length  / 9;
  }
  /**
   * @param {number} ix Index of point to retrieve
   * @param {ModelPoint} mp ModelPoint instance that will receive values
   */
  getPoint(ix, mp) {
    const ofs = ix * 9;
    mp.x = this.data[ofs];
    mp.y = this.data[ofs + 1];
    mp.z = this.data[ofs + 2];
    mp.r = this.data[ofs + 3];
    mp.g = this.data[ofs + 4];
    mp.b = this.data[ofs + 5];
    mp.nx = this.data[ofs + 6];
    mp.ny = this.data[ofs + 7];
    mp.nz = this.data[ofs + 8];
  }
}

/**
 * @returns {Promise<Model>}
 */
export async function loadModelFromPLY(THREE, url, rot) {

  const resp = await fetch(url);
  const ply = await resp.text();
  const lines = ply.split("\n");

  const values = [];
  let headerOver = false;
  let xMin = Number.MAX_VALUE, xMax = Number.MIN_VALUE;
  let yMin = Number.MAX_VALUE, yMax = Number.MIN_VALUE;
  let zMin = Number.MAX_VALUE, zMax = Number.MIN_VALUE;

  for (const ln of lines) {

    if (ln == "end_header") { headerOver = true; continue; }
    else if (!headerOver || ln == "") continue;

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