import * as THREE from "three";

const startZ = 50;
const homeInMsec = 5000;

// Permanent geometry ("app")
const camPanGroup = new THREE.Group();
const camAltitudeGroup = new THREE.Group();
const camAzimuthGroup = new THREE.Group();

// Cache
const v2 = new THREE.Vector2();
const v3 = new THREE.Vector3();

// Control params; keep initial values in sync with fastCam()
let camRotThrust = 0.0003;
let camRotDamping = 0.985;
let camPanThrust = 0.008;
let camPanDamping = 0.985;

// State
const camRotAccel = new THREE.Vector2(); // x: altitude, y: azimuth
const camRotSpeed = new THREE.Vector2(); // x: altitude, y: azimuth
const camPanAccel = new THREE.Vector3(); // x, y: pan; z: distance
const camPanSpeed = new THREE.Vector3(); // x, y: pan; z: distance
let lastCamTime = 0;
let homingAnim = null;

export function initCameraCrane(scene, camera) {
  camPanGroup.position.z = startZ;
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

export function resetCam() {
  if (homingAnim != null) return;
  homingAnim = new HomingAnimation();
  camRotAccel.set(0, 0);
  camPanAccel.set(0, 0, 0);
}

function initCamControlEvents() {
  document.body.addEventListener("keydown", (e) => {
    if (homingAnim) return;
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
    if (homingAnim) return;
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

  // If homing animation is in progress: that has full control
  if (homingAnim) {
    homingAnim.update(dt);
    if (homingAnim.isFinished()) homingAnim = null;
    return;
  }

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

class HomingAnimation {
  constructor() {
    this.elapsedMsec = 0;
    this.startRot = new THREE.Vector2(camAltitudeGroup.rotation.x, camAzimuthGroup.rotation.y);
    this.endRot = new THREE.Vector2();
    this.currRot = new THREE.Vector2();
    this.startPan = camPanGroup.position.clone();
    this.currPan = new THREE.Vector3();
    this.endPan = new THREE.Vector3(0, 0, startZ);
  }

  isFinished() {
    return this.elapsedMsec >= homeInMsec;
  }

  update(dt) {
    this.elapsedMsec += dt;
    let v = 1;
    if (!this.isFinished()) {
      const t = this.elapsedMsec / homeInMsec;
      // Quadratic ease in-out
      v = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    this.currRot.copy(this.startRot).lerp(this.endRot, v);
    this.currPan.copy(this.startPan).lerp(this.endPan, v);
    camAltitudeGroup.rotation.x = this.currRot.x;
    camAzimuthGroup.rotation.y = this.currRot.y;
    camPanGroup.position.copy(this.currPan);
  }
}
