import {loadModelFromPLY, ModelPoint} from "./model.js";
import {simplex3curl} from "./curl.js";
import * as noise from "./noise.js";
import * as THREE from "three";

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";

const mat = new THREE.Matrix4();
mat.makeRotationY(Math.PI * 0.5);
const model = await loadModelFromPLY(THREE, modelUrl, mat);

const ctrl = {
  modelScale: 36,
  preserveBuffer: false,
  simFieldMul: 2.5,
  simSpeed: 0.001,
  maxAge: 24000,
};

const perm = {
  obj: new THREE.Object3D(),
  nrm: new THREE.Vector3(),
  hor: new THREE.Vector3(),
  unitZ: new THREE.Vector3(0, 0, 1),
  unitY: new THREE.Vector3(0, 1, 0),
  axis: new THREE.Vector3(),
  clr: new THREE.Color(),
  mpt: new ModelPoint(),
};

const startTime = Date.now();
let lastTime = startTime;

const state = {
  time: 0,
};

noise.seed(0.42);

const updater1 = new Worker("update_worker.js");
const updater2 = new Worker("update_worker.js");
function initUpdater(updater, batchSz, batchMod) {
  updater.postMessage({
    batchSz, batchMod,
    array: model.array,
  });
}
initUpdater(updater1, 2, 0);
initUpdater(updater2, 2, 1);
function updateUpdaters() {
  if (!updater1) return;
  const msg = {
    running: true,
    modelScale: ctrl.modelScale,
    simFieldMul: ctrl.simFieldMul,
    simSpeed: ctrl.simSpeed,
    maxAge: ctrl.maxAge,
  };
  updater1.postMessage(msg);
  updater2.postMessage(msg);
}
updateUpdaters();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.015);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const camPanGroup = new THREE.Group();
camPanGroup.position.z = 50;
camPanGroup.add(camera);
const camAltitudeGroup = new THREE.Group();
camAltitudeGroup.add(camPanGroup);
const camAzimuthGroup = new THREE.Group();
camAzimuthGroup.add(camAltitudeGroup);
scene.add(camAzimuthGroup);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("canv3"),
  preserveDrawingBuffer: true,
  alpha: true,
});
renderer.autoClear = false;
renderer.shadowMap.enabled = false;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

function makeDirLight(x, y, z, intensity) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  return light;
}

const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(ambientLight);

const dirLight1 = makeDirLight(-100, 50, 100, 0.8);
scene.add(dirLight1);

const dirLight2 = makeDirLight(0, 100, -10, 0.6);
scene.add(dirLight2);

const pointLight = new THREE.PointLight(0xffffff, 0, 0, 1.8);
scene.add(pointLight);


const geometry = new THREE.BoxGeometry(0.2, 1.0, 0.2);
const material = new THREE.MeshPhongMaterial({ transparent: true });

const mesh = new THREE.InstancedMesh(geometry, material, model.count);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);

model.putAllOnModel();
for (let ix = 0; ix < model.count; ++ix) {
  model.setPointAge(ix, Math.floor(ctrl.maxAge * Math.random()));
  model.getPoint(ix, perm.mpt);
  perm.clr.set(perm.mpt.r / 64, perm.mpt.g / 64, perm.mpt.b / 64);
}

function updateInstances(perm, ctrl, state, model, mesh) {

  // const pointTo = "surface";
  const pointTo = "field";

  for (let i = 0; i < model.count; ++i) {

    model.getPoint(i, perm.mpt);

    perm.obj.scale.set(1, 1, 1);
    perm.obj.scale.x = perm.obj.scale.z = 1;
    perm.obj.position.set(perm.mpt.cx * ctrl.modelScale, perm.mpt.cy * ctrl.modelScale, perm.mpt.cz * ctrl.modelScale);

    // Where should boxes point? Flow field, or surface normal
    if (pointTo == "surface") {
      perm.nrm.set(perm.mpt.nx, perm.mpt.ny, perm.mpt.nz);
      rotateTmpObjToNrm(perm);
    }
    // Flow field
    else if (pointTo == "field") {
      perm.nrm.set(perm.mpt.vx, perm.mpt.vy, perm.mpt.vz);
      perm.nrm.normalize();
      rotateTmpObjToNrm2(perm);
    }

    perm.obj.updateMatrix();
    mesh.setMatrixAt(i, perm.obj.matrix);
    perm.clr.set(perm.mpt.r / 64, perm.mpt.g / 64, perm.mpt.b / 64);
    mesh.setColorAt(i, perm.clr);
    mesh.material.opacity = 1.0;
  }
}

function rotateTmpObjToNrm(perm) {
  perm.obj.rotation.z = Math.atan2(perm.nrm.y, perm.nrm.x);
  perm.hor.set(perm.nrm.x, perm.nrm.y, 0).normalize();
  perm.obj.rotation.y = -Math.atan2(perm.hor.z, perm.hor.x);
  perm.obj.rotation.x = -Math.atan2(perm.nrm.dot(perm.unitZ), perm.nrm.dot(perm.nrm.clone().cross(perm.unitZ)));
}


function rotateTmpObjToNrm2(perm) {
  const angle = perm.unitY.angleTo(perm.nrm);
  perm.axis.crossVectors(perm.unitY, perm.nrm).normalize();
  perm.obj.setRotationFromAxisAngle(perm.axis, angle);
}


function animate() {
  const now = Date.now();
  state.time += (now - lastTime);
  lastTime = now;

  pointLight.position.set(
    20 * Math.sin(state.time * 0.0003),
    5,
    12 * Math.cos(state.time * 0.0003)
  );
  pointLight.intensity = 50;

  updateInstances(perm, ctrl, state, model, mesh);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();

  renderer.clear();
  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

onWindowResize();
animate();

window.addEventListener('resize', onWindowResize);

document.body.addEventListener("keydown", e => {
  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
  }
});
