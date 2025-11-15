import * as twgl from "twgl.js";
import sSweepVert from "shaders/sweep-vert.glsl";
import sCalcPosFrag from "shaders/calc-pos.glsl";
import sCalcVeloFrag from "shaders/calc-velo.glsl";
import {ParticleSystem, ParticleData} from "./particleSystem.js";
import {sortedArray} from "three/src/animation/AnimationUtils.js";

const prt = new ParticleData();

let psys;
let gl, sweepArrays, sweepBufferInfo, simArrays, simBufferInfo;
let szDataTexture;
let txVelo, arrVelo, progiVelo;
let txPos0, txPos1, arrPos, progiPosUpdate;

let simFieldMul, simSpeed, maxAge;
let lastUpdateTime = null;

function init(modelBuffer, simBuffer, simCanvas) {
  psys = new ParticleSystem(modelBuffer, simBuffer);

  gl = simCanvas.getContext("webgl2");
  twgl.addExtensionsToContext(gl);

  sweepArrays = {
    position: {numComponents: 2, data: [-1, -1, -1, 1, 1, -1, -1, 1, 1, -1, 1, 1]},
  };
  sweepBufferInfo = twgl.createBufferInfoFromArrays(gl, sweepArrays);
  simArrays = {index: {numComponents: 1, data: []}};
  for (let i = 0; i < psys.count; ++i) simArrays.index.data.push(i);
  simBufferInfo = twgl.createBufferInfoFromArrays(gl, simArrays);

  // Data texture size: this many vec4's
  szDataTexture = Math.ceil(Math.sqrt(psys.count));

  // Single data texture for velocity
  [arrVelo, txVelo] = createDataTexture(szDataTexture, "normal");

  // Pingpong data textures for position
  // Simulation has 4 values per particle: cx, cy, cz, age => vec4
  [arrPos, txPos0] = createDataTexture(szDataTexture, "pos_age");
  [_, txPos1] = createDataTexture(szDataTexture, null);

  // Simulation programs
  progiPosUpdate = twgl.createProgramInfo(gl, [sSweepVert, sCalcPosFrag]);
  progiVelo = twgl.createProgramInfo(gl, [sSweepVert, sCalcVeloFrag]);
}

function createDataTexture(sz, initFrom) {
  const data = new Float32Array(sz * sz * 4);
  for (let i = 0; i < psys.count; ++i) {
    psys.getParticle(i, prt);
    if (initFrom == "pos_age") {
      data[i * 4] = prt.mx;
      data[i * 4 + 1] = prt.my;
      data[i * 4 + 2] = prt.mz;
      data[i * 4 + 3] = prt.age;
    } //
    else if (initFrom == "normal") {
      data[i * 4] = prt.nx;
      data[i * 4 + 1] = prt.ny;
      data[i * 4 + 2] = prt.nz;
      data[i * 4 + 3] = 0;
    } //
    else {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = data[i * 4 + 3] = 0;
    }
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

function updateParticle(i, dt) {
  psys.getParticle(i, prt);

  // let curl = simplex3curl(prt.cx * simFieldMul, prt.cy * simFieldMul, prt.cz * simFieldMul);
  // if (curl[0] != curl[0] || curl[1] != curl[1] || curl[2] != curl[2]) {
  //   curl = [0, 0, 0];
  // }
  // prt.vx = simSpeed * curl[0];
  // prt.vy = simSpeed * curl[1];
  // prt.vz = simSpeed * curl[2];
  // prt.cx += prt.vx;
  // prt.cy += prt.vy;
  // prt.cz += prt.vz;
  // prt.age += dt;
  // psys.updateParticle(i, prt.cx, prt.cy, prt.cz, prt.vx, prt.vy, prt.vz, prt.age);
  // return;

  // let ageLimitRatio = prt.age / maxAge;
  // if (ageLimitRatio > Math.random() + 0.5) {
  //   prt.age = Math.round((Math.random() - 0.5) * maxAge);
  //   prt.cx = prt.mx;
  //   prt.cy = prt.my;
  //   prt.cz = prt.mz;
  // }

  prt.vx = arrVelo[i * 4];
  prt.vy = arrVelo[i * 4 + 1];
  prt.vz = arrVelo[i * 4 + 2];

  prt.cx = arrPos[i * 4];
  prt.cy = arrPos[i * 4 + 1];
  prt.cz = arrPos[i * 4 + 2];
  prt.age = arrPos[i * 4 + 3];

  psys.updateParticle(i, prt.cx, prt.cy, prt.cz, prt.vx, prt.vy, prt.vz, prt.age);
}

onmessage = (e) => {
  if (e.data.modelBuffer) {
    init(e.data.modelBuffer, e.data.simBuffer, e.data.simCanvas);
  }
  if ("simFieldMul" in e.data) simFieldMul = e.data.simFieldMul;
  if ("simSpeed" in e.data) simSpeed = e.data.simSpeed;
  if ("maxAge" in e.data) maxAge = e.data.maxAge;
  if ("oneTimeReset" in e.data) reset(e.data.oneTimeReset);

  updateLoop();
};

function reset(kind) {
  let updatePt;
  if (kind == "model") {
    updatePt = (i) => {
      psys.getParticle(i, prt);
      prt.age = Math.round((Math.random() - 0.5) * maxAge);
      prt.cx = prt.mx;
      prt.cy = prt.my;
      prt.cz = prt.mz;
      psys.updateParticle(i, prt.cx, prt.cy, prt.cz, prt.age);
    };
  } //
  else return;
  for (let i = 0; i < psys.count; ++i) {
    updatePt(i);
  }
}

function updateSimulation(dt) {
  // Update velocities
  const unisVelo = {
    sz: szDataTexture,
    txPos: txPos0,
    simFieldMul: simFieldMul,
    nzOfs: [10000.5, 10000.5, 10000.5],
    dt: dt,
  };
  let atmsVelo = [{attachment: txVelo}];
  let fbuVelo = twgl.createFramebufferInfo(gl, atmsVelo, szDataTexture, szDataTexture);
  twgl.bindFramebufferInfo(gl, fbuVelo);
  gl.viewport(0, 0, szDataTexture, szDataTexture);
  gl.useProgram(progiVelo.program);
  twgl.setBuffersAndAttributes(gl, progiVelo, sweepBufferInfo);
  twgl.setUniforms(progiVelo, unisVelo);
  // To DBG: Don't update, stick with initial value (normals)
  twgl.drawBufferInfo(gl, sweepBufferInfo);

  // Retrieve data
  twgl.bindFramebufferInfo(gl, fbuVelo);
  gl.readPixels(0, 0, szDataTexture, szDataTexture, gl.RGBA, gl.FLOAT, arrVelo);

  // Update positions: always tx0 => tx1
  const unisPosUpdate = {
    sz: szDataTexture,
    txPrev: txPos0,
    txVelo: txVelo,
    simSpeed: simSpeed * 0.1, // TODO DBG
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
  for (let i = 0; i < psys.count; ++i) {
    updateParticle(i, dt);
  }

  const t1 = Date.now();
  const elapsed = t1 - lastUpdateTime;
  lastUpdateTime = t0;

  // console.log(`Update: ${elapsed} msec`);

  // TODO: shoot for 16 msec, adaptively, from t0
  setTimeout(updateLoop, 0);
}
