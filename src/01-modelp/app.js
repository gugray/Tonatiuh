import {loadModelFromPLY, ModelPoint} from "./model.js";
import {simplex3curl} from "./curl.js";
import {connectAudioAPI, setGain, updateFFT} from "./fft.js";
import * as noise from "./noise.js";
import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import Stats from "./mystats.js";
import {EffectComposer} from "three/addons/postprocessing/EffectComposer.js";
import {RenderPass} from "three/addons/postprocessing/RenderPass.js";
import {BokehPass} from "three/addons/postprocessing/BokehPass.js";
import {OutputPass} from "three/addons/postprocessing/OutputPass.js";
import {RGBShiftShader} from "three/addons/shaders/RGBShiftShader.js";

// TO-DO
// OK Bring funs to live
// OK Bring shadows to live
// -- Move lights? add spotlights? add bloom filter?
// OK Add yellow BG lines?
// OK Show volume
// XX Move non-curl update into web worker too
// -- Ease into new states
// -- Neater transitions between simulation and model
// -- Neater maxAge changes
// -- Fade in+out in simulation, not appear/disappear

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";

const mat = new THREE.Matrix4();
mat.makeRotationY(Math.PI * 0.5);
const model = await loadModelFromPLY(THREE, modelUrl, mat);

const shadowMapSz = 4096;
const shadowCamDim = 40;

const ctrl = {
  modelScale: 36,
  renderBG: true,
  bgLinesPerFrame: 0.2,
  renderScene: true,
  useEffectsComposer: false,
  preserveBuffer: false,
  pulseSize: false,
  useShadow: false,
  gain: 0.01,
  runSimulation: false,
  simFieldMul: 2.5,
  simSpeed: 0.001,
  maxAge: 24000,
  oneTimeReset: null,
};

const startTime = Date.now();
let lastTime = startTime;

const state = {
  dT: 0,
  time: 0,
  time1: 0,
  time2: 0,
  time3: 0,
  time4: 0,
  frameIx: 0,
  lo: 0,
  mid: 0,
  hi: 0,
  vol: 0,
}

let dyn;

const elmFPS = document.getElementById("fps");
const elmVolumeVal = document.getElementById("volumeVal");
const elmVolume = document.getElementById("volume");
const elmCanv2 = document.getElementById("canv2");

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
  if (dirLight1) dirLight1.castShadow = ctrl.useShadow;
  if (dirLight2) dirLight2.castShadow = ctrl.useShadow;
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
    running: ctrl.runSimulation,
    modelScale: ctrl.modelScale,
    simFieldMul: ctrl.simFieldMul,
    simSpeed: ctrl.simSpeed,
    maxAge: ctrl.maxAge,
    oneTimeReset: ctrl.oneTimeReset,
  };
  updater1.postMessage(msg);
  updater2.postMessage(msg);
  ctrl.oneTimeReset = null;
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
  light.shadow.camera.top = shadowCamDim;
  light.shadow.camera.left = -shadowCamDim;
  light.shadow.camera.bottom = -shadowCamDim;
  light.shadow.camera.right = shadowCamDim;
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 500;
  light.shadow.mapSize.set(shadowMapSz, shadowMapSz);
  light.shadow.radius = 4;
  light.castShadow = ctrl.useShadow;
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
stats.dom.style.display = "none";
document.body.appendChild(stats.dom);

const perm = {
  obj: new THREE.Object3D(),
  nrm: new THREE.Vector3(),
  hor: new THREE.Vector3(),
  unitZ: new THREE.Vector3(0, 0, 1),
  unitY: new THREE.Vector3(0, 1, 0),
  axis: new THREE.Vector3(),
  clr: new THREE.Color(),
  mpt: new ModelPoint(),
  allColors: [],
};

model.putAllOnModel();
for (let ix = 0; ix < model.count; ++ix)
  model.setPointAge(ix, Math.floor(ctrl.maxAge * Math.random()));
noise.seed(Math.random());
getAllColors();

function animate() {
  requestAnimationFrame(animate);

  if (ctrl.renderBG) dyn.renderBG(elmCanv2, perm, ctrl, state);

  const spectrum = updateFFT();
  if (spectrum) [state.lo, state.mid, state.hi, state.vol] = spectrum;
  else [state.lo, state.mid, state.hi, state.vol] = [0, 0, 0, 0];
  const volPercent = (state.vol / 2048 * 100).toFixed(2);
  elmVolumeVal.style.height = volPercent + "%";

  const now = Date.now();
  state.frameIx += 1;
  state.dT = now - lastTime;
  state.time += state.dT;
  lastTime = now;

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

  if (ctrl.renderScene) {

    dyn.updateInstances(perm, ctrl, state, model, mesh);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();

    if (ctrl.useEffectsComposer) composer.render();
    else {
      if (ctrl.preserveBuffer) renderer.clearDepth();
      else renderer.clear();
      renderer.render(scene, camera);
    }
  }
  // else if (renderer) renderer.clear();

  stats.update();
  elmFPS.innerText = stats.fps();
}

function toggleMetrics() {
  const elms = document.querySelectorAll(".metric");
  if (elms.length == 0) return;
  let newDisplay = "block";
  if (elms[0].style.display == "block") newDisplay = "none";
  elms.forEach(e => e.style.display = newDisplay);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
  elmCanv2.width = window.innerWidth;
  elmCanv2.height = window.innerHeight;
}

onWindowResize();
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
    toggleMetrics();
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

function getAllColors() {
  for (let i = 0; i < model.count; ++i) {
    model.getPoint(i, perm.mpt);
    perm.clr.set(perm.mpt.r / 64, perm.mpt.g / 64, perm.mpt.b / 64);
    perm.allColors.push("#" + perm.clr.getHexString());
  }
}