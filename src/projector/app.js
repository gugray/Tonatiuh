import {mulberry32, setRandomGenerator, rand} from "./random.js";
import {initReceiver} from "./receiver.js";
import {createParam, updateParams} from "./smoothParams.js";
import {loadModelFromPLY, ParticleData, setFadeTimes} from "./particleSystem.js";
import {initCameraCrane, slowCam, fastCam, resetCam} from "./cameraCrane.js";
import {BackgroundLines} from "./bgLines.js";
import {Sail} from "./sail.js";
import {Audio, connectAudioAPI} from "./audio.js";
import {Metrics} from "./metrics.js";
import * as CL from "./codeLayer.js";
import * as CG from "./customGeo.js";
import * as THREE from "three";

// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";
const tidalLiveSocketUrl = "https://liverelay.aka-gabor.xyz/relay";
const jsLiveSocketUrl = "ws://100.67.53.78:8090/relay";

const fadeInTime = 1000; // max 9000
const fadeOutTime = 2000; // max 9000
const shadowMapSz = 4096;
const shadowCamDim = 40;
const dbgShowLights = false;

const app = {
  psys: null,
  updater: null,
  maskScene: null,
  sailScene: null,
  camera: null,
  renderer: null,
  txBlack: null,
  mMask: null,
  sails: [],
  dirLights: [],
  pointLights: [],
  allColors: [],
  audio: null,
  bgLines: null,
  metrics: null,
};

const params = {
  seed: 0,
  modelScale: 36,
  preserveBuffer: false,
  useShadow: false,
  simFieldMul: createParam(2.5),
  simSpeed: createParam(0.0001), // 0.001
  stableAge: createParam(4000),
  pointTwirlie: false,
  dynScale: createParam(0),
  updateInstances: null,
  renderBG: false,
  gain: 0.02,
  bgLinesPerFrame: createParam(0.1),
};

const state = {
  lastAnimTime: Date.now(),
  time: 0,
  timeTwirlie: 0,
};

const cache = {
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
    app.psys.getParticle(ix, cache.prt);
    cache.clr.set(cache.prt.r / 64, cache.prt.g / 64, cache.prt.b / 64);
    app.allColors.push("#" + cache.clr.getHexString());
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
  app.audio = new Audio();
  app.bgLines = new BackgroundLines(document.getElementById("canv2"), app.allColors, params, app.audio);
  app.metrics = new Metrics(app.audio);

  initThree();
  setUseShadow();
  initCameraCrane(app.maskScene, app.camera);
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

  // Audio code messages onto sails
  CL.setTidalOffscreen(true);
  // setTimeout(() => {
  //   CL.fillTidalSamples();
  // }, 500);
  CL.onTidalCanvasUpdated((canvas) => {
    const tx = new THREE.CanvasTexture(canvas);
    const sail = new Sail(tx, canvas.width, canvas.height, 8000);
    app.sailScene.add(sail.mesh);
    app.sails.push(sail);
  });
}

