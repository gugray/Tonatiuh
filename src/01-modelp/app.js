import {loadModelFromPLY, ModelPoint} from "./model.js";
import {simplex3curl} from "./curl.js";
import {connectAudioAPI, setGain, updateFFT} from "./fft.js";
import * as noise from "./noise.js";
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import Stats from "three/addons/libs/stats.module.js";
import {EffectComposer} from "three/addons/postprocessing/EffectComposer.js";
import {RenderPass} from "three/addons/postprocessing/RenderPass.js";
import {BokehPass} from "three/addons/postprocessing/BokehPass.js";
import {OutputPass} from "three/addons/postprocessing/OutputPass.js";
import {RGBShiftShader} from "three/addons/shaders/RGBShiftShader.js";

// TODO
// OK Bring funs to live
// OK Bring shadows to live
// -- Move lights? add spotlights? add bloom filter?
// -- Add yellow BG lines?
// OK Show volume
// -- Move non-curl update into web worker too
// -- Ease into new states
// -- Neater transitions between simulation and model
// -- Neater maxAge changes
// -- Fade in+out in simulation, not appear/disappear

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";
const modelScale = 36;

const mat = new THREE.Matrix4();
mat.makeRotationY(Math.PI * 0.5);
const model = await loadModelFromPLY(THREE, modelUrl, mat);

const shadowMapSz = 4096;
const shadowCamDim = 40;

const ctrl = {
  useEffectsComposer: false,
  preserveBuffer: false,
  pulseSize: false,
  useShadow: false,
  gain: 0.01,
  flowSim: false,
  simFieldMul: 2.5,
  simSpeed: 0.001,
  maxAge: 24000,
};

const startTime = Date.now();
const state = {
  lastTime: startTime,
  lo: 0,
  mid: 0,
  hi: 0,
  vol: 0,
}

let dyn;

const elmVolumeVal = document.getElementById("volumeVal");
const elmVolume = document.getElementById("volume");

const camRotAccel = new THREE.Vector4(); // x: altitude, y: azimuth
const camRotSpeed = new THREE.Vector4(); // x: altitude, y: azimuth
const camPanAccel = new THREE.Vector3(); // x, y: pan; z: distance
const camPanSpeed = new THREE.Vector3(); // x, y: pan; z: distance

let liveStr, live;
async function getLive() {
  const r = await fetch("live.js");
  let str = await r.text();
  str = str.replaceAll("///","");
  str = str.replaceAll("export","");
  if (str == liveStr) return;
  liveStr = str;
  live = Function(liveStr)();
  dyn = live.dyn;  
  live.updateCtrl(ctrl);
  setGain(ctrl.gain);
  updateUpdaters();
}
await getLive();
setInterval(async () => await getLive(), 100);

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
    running: ctrl.flowSim,
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
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
// const controls = new OrbitControls(camera, renderer.domElement);

let composer = null;
if (ctrl.useEffectsComposer) {
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
}

function makeDirLight(x, y, z, intensity) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  if (ctrl.useShadow) {
    light.castShadow = true;
    light.shadow.camera.top = shadowCamDim;
    light.shadow.camera.left = -shadowCamDim;
    light.shadow.camera.bottom = -shadowCamDim;
    light.shadow.camera.right = shadowCamDim;
    light.shadow.camera.near = 10;
    light.shadow.camera.far = 500;
    light.shadow.mapSize.set(shadowMapSz, shadowMapSz);
    light.shadow.radius = 4;
  }
  return light;
}

const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
scene.add(ambientLight);

const dirLight1 = makeDirLight(-100, 50, 100, 0.8);
scene.add(dirLight1);

const dirLight2 = makeDirLight(0, 100, -10, 0.6);
scene.add(dirLight2);
// scene.add(new THREE.CameraHelper(dirLight2.shadow.camera));

const geometry = new THREE.BoxGeometry(0.2, 1.0, 0.2);
const material = new THREE.MeshPhongMaterial({ transparent: true });

