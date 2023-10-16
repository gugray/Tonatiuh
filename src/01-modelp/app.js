import {loadModelFromPLY, ModelPoint} from "./modelLoader.js";

const THREE = await import("three");
const {OrbitControls} = await import("three/addons/controls/OrbitControls.js");
const Stats = await import("three/addons/libs/stats.module.js");
const {EffectComposer} = await import("three/addons/postprocessing/EffectComposer.js");
const {RenderPass} = await import("three/addons/postprocessing/RenderPass.js");
const {BokehPass} = await import("three/addons/postprocessing/BokehPass.js");
const {OutputPass} = await import("three/addons/postprocessing/OutputPass.js");
const {RGBShiftShader} = await import("three/addons/shaders/RGBShiftShader.js");

// Add shadows!


// const modelUrl = "data/romanf-32k.ply";
// const modelScale = 22;
// https://sketchfab.com/3d-models/tonatiuh-9db1f3a422c149ceade14a9c294d4e8a
const modelUrl = "data/tonatiuh-32k.ply";
const modelScale = 36;

const mat = new THREE.Matrix4();
mat.makeRotationY(Math.PI * 0.5);
const model = await loadModelFromPLY(THREE, modelUrl, mat);

const useEffectsComposer = false;
const preserveBuffer = true;
const shadowMapSz = 4096;
const shadowCamDim = 40;

const startTime = Date.now();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 50;

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("canv3"),
  preserveDrawingBuffer: true,
  alpha: true,
});
renderer.autoClear = false;
renderer.shadowMap.enabled = true;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
const controls = new OrbitControls(camera, renderer.domElement);

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
  light.castShadow = true;
  light.shadow.camera.top = shadowCamDim;
  light.shadow.camera.left = -shadowCamDim;
  light.shadow.camera.bottom = -shadowCamDim;
  light.shadow.camera.right = shadowCamDim;
  light.shadow.camera.near = 10;
  light.shadow.camera.far = 500;
  light.shadow.mapSize.set(shadowMapSz, shadowMapSz);
  light.shadow.radius = 0.5;
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
const material = new THREE.MeshPhongMaterial();

const dim = 32;
const mesh = new THREE.InstancedMesh(geometry, material, model.count);
mesh.castShadow = true;
mesh.receiveShadow = true;
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(mesh);

const stats = Stats.default();
document.body.appendChild(stats.dom);

const tmpObj = new THREE.Object3D();
const tmpNrm = new THREE.Vector3();
const tmpHor = new THREE.Vector3();
const tmpVer = new THREE.Vector3();
const tmpClr = new THREE.Color();
const tmpMpt = new ModelPoint();


function updateFromModel(time) {

  mesh.rotation.y = Math.sin(time * 0.0002) * 0.3;

  tmpVer.set(0, 0, 1);

  for (let i = 0; i < model.count; ++i) {
    model.getPoint(i, tmpMpt);
    tmpObj.position.set(tmpMpt.x * modelScale, tmpMpt.y * modelScale, tmpMpt.z * modelScale);

    tmpNrm.set(tmpMpt.nx, tmpMpt.ny, tmpMpt.nz);
    tmpObj.rotation.z = Math.atan2(tmpNrm.y, tmpNrm.x);
    tmpHor.set(tmpNrm.x, tmpNrm.y, 0).normalize();
    tmpObj.rotation.y = -Math.atan2(tmpHor.z, tmpHor.x);
    tmpObj.rotation.x = -Math.atan2(tmpNrm.dot(tmpVer), tmpNrm.dot(tmpNrm.clone().cross(tmpVer)));

    // tmpObj.rotation.x = Math.PI * 0.25;
    // tmpObj.rotation.y = Math.PI * 0.25;

    // tmpObj.rotation.y =
    //   Math.sin(tmpMpt.x / 4 + time * 0.0005) +
    //   Math.sin(tmpMpt.y / 4 + time * 0.0005) +
    //   Math.sin(tmpMpt.z / 4 + time * 0.0005);
    // tmpObj.rotation.z = tmpObj.rotation.y * 2;

    tmpObj.scale.y = 2 + Math.sin(time * 0.001) * 1.5;
    // tmpObj.scale.setScalar(1 + Math.sin(time * 0.001) * 0.3 - 0.3);

    tmpObj.updateMatrix();
    mesh.setMatrixAt(i, tmpObj.matrix);
    tmpClr.set(tmpMpt.r / 64, tmpMpt.g / 64, tmpMpt.b / 64);
    mesh.setColorAt(i, tmpClr);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function animate() {
  updateFromModel(Date.now() - startTime);
  if (useEffectsComposer) composer.render();
  else {
    if (preserveBuffer) renderer.clearDepth();
    else renderer.clear();
    renderer.render(scene, camera);
  }
  stats.update();
  requestAnimationFrame(animate);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onWindowResize);
animate();