function initThree() {
  // Mask scene
  app.maskScene = new THREE.Scene();
  app.maskScene.background = null;
  app.maskScene.fog = new THREE.FogExp2(0x000000, 0.015);
  app.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // Renderer
  app.renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById("canv3"),
    preserveDrawingBuffer: true,
    alpha: true,
  });
  app.renderer.autoClear = false;
  app.renderer.shadowMap.enabled = false;
  app.renderer.setSize(window.innerWidth, window.innerHeight);
  app.renderer.setPixelRatio(window.devicePixelRatio);

  // Lighting
  function addDirLight(x, y, z, intensity) {
    const light = new THREE.DirectionalLight(0xffffff, intensity);
    light.position.set(x, y, z);
    light.shadow.camera.top = shadowCamDim;
    light.shadow.camera.left = -shadowCamDim;
    light.shadow.camera.bottom = -shadowCamDim;
    light.shadow.camera.right = shadowCamDim;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 500;
    light.shadow.mapSize.set(shadowMapSz, shadowMapSz);
    light.shadow.radius = 4;
    app.maskScene.add(light);
    app.dirLights.push(light);
  }

  let plGeo, plMat;
  function addPointLight(setPos) {
    const light = new THREE.PointLight(0xffffff, 50, 0, 1.8);
    light.shadow.mapSize.set(1024, 1204);
    light.shadow.radius = 4;
    app.pointLights.push(light);
    app.maskScene.add(light);
    light.userData.setPos = setPos;
    if (dbgShowLights) {
      if (!plGeo) plGeo = new THREE.OctahedronGeometry(1);
      if (!plMat) plMat = new THREE.MeshBasicMaterial({color: 0xffffff});
      const msh = new THREE.Mesh(plGeo, plMat);
      app.maskScene.add(msh);
      light.userData.octaMesh = msh;
    }
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
  app.maskScene.add(ambientLight);

  addDirLight(-100, 50, 100, 0.8);
  addDirLight(0, 100, -10, 0.6);
  addPointLight((pos, t) => {
    pos.x = 20 * Math.sin(t * 0.0003);
    pos.y = 10;
    pos.z = 12 * Math.cos(t * 0.0003);
  });
  addPointLight((pos, t) => {
    pos.x = 20 * Math.cos(t * 0.0003);
    pos.y = -10;
    pos.z = 12 * Math.sin(t * 0.0003);
  });
  addPointLight((pos, t) => {
    pos.x = 0;
    pos.y = 40 * Math.sin(t * 0.00025);
    pos.z = 20 * Math.cos(t * 0.00075);
  });

  // app.scene.add(new THREE.CameraHelper(app.dirLights[1].shadow.camera));

  // Le masque
  const geometry = new THREE.BoxGeometry(0.2, 1.0, 0.2);
  const material = new THREE.MeshPhongMaterial({transparent: true});

  CG.hackBoxMaterial(geometry, material);

  app.mMask = new THREE.InstancedMesh(geometry, material, app.psys.count);
  app.mMask.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  app.maskScene.add(app.mMask);

  // Sails scene
  app.sailScene = new THREE.Scene();
  app.sailScene.background = null;
}

function setUseShadow() {
  const isOn = params.useShadow;
  for (const light of app.pointLights) light.castShadow = isOn;
  for (const light of app.dirLights) light.castShadow = isOn;
  app.renderer.shadowMap.enabled = isOn;
  app.mMask.castShadow = app.mMask.receiveShadow = isOn;
}

function onWindowResize() {
  app.camera.aspect = window.innerWidth / window.innerHeight;
  app.camera.updateProjectionMatrix();
  app.renderer.setSize(window.innerWidth, window.innerHeight);

  const elmCanv2 = document.getElementById("canv2");
  elmCanv2.width = window.innerWidth;
  elmCanv2.height = window.innerHeight;
}

function initEvents() {
  window.addEventListener("resize", onWindowResize);
  document.body.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key == "Enter") {
      document.documentElement.requestFullscreen();
      e.preventDefault();
      e.stopPropagation();
    } //
    else if (e.key == "a") {
      connectAudioAPI(params.gain);
    } //
    else if (e.key == "c") {
      app.renderer.clear();
    } //
    else if (e.key == "p") {
      params.preserveBuffer = !params.preserveBuffer;
    } //
    else if (e.key == "m") {
      app.metrics.toggle();
    }
  });
}

function updatePointLights(app, cache, params, state) {
  for (const light of app.pointLights) {
    light.userData.setPos(light.position, state.time);
    if (light.userData.octaMesh) {
      light.userData.octaMesh.position.copy(light.position);
    }
  }
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
    app.sailScene.remove(s.mesh);
    s.mesh.material.dispose();
    s.mesh.geometry.dispose();
  }
}

function animate() {
  const now = Date.now();
  const dt = now - state.lastAnimTime;
  state.time += dt;
  state.lastAnimTime = now;

  app.audio.update();
  updateParams(dt);
  updatePointLights(app, cache, params, state);
  updateSails(dt);
  params.updateInstances(app, cache, params, dt, state);

  app.bgLines.renderBackie();

  if (params.preserveBuffer) app.renderer.clearDepth();
  else app.renderer.clear();
  app.renderer.render(app.maskScene, app.camera);
  app.renderer.clearDepth();
  app.renderer.render(app.sailScene, app.camera);

  app.updater.postMessage({
    simFieldMul: params.simFieldMul.get(),
    simSpeed: params.simSpeed.get(),
    stableAge: params.stableAge.get(),
  });
  app.metrics.update();

  requestAnimationFrame(animate);
}

const commandContext = {
  app,
  cache,
  params,
  state,
  setUseShadow: function (isOn) {
    params.useShadow = isOn;
    setUseShadow();
  },
  setUpdateInstances: function (fun) {
    params.updateInstances = fun;
  },
  slowCam: () => slowCam(),
  fastCam: () => fastCam(),
  resetCam: () => resetCam(),
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
    CL.tidalUpdate(data.content, true);
  }
}

await initApp();
