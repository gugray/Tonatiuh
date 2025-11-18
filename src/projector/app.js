import {mulberry32, setRandomGenerator, rand} from "./random.js";
import {initReceiver} from "./receiver.js";
import {createParam, updateParams} from "./smoothParams.js";
import {loadModelFromPLY, ParticleData, setFadeTimes} from "./particleSystem.js";
import {tidalUpdate, fillTidalSamples, onTidalCanvasUpdated, setTidalOffscreen} from "./audioLayer.js";
import {Sail} from "./sail.js";
import * as CG from "./customGeo.js";
import * as THREE from "three";

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";
const tidalLiveSocketUrl = "https://liverelay.aka-gabor.xyz/relay";
const jsLiveSocketUrl = "ws://100.67.53.78:8090/relay";

const fadeInTime = 1000; // max 9000
const fadeOutTime = 2000; // max 9000

const app = {
  psys: null,
  updater: null,
  scene: null,
  camera: null,
  renderer: null,
  txBlack: null,
  mMask: null,
  sails: [],
  camPanGroup: null,
  camAltitudeGroup: null,
  camAzimuthGroup: null,
  pointLight: null,
};

const params = {
  seed: 0,
  modelScale: 36,
  preserveBuffer: false,
  simFieldMul: createParam(2.5),
  simSpeed: createParam(0.0001), // 0.001
  stableAge: createParam(4000),
  // Keep in sync with commandContext.fastCom
  camRotThrust: 0.0003,
  camRotDamping: 0.989,
  camPanThrust: 0.008,
  camPanDamping: 0.989,
  updateInstances: null,
};

const state = {
  lastAnimTime: Date.now(),
  lastCamTime: Date.now(),
  time: 0,
  camRotAccel: new THREE.Vector2(), // x: altitude, y: azimuth
  camRotSpeed: new THREE.Vector2(), // x: altitude, y: azimuth
  camPanAccel: new THREE.Vector3(), // x, y: pan; z: distance
  camPanSpeed: new THREE.Vector3(), // x, y: pan; z: distance
};

const cache = {
  v2: new THREE.Vector2(),
  v3: new THREE.Vector3(),
  obj: new THREE.Object3D(),
  dir: new THREE.Vector3(),
  dirxy: new THREE.Vector3(),
  q1: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  mat4: new THREE.Matrix4(),
  unitY: new THREE.Vector3(0, 1, 0),
  unitZ: new THREE.Vector3(0, 0, 1),
  axis: new THREE.Vector3(),
  clr: new THREE.Color(),
  prt: new ParticleData(),
};

async function initApp() {
  setRandomGenerator(mulberry32(params.seed));

  // Init particle system from model
  const rot = new THREE.Matrix4().makeRotationY(Math.PI * 0.5);
  setFadeTimes(fadeInTime, fadeOutTime);
  app.psys = await loadModelFromPLY(THREE, modelUrl, rot);
  app.psys.putAllOnModel();
  for (let ix = 0; ix < app.psys.count; ++ix) {
    app.psys.setParticleAge(ix, params.stableAge.get() * (rand() * 1.15));
  }

  // GPU particle system updater in worker thread
  const simCanvas = document.createElement("canvas").transferControlToOffscreen();
  app.updater = new Worker("uwMask.js");
  app.updater.postMessage(
    {
      simCanvas: simCanvas,
      modelBuffer: app.psys.modelBuffer,
      simBuffer: app.psys.simBuffer,
      simFieldMul: params.simFieldMul.get(),
      simSpeed: params.simSpeed.get(),
      stableAge: params.stableAge.get(),
      fadeInTime: fadeInTime,
      fadeOutTime: fadeOutTime,
    },
    [simCanvas],
  );

  app.txBlack = await CG.loadTextureAsync("/data/black1px.png");

  initThree();
  initEvents();
  initReceiver(jsLiveSocketUrl, onSocketMessage);
  if (tidalLiveSocketUrl) initReceiver(tidalLiveSocketUrl, onSocketMessage);
  onWindowResize();

  // Execute liveInit.ljs
  // This sets update functions!
  const initLive = await (await fetch("liveInit.ljs")).text();
  const cutoff = initLive.indexOf("// END INIT");
  onSocketMessage({
    source: "js",
    content: initLive.substring(0, cutoff),
  });

  // Start the movie
  animate();
  setTimeout(camControlLoop, 0);

  // Audio code messages onto sails
  setTidalOffscreen(true);
  // setTimeout(() => {
  //   fillTidalSamples();
  // }, 500);
  onTidalCanvasUpdated((canvas) => {
    const tx = new THREE.CanvasTexture(canvas);
    // const sail = new Sail(180, 60, 1.8, 0.6, tx, 8000);
    const sail = new Sail(tx, canvas.width, canvas.height, 8000);
    app.scene.add(sail.mesh);
    app.sails.push(sail);
  });

  // commandContext.slowCam();
}

