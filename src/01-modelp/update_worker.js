import * as THREE from "three";
import {simplex3curl} from "./curl.js";
import {Model, ModelPoint} from "./model.js";

const tmpMpt = new ModelPoint();

function updateModelPoint(model, i, dT, modelScale, simSpeed, simFieldMul, maxAge) {

  model.getPoint(i, tmpMpt);

  if (tmpMpt.age > maxAge && Math.random() < 0.01) {
    tmpMpt.age = Math.round((Math.random() - 0.5) * maxAge);
    tmpMpt.cx = tmpMpt.mx;
    tmpMpt.cy = tmpMpt.my;
    tmpMpt.cz = tmpMpt.mz;
  }

  let curl = simplex3curl(tmpMpt.cx * simFieldMul, tmpMpt.cy * simFieldMul, tmpMpt.cz * simFieldMul);
  if (curl[0] != curl[0] || curl[1] != curl[1] || curl[2] != curl[2]) {
    // console.log(curl);
    curl = [0, 0, 0];
  }
  tmpMpt.vx = simSpeed * curl[0];
  tmpMpt.vy = simSpeed * curl[1];
  tmpMpt.vz = simSpeed * curl[2];
  tmpMpt.cx += tmpMpt.vx;
  tmpMpt.cy += tmpMpt.vy;
  tmpMpt.cz += tmpMpt.vz;
  tmpMpt.age += dT;
  model.updatePoint(i, tmpMpt.cx, tmpMpt.cy, tmpMpt.cz, tmpMpt.vx, tmpMpt.vy, tmpMpt.vz, tmpMpt.age);
}

let model, batchSz, batchMod;
let modelScale, simFieldMul, simSpeed, maxAge;
let running = false;
let lastUpdateTime = null;

onmessage = (e) => {
  if (e.data.array) model = new Model(e.data.array);
  if ("batchSz" in e.data) batchSz = e.data.batchSz;
  if ("batchMod" in e.data) batchMod = e.data.batchMod;
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
      model.getPoint(i, tmpMpt);
      tmpMpt.age = Math.round((Math.random() - 0.5) * maxAge);
      tmpMpt.cx = tmpMpt.mx;
      tmpMpt.cy = tmpMpt.my;
      tmpMpt.cz = tmpMpt.mz;
      model.updatePoint(i, tmpMpt.cx, tmpMpt.cy, tmpMpt.cz, tmpMpt.vx, tmpMpt.vy, tmpMpt.vz, tmpMpt.age);
    }
  }
  else return;
  for (let i = 0; i < model.count; ++i) {
    if ((i % batchSz) != batchMod) continue;
    updatePt(i);
  }
}

function updateLoop() {

  if (!running) return;

  let dT = 10;
  const now = Date.now();
  if (lastUpdateTime != null) dT = now - lastUpdateTime;
  lastUpdateTime = now;

  for (let i = 0; i < model.count; ++i) {
    if ((i % batchSz) != batchMod) continue;
    updateModelPoint(model, i, dT, modelScale, simSpeed, simFieldMul, maxAge);
  }

  setTimeout(updateLoop, 0);
}
