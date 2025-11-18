import * as THREE from "three";

// Permanent geometry ("app")
const camPanGroup = new THREE.Group();
const camAltitudeGroup = new THREE.Group();
const camAzimuthGroup = new THREE.Group();

// State
const camRotAccel = new THREE.Vector2(); // x: altitude, y: azimuth
const camRotSpeed = new THREE.Vector2(); // x: altitude, y: azimuth
const camPanAccel = new THREE.Vector3(); // x, y: pan; z: distance
const camPanSpeed = new THREE.Vector3(); // x, y: pan; z: distance
let lastCamTime = 0;

// Cache
const v2 = new THREE.Vector2();
const v3 = new THREE.Vector3();

// Current params; keep initial values in sync with fastCam()
let camRotThrust = 0.0003;
let camRotDamping = 0.985;
let camPanThrust = 0.008;
let camPanDamping = 0.985;

export function initCameraCrane(scene, camera) {
  camPanGroup.position.z = 50;
  camPanGroup.add(camera);
  camAltitudeGroup.add(camPanGroup);
  camAzimuthGroup.add(camAltitudeGroup);
  scene.add(camAzimuthGroup);

  lastCamTime = Date.now();
  setTimeout(camControlLoop, 30);
  initCamControlEvents();
}

export function slowCam() {
  camRotThrust = 0.00008;
  camRotDamping = 0.989;
  camPanThrust = 0.001;
  camPanDamping = 0.989;
}

export function fastCam() {
  // Keep in sync with params definition at top
  camRotThrust = 0.0003;
  camRotDamping = 0.985;
  camPanThrust = 0.008;
  camPanDamping = 0.985;
}

function initCamControlEvents() {
  document.body.addEventListener("keydown", (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      if (e.key == "ArrowLeft") camRotAccel.y = -camRotThrust;
      else if (e.key == "ArrowRight") camRotAccel.y = camRotThrust;
      else if (e.key == "ArrowUp") camRotAccel.x = -camRotThrust;
      else if (e.key == "ArrowDown") camRotAccel.x = camRotThrust;
    } //
    else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key == "ArrowLeft") camPanAccel.x = camPanThrust;
      else if (e.key == "ArrowRight") camPanAccel.x = -camPanThrust;
      else if (e.key == "ArrowUp") camPanAccel.y = -camPanThrust;
      else if (e.key == "ArrowDown") camPanAccel.y = camPanThrust;
    } //
    else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key == "ArrowUp") camPanAccel.z = -camPanThrust;
      else if (e.key == "ArrowDown") camPanAccel.z = camPanThrust;
    }
  });

  document.body.addEventListener("keyup", (e) => {
    if (e.key == "ArrowLeft" || e.key == "ArrowRight" || e.key == "ArrowUp" || e.key == "ArrowDown") {
      camRotAccel.set(0, 0);
      camPanAccel.set(0, 0, 0);
    }
  });
}

function camControlLoop() {
  const now = Date.now();
  const dt = now - lastCamTime;
  lastCamTime = now;

  setTimeout(camControlLoop, Math.max(1, 14 - dt));

  v2.copy(camRotAccel).multiplyScalar(dt * 0.1);
  camRotSpeed.add(v2);
  v2.copy(camRotSpeed).multiplyScalar(dt * 0.1);
  camAltitudeGroup.rotation.x += v2.x;
  camAzimuthGroup.rotation.y += v2.y;

  v3.copy(camPanAccel).multiplyScalar(dt * 0.1);
  camPanSpeed.add(v3);
  v3.copy(camPanSpeed).multiplyScalar(dt * 0.1);
  camPanGroup.position.add(v3);

  const rdamp = Math.pow(camRotDamping, dt * 0.1);
  camRotSpeed.multiplyScalar(rdamp);
  if (Math.abs(camRotSpeed.y) < camRotThrust * 0.3) camRotSpeed.y = 0;
  if (Math.abs(camRotSpeed.x) < camRotThrust * 0.3) camRotSpeed.x = 0;

  const pdamp = Math.pow(camPanDamping, dt * 0.1);
  camPanSpeed.multiplyScalar(pdamp);
  if (Math.abs(camPanSpeed.y) < camPanThrust * 0.03) camPanSpeed.y = 0;
  if (Math.abs(camPanSpeed.x) < camPanThrust * 0.03) camPanSpeed.x = 0;
  if (Math.abs(camPanSpeed.z) < camPanThrust * 0.03) camPanSpeed.z = 0;
}
