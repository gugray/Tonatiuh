import {loadModelFromPLY, ParticleData} from "./particleSystem.js";
import {simplex3curl} from "./curl.js";
import * as noise from "./noise.js";
import * as THREE from "three";

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";

const mat = new THREE.Matrix4();
mat.makeRotationY(Math.PI * 0.5);
const psys = await loadModelFromPLY(THREE, modelUrl, mat);

const ctrl = {
  modelScale: 36,
  preserveBuffer: false,
  simFieldMul: 2.5, // 2.5 for original
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
  prt: new ParticleData(),
};

const camRotAccel = new THREE.Vector4(); // x: altitude, y: azimuth
const camRotSpeed = new THREE.Vector4(); // x: altitude, y: azimuth
const camPanAccel = new THREE.Vector3(); // x, y: pan; z: distance
const camPanSpeed = new THREE.Vector3(); // x, y: pan; z: distance

const startTime = Date.now();
let lastTime = startTime;
const state = { time: 0 };
noise.seed(0.42);

const simCanvas = document.createElement("canvas").transferControlToOffscreen();

const updater = new Worker("gpuUpdateWorker.js");
updater.postMessage({
  simCanvas: simCanvas,
  modelBuffer: psys.modelBuffer,
  simBuffer: psys.simBuffer,
  simFieldMul: ctrl.simFieldMul,
  simSpeed: ctrl.simSpeed,
  maxAge: ctrl.maxAge,
}, [simCanvas]);

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

const mesh = new THREE.InstancedMesh(geometry, material, psys.count);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);

psys.putAllOnModel();
for (let ix = 0; ix < psys.count; ++ix) {
  psys.setParticleAge(ix, Math.floor(ctrl.maxAge * Math.random()));
  psys.getParticle(ix, perm.prt);
  perm.clr.set(perm.prt.r / 64, perm.prt.g / 64, perm.prt.b / 64);
}

function updateInstances(perm, ctrl, state, psys, mesh) {

  // const pointTo = "surface";
  const pointTo = "field";

  for (let i = 0; i < psys.count; ++i) {

    psys.getParticle(i, perm.prt);

    perm.obj.scale.set(1, 1, 1);
    perm.obj.scale.x = perm.obj.scale.z = 1;
    perm.obj.position.set(perm.prt.cx * ctrl.modelScale, perm.prt.cy * ctrl.modelScale, perm.prt.cz * ctrl.modelScale);

    // Where should boxes point? Flow field, or surface normal
    if (pointTo == "surface") {
      perm.nrm.set(perm.prt.nx, perm.prt.ny, perm.prt.nz);
      rotateTmpObjToNrm(perm);
    }
    // Flow field
    else if (pointTo == "field") {
      perm.nrm.set(perm.prt.vx, perm.prt.vy, perm.prt.vz);
      perm.nrm.normalize();
      rotateTmpObjToNrm2(perm);
      // rotateTmpObjToNrm(perm);
    }

    perm.obj.updateMatrix();
    mesh.setMatrixAt(i, perm.obj.matrix);
    perm.clr.set(perm.prt.r / 64, perm.prt.g / 64, perm.prt.b / 64);
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

  pointLight.position.set(
    20 * Math.sin(state.time * 0.0003),
    5,
    12 * Math.cos(state.time * 0.0003)
  );
  pointLight.intensity = 50;

  updateInstances(perm, ctrl, state, psys, mesh);
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
    if (e.key == "ArrowLeft") camRotAccel.y = -0.0005;
    else if (e.key == "ArrowRight") camRotAccel.y = 0.0005;
    else if (e.key == "ArrowUp") camRotAccel.x = -0.0005;
    else if (e.key == "ArrowDown") camRotAccel.x = 0.0005;
  } else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key == "ArrowLeft") camPanAccel.x = 0.01;
    else if (e.key == "ArrowRight") camPanAccel.x = -0.01;
    else if (e.key == "ArrowUp") camPanAccel.y = -0.01;
    else if (e.key == "ArrowDown") camPanAccel.y = 0.01;
  } else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
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
