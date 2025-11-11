import * as THREE from "three";
import {simplex3curl} from "./curl.js";
import {ParticleSystem, ParticleData} from "./particleSystem.js";

let psys;
let modelScale, simFieldMul, simSpeed, maxAge;
let running = false;
let lastUpdateTime = null;
const prt = new ParticleData();

function updateParticle(psys, i, dT, modelScale, simSpeed, simFieldMul, maxAge) {

  psys.getParticle(i, prt);

  let ageLimitRatio = prt.age / maxAge;
  if (ageLimitRatio > Math.random() + 0.5) {
  // if (tmpMpt.age > maxAge && Math.random() < 0.0001) {
    prt.age = Math.round((Math.random() - 0.5) * maxAge);
    prt.cx = prt.mx;
    prt.cy = prt.my;
    prt.cz = prt.mz;
  }

  let curl = simplex3curl(prt.cx * simFieldMul, prt.cy * simFieldMul, prt.cz * simFieldMul);
  if (curl[0] != curl[0] || curl[1] != curl[1] || curl[2] != curl[2]) {
    // console.log(curl);
    curl = [0, 0, 0];
  }
  prt.vx = simSpeed * curl[0];
  prt.vy = simSpeed * curl[1];
  prt.vz = simSpeed * curl[2];
  prt.cx += prt.vx;
  prt.cy += prt.vy;
  prt.cz += prt.vz;
  prt.age += dT;
  psys.updateParticle(i, prt.cx, prt.cy, prt.cz, prt.vx, prt.vy, prt.vz, prt.age);
}

onmessage = (e) => {
  if (e.data.modelBuffer) {
    psys = new ParticleSystem(e.data.modelBuffer, e.data.simBuffer);
  }
  if ("modelScale" in e.data) modelScale = e.data.modelScale;
  if ("simFieldMul" in e.data) simFieldMul = e.data.simFieldMul;
  if ("simSpeed" in e.data) simSpeed = e.data.simSpeed;
  if ("maxAge" in e.data) maxAge = e.data.maxAge;
  if ("running" in e.data) running = e.data.running;
  if ("oneTimeReset" in e.data) reset(e.data.oneTimeReset);

  if (running) updateLoop();
};

function reset(kind) {
  let updatePt;
  if (kind == "model") {
    updatePt = i => {
      psys.getParticle(i, prt);
      prt.age = Math.round((Math.random() - 0.5) * maxAge);
      prt.cx = prt.mx;
      prt.cy = prt.my;
      prt.cz = prt.mz;
      psys.updateParticle(i, prt.cx, prt.cy, prt.cz, prt.vx, prt.vy, prt.vz, prt.age);
    }
  }
  else return;
  for (let i = 0; i < psys.count; ++i) {
    updatePt(i);
  }
}

function updateLoop() {

  if (!running) return;

  let dT = 10;
  const now = Date.now();
  if (lastUpdateTime != null) dT = now - lastUpdateTime;
  lastUpdateTime = now;

  for (let i = 0; i < psys.count; ++i) {
    updateParticle(psys, i, dT, modelScale, simSpeed, simFieldMul, maxAge);
  }

  setTimeout(updateLoop, 0);
}
