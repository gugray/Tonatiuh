import {initReceiver} from "./receiver.js";
import {loadModelFromPLY, ParticleData} from "./particleSystem.js";
import * as THREE from "three";

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";
// const tidalLiveSocketUrl = "https://liverelay.aka-gabor.xyz/relay";
const tidalLiveSocketUrl = null;
// const jsLiveSocketUrl = "ws://100.67.53.78:8090/relay";
const jsLiveSocketUrl = "ws://localhost:8090/relay";

const app = {
  psys: null,
  updater: null,
  scene: null,
  camera: null,
  renderer: null,
  camPanGroup: null,
  camAltitudeGroup: null,
  camAzimuthGroup: null,
  pointLight: null,
};

const params = {
  modelScale: 36,
  preserveBuffer: false,
  simFieldMul: 2.5, // 2.5 for original
  simSpeed: 0.001,
  maxAge: 24000,
  updateInstances: null,
};

const state = {
  lastTime: Date.now(),
  time: 0,
  camRotAccel: new THREE.Vector4(), // x: altitude, y: azimuth
  camRotSpeed: new THREE.Vector4(), // x: altitude, y: azimuth
  camPanAccel: new THREE.Vector3(), // x, y: pan; z: distance
  camPanSpeed: new THREE.Vector3(), // x, y: pan; z: distance
};

const cache = {
  obj: new THREE.Object3D(),
  nrm: new THREE.Vector3(),
  hor: new THREE.Vector3(),
  unitZ: new THREE.Vector3(0, 0, 1),
  unitY: new THREE.Vector3(0, 1, 0),
  axis: new THREE.Vector3(),
  clr: new THREE.Color(),
  prt: new ParticleData(),
};

async function initApp() {
  // Init particle system from model
  const rot = new THREE.Matrix4().makeRotationY(Math.PI * 0.5);
  app.psys = await loadModelFromPLY(THREE, modelUrl, rot);
  app.psys.putAllOnModel();
  for (let ix = 0; ix < app.psys.count; ++ix) {
    app.psys.setParticleAge(ix, Math.floor(params.maxAge * Math.random()));
  }

  // GPU particle system updater in worker thread
  const simCanvas = document.createElement("canvas").transferControlToOffscreen();
  app.updater = new Worker("updateWorker.js");
  app.updater.postMessage(
    {
      simCanvas: simCanvas,
      modelBuffer: app.psys.modelBuffer,
      simBuffer: app.psys.simBuffer,
      simFieldMul: params.simFieldMul,
      simSpeed: params.simSpeed,
      maxAge: params.maxAge,
    },
    [simCanvas],
  );

  initThree();
  initEvents();
  initReceiver(jsLiveSocketUrl, onSocketMessage);
  if (tidalLiveSocketUrl) initReceiver(tidalLiveSocketUrl, onSocketMessage);
  onWindowResize();

  // Execute live.js once
  const initLive = await (await fetch("live.js")).text();
  const cutoff = initLive.indexOf("// END INIT");
  onSocketMessage({
    source: "js",
    content: initLive.substring(0, cutoff),
  });

  // Start the movie
  animate();
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
    alpha: true,
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

  app.mesh = new THREE.InstancedMesh(geometry, material, app.psys.count);
  app.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  app.scene.add(app.mesh);
}

function onWindowResize() {
  app.camera.aspect = window.innerWidth / window.innerHeight;
  app.camera.updateProjectionMatrix();
  app.renderer.setSize(window.innerWidth, window.innerHeight);
}

function initEvents() {
  document.body.addEventListener("keydown", (e) => {
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      if (e.key == "ArrowLeft") state.camRotAccel.y = -0.0005;
      else if (e.key == "ArrowRight") state.camRotAccel.y = 0.0005;
      else if (e.key == "ArrowUp") state.camRotAccel.x = -0.0005;
      else if (e.key == "ArrowDown") state.camRotAccel.x = 0.0005;
    } //
    else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key == "ArrowLeft") state.camPanAccel.x = 0.01;
      else if (e.key == "ArrowRight") state.camPanAccel.x = -0.01;
      else if (e.key == "ArrowUp") state.camPanAccel.y = -0.01;
      else if (e.key == "ArrowDown") state.camPanAccel.y = 0.01;
    } //
    else if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (e.key == "ArrowUp") state.camPanAccel.z = -0.01;
      else if (e.key == "ArrowDown") state.camPanAccel.z = 0.01;
    }
  });

  document.body.addEventListener("keyup", (e) => {
    if (e.key == "ArrowLeft" || e.key == "ArrowRight" || e.key == "ArrowUp" || e.key == "ArrowDown") {
      state.camRotAccel.set(0, 0, 0, 0);
      state.camPanAccel.set(0, 0, 0);
    }
  });

  window.addEventListener("resize", onWindowResize);
}

function updatePointLight(app, cache, params, state) {
  app.pointLight.position.set(20 * Math.sin(state.time * 0.0003), 5, 12 * Math.cos(state.time * 0.0003));
  app.pointLight.intensity = 50;
}

function updateCam() {
  // TODO: Use 'elapsed' here for variable FPS stability
  state.camRotSpeed.add(state.camRotAccel);
  state.camPanSpeed.add(state.camPanAccel);
  app.camAltitudeGroup.rotation.x += state.camRotSpeed.x;
  app.camAzimuthGroup.rotation.y += state.camRotSpeed.y;
  app.camPanGroup.position.x += state.camPanSpeed.x;
  app.camPanGroup.position.y += state.camPanSpeed.y;
  app.camPanGroup.position.z += state.camPanSpeed.z;

  state.camRotSpeed.multiplyScalar(0.985);
  if (Math.abs(state.camRotSpeed.y) < 0.0001) state.camRotSpeed.y = 0;
  if (Math.abs(state.camRotSpeed.x) < 0.0001) state.camRotSpeed.x = 0;

  state.camPanSpeed.multiplyScalar(0.985);
  if (Math.abs(state.camPanSpeed.y) < 0.0001) state.camPanSpeed.y = 0;
  if (Math.abs(state.camPanSpeed.x) < 0.0001) state.camPanSpeed.x = 0;
  if (Math.abs(state.camPanSpeed.z) < 0.0001) state.camPanSpeed.z = 0;
}

function animate() {
  const now = Date.now();
  state.time += now - state.lastTime;
  state.lastTime = now;

  updateCam();
  updatePointLight(app, cache, params, state);
  params.updateInstances(app, cache, params, state);

  app.renderer.clear();
  app.renderer.render(app.scene, app.camera);

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
};

function onSocketMessage(data) {
  // Javacript: execute
  if (data.source == "js") {
    try {
      const evalCommand = new Function("ctxt", `with(ctxt) { ${data.content}; }`);
      evalCommand(commandContext);
    } catch {
      console.log("Command errored out");
    }
  }
  // Tidal: display in overlay
  else if (data.source == "tidal") {
    // TODO
  }
}

await initApp();
