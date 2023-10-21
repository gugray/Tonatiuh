import * as THREE from "three";
import {simplex3curl} from "./curl.js";
import {Model, ModelPoint} from "./model.js";

const tmpMpt = new ModelPoint();

function updateModelPoint(model, i, dT, modelScale, simSpeed, simFieldMul, maxAge) {

  model.getPoint(i, tmpMpt);

  if (tmpMpt.age > maxAge) {
    tmpMpt.age = 0;
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

onmessage = (e) => {
  const {array, dT, modelScale, simFieldMul, simSpeed, maxAge} = e.data;
  // console.log("dT: " + dT);
  const model = new Model(array);
  for (let i = 0; i < model.count; ++i) {
    // if ((i % 6) != 0) continue;
    updateModelPoint(model, i, dT, modelScale, simSpeed, simFieldMul, maxAge);
  }
  postMessage("done");
};