const mesh = new THREE.InstancedMesh(geometry, material, model.count);
mesh.castShadow = true;
mesh.receiveShadow = true;
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);

const stats = new Stats();
document.body.appendChild(stats.dom);

const perm = {
  obj: new THREE.Object3D(),
  nrm: new THREE.Vector3(),
  hor: new THREE.Vector3(),
  unitZ: new THREE.Vector3(0, 0, 1),
  unitY: new THREE.Vector3(0, 1, 0),
  clr: new THREE.Color(),
  mpt: new ModelPoint(),
};

model.putAllOnModel();
for (let ix = 0; ix < model.count; ++ix)
  model.setPointAge(ix, Math.floor(ctrl.maxAge * Math.random()));
noise.seed(Math.random());
updateFromModel(0);

function rotateTmpObjToNrm() {
  perm.obj.rotation.z = Math.atan2(perm.nrm.y, perm.nrm.x);
  perm.hor.set(perm.nrm.x, perm.nrm.y, 0).normalize();
  perm.obj.rotation.y = -Math.atan2(perm.hor.z, perm.hor.x);
  perm.obj.rotation.x = -Math.atan2(perm.nrm.dot(perm.unitZ), perm.nrm.dot(perm.nrm.clone().cross(perm.unitZ)));
}

function rotateTmpObjToNrm2() {
  const angle = perm.unitY.angleTo(perm.nrm);
  const axis = new THREE.Vector3().crossVectors(perm.unitY, perm.nrm).normalize();
  perm.obj.setRotationFromAxisAngle(axis, angle);
}

function updateSimulation(dT) {

  for (let i = 0; i < model.count; ++i) {

    model.getPoint(i, perm.mpt);

    // Update instance's matrix and color
    perm.obj.scale.set(1, 1, 1);
    perm.obj.scale.y = 1 + state.hi / 256;
    perm.obj.scale.x = perm.obj.scale.z = 1 + state.mid / 256;

    perm.obj.position.set(perm.mpt.cx * modelScale, perm.mpt.cy * modelScale, perm.mpt.cz * modelScale);
    perm.nrm.set(perm.mpt.vx, perm.mpt.vy, perm.mpt.vz);
    perm.nrm.normalize();
    rotateTmpObjToNrm2();
    perm.obj.updateMatrix();
    mesh.setMatrixAt(i, perm.obj.matrix);
    perm.clr.set(perm.mpt.r / 64, perm.mpt.g / 64, perm.mpt.b / 64);
    mesh.setColorAt(i, perm.clr);
    mesh.material.opacity = 1.0;
  }
}

function updateFromModel(time) {

  mesh.rotation.y = Math.sin(time * 0.0002) * 0.3;

  for (let i = 0; i < model.count; ++i) {
    model.getPoint(i, perm.mpt);
    perm.obj.position.set(perm.mpt.cx * modelScale, perm.mpt.cy * modelScale, perm.mpt.cz * modelScale);

    perm.nrm.set(perm.mpt.nx, perm.mpt.ny, perm.mpt.nz);
    rotateTmpObjToNrm();

    // perm.obj.rotation.x = Math.PI * 0.25;
    // perm.obj.rotation.y = Math.PI * 0.25;
    //
    // perm.obj.rotation.y =
    //   Math.sin(perm.mpt.cx / 4 + time * 0.0005) +
    //   Math.sin(perm.mpt.cy / 4 + time * 0.0005) +
    //   Math.sin(perm.mpt.cz / 4 + time * 0.0005);
    // perm.obj.rotation.x = perm.obj.rotation.y * 0.5;

    if (ctrl.pulseSize) {
      perm.obj.scale.y = 1 + Math.sin(time * 0.001) * 1;
    }
    perm.obj.scale.y = 1 + state.hi / 256;
    perm.obj.scale.x = perm.obj.scale.z = 1 + Math.sqrt(state.mid) / 16;

    perm.obj.updateMatrix();
    mesh.setMatrixAt(i, perm.obj.matrix);
    perm.clr.set(perm.mpt.r / 64, perm.mpt.g / 64, perm.mpt.b / 64);
    mesh.setColorAt(i, perm.clr);
  }
}

