import {loadModelFromPLY, ModelPoint} from "./model.js";
import {simplex3curl} from "./curl.js";
import {connectAudioAPI, setGain, updateFFT} from "../fft.js";
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
// -- Bring funs to live
// -- Bring shadows to live
// -- Move lights? add spotlights? add bloom filter?
// -- Add yellow BG lines?
// OK Show volume
// -- Move non-curl update into web worker too

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";
const modelScale = 36;

const mat = new THREE.Matrix4();
mat.makeRotationY(Math.PI * 0.5);
const model = await loadModelFromPLY(THREE, modelUrl, mat);

const useEffectsComposer = false;
let preserveBuffer = false;
const pulseSize = false;
const useShadow = false;
const shadowMapSz = 4096;
const shadowCamDim = 40;

const startTime = Date.now();
let lastTime = startTime;
let [lo, mid, hi, vol] = [0, 0, 0, 0];
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
  setGain(live.opts.gain);
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
    running: live.opts.flowSim,
    modelScale: live.opts.modelScale,
    simFieldMul: live.opts.simFieldMul,
    simSpeed: live.opts.simSpeed,
    maxAge: live.opts.maxAge,
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
if (useEffectsComposer) {
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
}

function makeDirLight(x, y, z, intensity) {
  const light = new THREE.DirectionalLight(0xffffff, intensity);
  light.position.set(x, y, z);
  if (useShadow) {
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

const tmpObj = new THREE.Object3D();
const tmpNrm = new THREE.Vector3();
const tmpHor = new THREE.Vector3();
const tmpUnitZ = new THREE.Vector3(0, 0, 1);
const tmpUnitY = new THREE.Vector3(0, 1, 0);
const tmpClr = new THREE.Color();
const tmpMpt = new ModelPoint();

model.putAllOnModel();
for (let ix = 0; ix < model.count; ++ix)
  model.setPointAge(ix, Math.floor(live.opts.maxAge * Math.random()));
noise.seed(Math.random());
updateFromModel(0);

function rotateTmpObjToNrm() {
  tmpObj.rotation.z = Math.atan2(tmpNrm.y, tmpNrm.x);
  tmpHor.set(tmpNrm.x, tmpNrm.y, 0).normalize();
  tmpObj.rotation.y = -Math.atan2(tmpHor.z, tmpHor.x);
  tmpObj.rotation.x = -Math.atan2(tmpNrm.dot(tmpUnitZ), tmpNrm.dot(tmpNrm.clone().cross(tmpUnitZ)));
}

function rotateTmpObjToNrm2() {
  const angle = tmpUnitY.angleTo(tmpNrm);
  const axis = new THREE.Vector3().crossVectors(tmpUnitY, tmpNrm).normalize();
  tmpObj.setRotationFromAxisAngle(axis, angle);
}

function updateSimulation(dT) {

  for (let i = 0; i < model.count; ++i) {

    model.getPoint(i, tmpMpt);

    // Update instance's matrix and color
    tmpObj.scale.set(1, 1, 1);
    tmpObj.scale.y = 1 + hi / 256;
    tmpObj.scale.x = tmpObj.scale.z = 1 + mid / 256;

    tmpObj.position.set(tmpMpt.cx * modelScale, tmpMpt.cy * modelScale, tmpMpt.cz * modelScale);
    tmpNrm.set(tmpMpt.vx, tmpMpt.vy, tmpMpt.vz);
    tmpNrm.normalize();
    rotateTmpObjToNrm2();
    tmpObj.updateMatrix();
    mesh.setMatrixAt(i, tmpObj.matrix);
    tmpClr.set(tmpMpt.r / 64, tmpMpt.g / 64, tmpMpt.b / 64);
    mesh.setColorAt(i, tmpClr);
    mesh.material.opacity = 1.0;
  }
}

function updateFromModel(time) {

  mesh.rotation.y = Math.sin(time * 0.0002) * 0.3;

  for (let i = 0; i < model.count; ++i) {
    model.getPoint(i, tmpMpt);
    tmpObj.position.set(tmpMpt.cx * modelScale, tmpMpt.cy * modelScale, tmpMpt.cz * modelScale);

    tmpNrm.set(tmpMpt.nx, tmpMpt.ny, tmpMpt.nz);
    rotateTmpObjToNrm();

    // tmpObj.rotation.x = Math.PI * 0.25;
    // tmpObj.rotation.y = Math.PI * 0.25;
    //
    // tmpObj.rotation.y =
    //   Math.sin(tmpMpt.cx / 4 + time * 0.0005) +
    //   Math.sin(tmpMpt.cy / 4 + time * 0.0005) +
    //   Math.sin(tmpMpt.cz / 4 + time * 0.0005);
    // tmpObj.rotation.x = tmpObj.rotation.y * 0.5;

    if (pulseSize) {
      tmpObj.scale.y = 1 + Math.sin(time * 0.001) * 1;
    }
    tmpObj.scale.y = 1 + hi / 256;
    tmpObj.scale.x = tmpObj.scale.z = 1 + Math.sqrt(mid) / 16;

    tmpObj.updateMatrix();
    mesh.setMatrixAt(i, tmpObj.matrix);
    tmpClr.set(tmpMpt.r / 64, tmpMpt.g / 64, tmpMpt.b / 64);
    mesh.setColorAt(i, tmpClr);
  }
}

function animate() {
  requestAnimationFrame(animate);

  const spectrum = updateFFT();
  if (spectrum) [lo, mid, hi, vol] = spectrum;
  else [lo, mid, hi, vol] = [0, 0, 0, 0];
  const volPercent = (vol / 2048 * 100).toFixed(2);
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
  if (live.opts.flowSim) updateSimulation(now - lastTime);
  else updateFromModel(now - startTime);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  lastTime = now;

  if (useEffectsComposer) composer.render();
  else {
    if (preserveBuffer) renderer.clearDepth();
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
    connectAudioAPI(live.opts.gain);
  }
  else if (e.key == "c") {
    renderer.clear();
  }
  else if (e.key == "p") {
    preserveBuffer = !preserveBuffer;
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
