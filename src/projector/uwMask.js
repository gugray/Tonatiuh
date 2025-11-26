import * as twgl from "twgl.js";
import sSweepVert from "./shaders/sweep-vert.glsl";
import sCalcPosFrag from "./shaders/calc-mask-pos.glsl";
import sCalcVeloFrag from "./shaders/calc-mask-velo.glsl";
import {mulberry32} from "./random.js";
import {ParticleSystem, ParticleData} from "./particleSystem.js";
import * as THREE from "three";

const rand = mulberry32(0);
const prt = new ParticleData();

let psys;
let gl, sweepArrays, sweepBufferInfo, simArrays, simBufferInfo;
let szDataTexture;
let txVelo, arrVelo, progiVelo;
let txSurf;
let txPos0, txPos1, arrPos, progiPosUpdate;

const nzOfs0 = [0, 0, 0];
const nzOfs1 = [31.341, -43.23, 12.34];
const nzOfs2 = [-231.341, 124.23, -54.34];
let simFieldMul, simSpeed;
let stableAge, fadeInTime, fadeOutTime;
let reset = 0;
let lastUpdateTime = null;

onmessage = (e) => {
  if ("simFieldMul" in e.data) simFieldMul = e.data.simFieldMul;
  if ("simSpeed" in e.data) simSpeed = e.data.simSpeed;
  if ("stableAge" in e.data) stableAge = e.data.stableAge;
  if ("fadeInTime" in e.data) fadeInTime = e.data.fadeInTime;
  if ("fadeOutTime" in e.data) fadeOutTime = e.data.fadeOutTime;
  if ("reseed" in e.data) reseed();
  if ("reset" in e.data) reset = 1;
  if (e.data.modelBuffer) {
    init(e.data.modelBuffer, e.data.simBuffer, e.data.simCanvas);
    updateLoop();
  }
};

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

  // Single data texture for mask positions
  [_, txSurf] = createDataTexture(szDataTexture, "pos_age");

  // Single data texture for velocity
  [arrVelo, txVelo] = createDataTexture(szDataTexture, "normal_age");

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
    else if (initFrom == "normal_age") {
      data[i * 4] = prt.nx;
      data[i * 4 + 1] = prt.ny;
      data[i * 4 + 2] = prt.nz;
      data[i * 4 + 3] = prt.age;
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

function reseed() {
  nzOfs0[0] = 512 * Math.random() - 256;
  nzOfs0[1] = 512 * Math.random() - 256;
  nzOfs0[2] = 512 * Math.random() - 256;
  nzOfs1[0] = 512 * Math.random() - 256;
  nzOfs1[1] = 512 * Math.random() - 256;
  nzOfs1[2] = 512 * Math.random() - 256;
  nzOfs2[0] = 512 * Math.random() - 256;
  nzOfs2[1] = 512 * Math.random() - 256;
  nzOfs2[2] = 512 * Math.random() - 256;
}

const unitY = new THREE.Vector3(0, 1, 0);
const dir = new THREE.Vector3();
const quat = new THREE.Quaternion();

function updateParticle(i, dt) {
  psys.getParticle(i, prt);
  const prevAge = prt.age;

  prt.vx = arrVelo[i * 4];
  prt.vy = arrVelo[i * 4 + 1];
  prt.vz = arrVelo[i * 4 + 2];

  prt.cx = arrPos[i * 4];
  prt.cy = arrPos[i * 4 + 1];
  prt.cz = arrPos[i * 4 + 2];
  prt.age = arrPos[i * 4 + 3];

  dir.set(prt.vx, prt.vy, prt.vz);
  dir.normalize();
  quat.setFromUnitVectors(unitY, dir);
  prt.vqx = quat.x;
  prt.vqy = quat.y;
  prt.vqz = quat.z;
  prt.vqw = quat.w;

  // Previous age was <= 10000 (fading out) and now it's not: distance resets to 0
  // Otherwise distance grows
  if (prevAge <= -10000 && prt.age > -10000) prt.dist = 0;
  else prt.dist += dt;

  // prettier-ignore
  psys.updateParticle(i, prt.cx, prt.cy, prt.cz,
    prt.vx, prt.vy, prt.vz,
    prt.vqx, prt.vqy, prt.vqz, prt.vqw,
    prt.age, prt.dist);
}

function updateSimulation(dt) {
  // If simulation speed is 0, not updating: this makes particles not age
  // But update needs to run once for reset
  if (simSpeed == 0 && reset == 0) return;

  // Age is set in calc-velo
  //      0 < age           is what it is
  //  -9000 < age < 0       fading in
  // -19000 < age < -10000  fading out after stable life, until hitting -10000
  //          age < -20000  tells calc-pos to reset to surface store random starting age
  // First pass checks age, and decides if particle resets (age goes positive now)
  // Based on this, it gets velocity from noise field:
  // -- current position, or
  // -- surface position (after reset)
  // If just reset, sets age to -10000 - maxAge => this encodes new random age
  // Second pass adds velo to pos, or resets pos to surface
  // It copies age (or takes new random age)

  // Update velocities
  const unisVelo = {
    sz: szDataTexture,
    txSurf: txSurf,
    txPos: txPos0,
    simFieldMul: simFieldMul,
    nzOfs0: nzOfs0,
    nzOfs1: nzOfs1,
    nzOfs2: nzOfs2,
    stableAge: stableAge,
    fadeInTime: fadeInTime,
    fadeOutTime: fadeOutTime,
    reset: reset,
    dt: dt,
    rand: rand(),
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
    txSurf: txSurf,
    txPrev: txPos0,
    txVelo: txVelo,
    simSpeed: simSpeed * 1, // TODO DBG
    fadeInTime: fadeInTime,
    reset: reset,
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

  // Clear reset
  reset = 0;
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
