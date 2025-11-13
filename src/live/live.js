params.modelScale = 36;
params.preserveBuffer = false;
params.simFieldMul = 2.5;
params.simSpeed = 0.001;
params.maxAge = 24000;

setUpdateInstances((app, cache, params, state) => {
  // const pointTo = "surface";
  const pointTo = "field";
  for (let i = 0; i < app.psys.count; ++i) {
    app.psys.getParticle(i, cache.prt);
    cache.obj.scale.set(1, 1, 1);
    cache.obj.scale.x = cache.obj.scale.z = 1;
    cache.obj.position.set(
      cache.prt.cx * params.modelScale,
      cache.prt.cy * params.modelScale,
      cache.prt.cz * params.modelScale,
    );
    // Where should boxes point? Flow field, or surface normal
    if (pointTo == "surface") {
      cache.nrm.set(cache.prt.nx, cache.prt.ny, cache.prt.nz);
      // rotateTmpObjToNrm(cache);
    }
    // Flow field
    else if (pointTo == "field") {
      cache.nrm.set(cache.prt.vx, cache.prt.vy, cache.prt.vz);
      cache.nrm.normalize();
      rotateTmpObjToNrm2(cache);
      // rotateTmpObjToNrm(perm);
    }
    cache.obj.updateMatrix();
    app.mesh.setMatrixAt(i, cache.obj.matrix);
    cache.clr.set(cache.prt.r / 64, cache.prt.g / 64, cache.prt.b / 64);
    app.mesh.setColorAt(i, cache.clr);
  }
  app.mesh.material.opacity = 1.0;
  app.mesh.instanceMatrix.needsUpdate = true;
  app.mesh.computeBoundingSphere();
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
});

// END INIT
// ====================================


// Re-declarations for editor comfort
// ====================================
const params = {
  modelScale: 36,
  preserveBuffer: false,
  simFieldMul: 2.5, // 2.5 for original
  simSpeed: 0.001,
  maxAge: 24000,
};

function setUpdateInstances(fun) {}