function animate() {
  requestAnimationFrame(animate);

  const spectrum = updateFFT();
  if (spectrum) [state.lo, state.mid, state.hi, state.vol] = spectrum;
  else [state.lo, state.mid, state.hi, state.vol] = [0, 0, 0, 0];
  const volPercent = (state.vol / 2048 * 100).toFixed(2);
  elmVolumeVal.style.height = volPercent + "%";

  camRotSpeed.add(camRotAccel);
  camPanSpeed.add(camPanAccel);
  camAltitudeGroup.rotation.x += camRotSpeed.x;
  camAzimuthGroup.rotation.y += camRotSpeed.y;
  camPanGroup.position.x += camPanSpeed.x;
  camPanGroup.position.y += camPanSpeed.y;
  camPanGroup.position.z += camPanSpeed.z;

  camRotSpeed.multiplyScalar(0.985);
  if (Math.abs(camRotSpeed.y) < 0.0001) camRotSpeed.y = 0;
  if (Math.abs(camRotSpeed.x) < 0.0001) camRotSpeed.x = 0;
  camPanSpeed.multiplyScalar(0.985);
  if (Math.abs(camPanSpeed.y) < 0.0001) camPanSpeed.y = 0;
  if (Math.abs(camPanSpeed.x) < 0.0001) camPanSpeed.x = 0;
  if (Math.abs(camPanSpeed.z) < 0.0001) camPanSpeed.z = 0;

  const now = Date.now();
  if (ctrl.flowSim) updateSimulation(now - state.lastTime);
  else updateFromModel(now - startTime);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  state.lastTime = now;

  if (ctrl.useEffectsComposer) composer.render();
  else {
    if (ctrl.preserveBuffer) renderer.clearDepth();
    else renderer.clear();
    renderer.render(scene, camera);
  }

  stats.update();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

animate();

window.addEventListener('resize', onWindowResize);

document.body.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key == "Enter") {
    document.documentElement.requestFullscreen();
    e.preventDefault();
    e.stopPropagation();
  }
  else if (e.key == "a") {
    connectAudioAPI(ctrl.gain);
  }
  else if (e.key == "c") {
    renderer.clear();
  }
  else if (e.key == "p") {
    ctrl.preserveBuffer = !ctrl.preserveBuffer;
  }
  else if (e.key == "m") {
    if (elmVolume.style.display == "block") elmVolume.style.display = "none";
    else elmVolume.style.display = "block";
  }
  else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    if (e.key == "ArrowLeft") camRotAccel.y = -0.0005;
    else if (e.key == "ArrowRight") camRotAccel.y = 0.0005;
    else if (e.key == "ArrowUp") camRotAccel.x = -0.0005;
    else if (e.key == "ArrowDown") camRotAccel.x = 0.0005;
  }
  else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key == "ArrowLeft") camPanAccel.x = -0.01;
    else if (e.key == "ArrowRight") camPanAccel.x = 0.01;
    else if (e.key == "ArrowUp") camPanAccel.y = 0.01;
    else if (e.key == "ArrowDown") camPanAccel.y = -0.01;
  }
  else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    if (e.key == "ArrowUp") camPanAccel.z = -0.01;
    else if (e.key == "ArrowDown") camPanAccel.z = 0.01;
  }
});

document.body.addEventListener("keyup", e => {
  if (e.key == "ArrowLeft" || e.key == "ArrowRight" ||
    e.key == "ArrowUp" || e.key == "ArrowDown") {
    camRotAccel.set(0, 0, 0, 0);
    camPanAccel.set(0, 0, 0);
  }
});