function initThree() {
  app.scene = new THREE.Scene();
  app.scene.fog = new THREE.FogExp2(0x000000, 0.015);
  app.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  app.camPanGroup = new THREE.Group();
  app.camPanGroup.position.z = 50;
  app.camPanGroup.add(app.camera);
  app.camAltitudeGroup = new THREE.Group();
  app.camAltitudeGroup.add(app.camPanGroup);
  app.camAzimuthGroup = new THREE.Group();
  app.camAzimuthGroup.add(app.camAltitudeGroup);
  app.scene.add(app.camAzimuthGroup);

  app.renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById("canv3"),
    preserveDrawingBuffer: true,
  });
  app.renderer.autoClear = false;
  app.renderer.shadowMap.enabled = false;
  app.renderer.setSize(window.innerWidth, window.innerHeight);
  app.renderer.setPixelRatio(window.devicePixelRatio);

  function makeDirLight(x, y, z, intensity) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(x, y, z);
    return light;
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
  app.scene.add(ambientLight);

  const dirLight1 = makeDirLight(-100, 50, 100, 0.8);
  app.scene.add(dirLight1);

  const dirLight2 = makeDirLight(0, 100, -10, 0.6);
  app.scene.add(dirLight2);

  app.pointLight = new THREE.PointLight(0xffffff, 0, 0, 1.8);
  app.scene.add(app.pointLight);

  const geometry = new THREE.BoxGeometry(0.2, 1.0, 0.2);
  const material = new THREE.MeshPhongMaterial({transparent: true});

  CG.hackBoxMaterial(geometry, material);

  app.mMask = new THREE.InstancedMesh(geometry, material, app.psys.count);
  app.mMask.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  app.scene.add(app.mMask);
}

function onWindowResize() {
  app.camera.aspect = window.innerWidth / window.innerHeight;
  app.camera.updateProjectionMatrix();
  app.renderer.setSize(window.innerWidth, window.innerHeight);
}

function initEvents() {
  document.body.addEventListener("keydown", (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      if (e.key == "ArrowLeft") state.camRotAccel.y = -params.camRotThrust;
      else if (e.key == "ArrowRight") state.camRotAccel.y = params.camRotThrust;
      else if (e.key == "ArrowUp") state.camRotAccel.x = -params.camRotThrust;
      else if (e.key == "ArrowDown") state.camRotAccel.x = params.camRotThrust;
    } //
    else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key == "ArrowLeft") state.camPanAccel.x = params.camPanThrust;
      else if (e.key == "ArrowRight") state.camPanAccel.x = -params.camPanThrust;
      else if (e.key == "ArrowUp") state.camPanAccel.y = -params.camPanThrust;
      else if (e.key == "ArrowDown") state.camPanAccel.y = params.camPanThrust;
    } //
    else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key == "ArrowUp") state.camPanAccel.z = -params.camPanThrust;
      else if (e.key == "ArrowDown") state.camPanAccel.z = params.camPanThrust;
    }
  });

  document.body.addEventListener("keyup", (e) => {
    if (e.key == "ArrowLeft" || e.key == "ArrowRight" || e.key == "ArrowUp" || e.key == "ArrowDown") {
      state.camRotAccel.set(0, 0);
      state.camPanAccel.set(0, 0, 0);
    }
  });

  window.addEventListener("resize", onWindowResize);
}

