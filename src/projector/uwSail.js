import * as twgl from "twgl.js";
import sSweepVert from "./shaders/sweep-vert.glsl";
import sCalcPosFrag from "./shaders/calc-sail-pos.glsl";
import {rand} from "./random.js";

let simFieldMul;
let simSpeed;
let sharedArrPos, nVerts;
let gl, sweepArrays, sweepBufferInfo, simArrays, simBufferInfo;
let szDataTexture;
let txPos0, txPos1, arrPos, progiPosUpdate;
let nzOfs1, nzOfs2;
let lastUpdateTime = null;
let quit = false;

onmessage = (e) => {
  // Parameters passed
  if (e.data.hasOwnProperty("simFieldMul")) simFieldMul = e.data.simFieldMul;
  if (e.data.hasOwnProperty("simSpeed")) simSpeed = e.data.simSpeed;
  // Initial message: passes info/ownership
  if (e.data.simCanvas) {
    init(e.data.simCanvas, e.data.simBuffer);
    setTimeout(updateLoop, 0);
  } //
  else quit = true;
};

function init(simCanvas, buffer) {
  // Noise offset: needed for Curl calculation in shader
  // By randomozing it we make different sails fold differently
  nzOfs1 = [256 * (rand() - 0.5), 256 * (rand() - 0.5), 256 * (rand() - 0.5)];
  nzOfs2 = [256 * (rand() - 0.5), 256 * (rand() - 0.5), 256 * (rand() - 0.5)];
  // Data array is 3 floats per vertex: xyz
  sharedArrPos = new Float32Array(buffer);
  nVerts = sharedArrPos.length / 3;

  gl = simCanvas.getContext("webgl2");
  twgl.addExtensionsToContext(gl);

  sweepArrays = {
    position: {numComponents: 2, data: [-1, -1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1]},
  };
  sweepBufferInfo = twgl.createBufferInfoFromArrays(gl, sweepArrays);
  simArrays = {index: {numComponents: 1, data: []}};
  for (let i = 0; i < nVerts; ++i) simArrays.index.data.push(i);
  simBufferInfo = twgl.createBufferInfoFromArrays(gl, simArrays);

  // Data texture size: this many vec4's
  szDataTexture = Math.ceil(Math.sqrt(nVerts));

  // Pingpong data textures for position
  // Simulation has 4 values per particle: cx, cy, cz, unused => vec4
  [arrPos, txPos0] = createDataTexture(szDataTexture, true);
  [_, txPos1] = createDataTexture(szDataTexture, false);

  // Simulation program
  progiPosUpdate = twgl.createProgramInfo(gl, [sSweepVert, sCalcPosFrag]);
}

function createDataTexture(sz, init) {
  const data = new Float32Array(sz * sz * 4);
  for (let i = 0; i < nVerts; ++i) {
    if (!init) continue;
    data[i * 4] = sharedArrPos[i * 3];
    data[i * 4 + 1] = sharedArrPos[i * 3 + 1];
    data[i * 4 + 2] = sharedArrPos[i * 3 + 2];
  }
  const tx = twgl.createTexture(gl, {
    internalFormat: gl.RGBA32F,
    format: gl.RGBA,
    type: gl.FLOAT,
    width: sz,
    height: sz,
    src: data,
  });
  return [data, tx];
}

function updateSimulation(dt) {
  // Update positions: always tx0 => tx1
  const unisPosUpdate = {
    sz: szDataTexture,
    txPrev: txPos0,
    simFieldMul: simFieldMul,
    simSpeed: simSpeed,
    nzOfs1: nzOfs1,
    nzOfs2: nzOfs2,
    dt: dt,
  };
  let atmsPosU = [{attachment: txPos1}];
  let fbufPosU = twgl.createFramebufferInfo(gl, atmsPosU, szDataTexture, szDataTexture);
  twgl.bindFramebufferInfo(gl, fbufPosU);
  gl.viewport(0, 0, szDataTexture, szDataTexture);
  gl.useProgram(progiPosUpdate.program);
  twgl.setBuffersAndAttributes(gl, progiPosUpdate, sweepBufferInfo);
  twgl.setUniforms(progiPosUpdate, unisPosUpdate);
  twgl.drawBufferInfo(gl, sweepBufferInfo);

  // Retrieve data
  twgl.bindFramebufferInfo(gl, fbufPosU);
  gl.readPixels(0, 0, szDataTexture, szDataTexture, gl.RGBA, gl.FLOAT, arrPos);

  // Swap texture references for next round
  [txPos0, txPos1] = [txPos1, txPos0];
}

function updateLoop() {
  let dt = 10;
  const t0 = Date.now();
  if (lastUpdateTime != null) dt = t0 - lastUpdateTime;

  updateSimulation(dt);
  // Copy data to shared array
  for (let i = 0; i < nVerts; ++i) {
    sharedArrPos[i * 3] = arrPos[i * 4];
    sharedArrPos[i * 3 + 1] = arrPos[i * 4 + 1];
    sharedArrPos[i * 3 + 2] = arrPos[i * 4 + 2];
  }

  const t1 = Date.now();
  const elapsed = t1 - lastUpdateTime;
  lastUpdateTime = t0;

  if (!quit) {
    let wait = elapsed > 15 ? 0 : 15 - elapsed;
    setTimeout(updateLoop, wait);
  } else {
    gl.deleteTexture(txPos0);
    gl.deleteTexture(txPos1);
    for (const key in sweepBufferInfo.attribs) gl.deleteBuffer(sweepBufferInfo.attribs[key].buffer);
    gl.deleteBuffer(sweepBufferInfo.indices);
    for (const key in simBufferInfo.attribs) gl.deleteBuffer(simBufferInfo.attribs[key].buffer);
    if (simBufferInfo.indices) gl.deleteBuffer(simBufferInfo.indices);
    gl.deleteProgram(progiPosUpdate.program);
    close();
  }
}
