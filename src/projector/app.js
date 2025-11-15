import {mulberry32, setRandomGenerator} from "./random.js";
import {initReceiver} from "./receiver.js";
import {loadModelFromPLY, ParticleData} from "./particleSystem.js";
import {tidalUpdate, fillTidalSamples, onTidalCanvasUpdated} from "./audioLayer.js";
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
  seed: 0,
  modelScale: 36,
  preserveBuffer: false,
  simFieldMul: 2.5, // 2.5 for original
  simSpeed: 0.001,
  maxAge: 24000,
  camRotThrust: 0.0005, // 0.0005
  camPanThrust: 0.01, // 0.01
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
  dir: new THREE.Vector3(),
  dirxy: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  mat4: new THREE.Matrix4(),
  unitZ: new THREE.Vector3(0, 0, 1),
  unitY: new THREE.Vector3(0, 1, 0),
  axis: new THREE.Vector3(),
  clr: new THREE.Color(),
  prt: new ParticleData(),
};

async function initApp() {
  setRandomGenerator(mulberry32(params.seed));

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

  // setTimeout(() => {
  //   fillTidalSamples();
  // }, 1000);
  // onTidalCanvasUpdated((canvas) => {
  //   const texture = new THREE.CanvasTexture(canvas);
  //   if (app.mesh.material.map) {
  //     app.mesh.material.map.dispose();
  //     app.mesh.material.map = null;
  //   }
  //   app.mesh.material.map = texture;
  //   app.mesh.material.needsUpdate = true;
  // });
}

function initThree() {
  app.scene = new THREE.Scene();
  app.scene.fog = new THREE.FogExp2(0x000000, 0.015);
  app.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  app.camPanGroup = new THREE.Group();
  app.camPanGroup.position.z = 50;
  // app.camPanGroup.position.z = 25; // 50
  // app.camPanGroup.position.x = 18.5; // DBG
  // app.camPanGroup.position.y = -0.5; // DBG
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

  const textureLoader = new THREE.TextureLoader();
  const texture = textureLoader.load("/data/black1px.png");

  // TODO: Toggle "transparent" from code
  // TODO: Add uniform for alpha
  const geometry = new THREE.BoxGeometry(0.2, 1.0, 0.2);
  const material = new THREE.MeshPhongMaterial({map: texture /*, transparent: true */});

  material.onBeforeCompile = (shader) => {
    // console.log(shader.fragmentShader);
    // This comes first in code => we'll use mapColor later.
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("vec3 totalEmissiveRadiance = emissive;", `
vec4 mapColor = texture2D( map, vMapUv );
vec3 totalEmissiveRadiance;
float mapColorLength = length(mapColor.rgb);
if (mapColorLength > 0.3) totalEmissiveRadiance = mapColor.rgb * 0.5;
else totalEmissiveRadiance = emissive;
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
float alpha = 1.0;
if (mapColorLength > 0.3) diffuseColor = mapColor;
else { diffuseColor *= 0.9; alpha = 0.6; }
    `);
    // prettier-ignore
    shader.fragmentShader = shader.fragmentShader.replace("#include <dithering_fragment>", `
#include <dithering_fragment>
gl_FragColor.a = alpha;
    `);
  };

  const uvAttribute = geometry.getAttribute("uv");
  // prettier-ignore
  const uvMap = [
    0, 0.75, 0, 1, 1, 0.75, 1, 1,
    0, 0.25, 0, 0.5, 1, 0.25, 1, 0.5,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0.5, 0, 0.75, 1, 0.5, 1, 0.75,
    0, 0, 0, 0.25, 1, 0, 1, 0.25,
  ];
  for (let i = 0; i < 24; ++i) uvAttribute.setXY(i, uvMap[2 * i], uvMap[2 * i + 1]);

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
    tidalUpdate(data.content);
  }
}

await initApp();