function updatePointLight(app, cache, params, state) {
  app.pointLight.position.set(20 * Math.sin(state.time * 0.0003), 5, 12 * Math.cos(state.time * 0.0003));
  app.pointLight.intensity = 50;
}

function camControlLoop() {
  const now = Date.now();
  const dt = now - state.lastCamTime;
  state.lastCamTime = now;

  setTimeout(camControlLoop, Math.max(1, 14 - dt));

  cache.v2.copy(state.camRotAccel).multiplyScalar(dt * 0.1);
  state.camRotSpeed.add(cache.v2);
  cache.v2.copy(state.camRotSpeed).multiplyScalar(dt * 0.1);
  app.camAltitudeGroup.rotation.x += cache.v2.x;
  app.camAzimuthGroup.rotation.y += cache.v2.y;

  cache.v3.copy(state.camPanAccel).multiplyScalar(dt * 0.1);
  state.camPanSpeed.add(cache.v3);
  cache.v3.copy(state.camPanSpeed).multiplyScalar(dt * 0.1);
  app.camPanGroup.position.add(cache.v3);

  state.camRotSpeed.multiplyScalar(params.camRotDamping);
  if (Math.abs(state.camRotSpeed.y) < params.camRotThrust * 0.3) state.camRotSpeed.y = 0;
  if (Math.abs(state.camRotSpeed.x) < params.camRotThrust * 0.3) state.camRotSpeed.x = 0;

  state.camPanSpeed.multiplyScalar(params.camPanDamping);
  if (Math.abs(state.camPanSpeed.y) < params.camPanThrust * 0.03) state.camPanSpeed.y = 0;
  if (Math.abs(state.camPanSpeed.x) < params.camPanThrust * 0.03) state.camPanSpeed.x = 0;
  if (Math.abs(state.camPanSpeed.z) < params.camPanThrust * 0.03) state.camPanSpeed.z = 0;
}

function updateSails(dt) {
  const toRemove = [];
  for (const sail of app.sails) {
    if (sail.isOver) toRemove.push(sail);
    else sail.update(dt);
  }
  for (const s of toRemove) {
    const ix = app.sails.indexOf(s);
    app.sails.splice(ix, 1);
    app.scene.remove(s.mesh);
    s.mesh.material.dispose();
    s.mesh.geometry.dispose();
  }
}

function animate() {
  const now = Date.now();
  const dt = now - state.lastAnimTime;
  state.time += dt;
  state.lastAnimTime = now;

  updateParams(dt);
  updatePointLight(app, cache, params, state);
  updateSails(dt);
  params.updateInstances(app, cache, params, state);

  app.renderer.clear();
  app.renderer.render(app.scene, app.camera);

  app.updater.postMessage({
    simFieldMul: params.simFieldMul.get(),
    simSpeed: params.simSpeed.get(),
    stableAge: params.stableAge.get(),
  });

  requestAnimationFrame(animate);
}

const commandContext = {
  app,
  cache,
  params,
  state,
  setUpdateInstances: function (fun) {
    params.updateInstances = fun;
  },
  slowCam: function () {
    params.camRotThrust = 0.00008;
    params.camRotDamping = 0.989;
    params.camPanThrust = 0.001;
    params.camPanDamping = 0.989;
  },
  fastCam: function () {
    // Keep in sync with params definitin at top
    params.camRotThrust = 0.0003;
    params.camRotDamping = 0.989;
    params.camPanThrust = 0.08;
    params.camPanDamping = 0.989;
  },
  reset: function () {
    app.updater.postMessage({reset: 1});
  },
};

function onSocketMessage(data) {
  // Javacript: execute
  if (data.source == "js") {
    try {
      const evalCommand = new Function("ctxt", `with(ctxt) { ${data.content}; }`);
      evalCommand(commandContext);
    } catch (error) {
      console.log(`Command errored out: ${error}`);
    }
  }
  // Tidal: display in overlay
  else if (data.source == "tidal") {
    tidalUpdate(data.content, true);
  }
}

await initApp();
