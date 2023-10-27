function updateCtrl(ctrl) {
  ctrl.useEffectsComposer = false;
  ctrl.pulseSize = false;
  ctrl.useShadow = false;
  ctrl.gain = 0.01;
  ctrl.flowSim = false;
  ctrl.simFieldMul = 2.5;
  ctrl.simSpeed = 0.001;
  ctrl.maxAge = 24000;
}

const dyn = {

  updateFromModel: (perm, ctrl, state, model, mesh) => {

    const time = state.funnyTime;
    mesh.rotation.y = Math.sin(state.time * 0.0002) * 0.3;

    for (let i = 0; i < model.count; ++i) {
      model.getPoint(i, perm.mpt);
      perm.obj.position.set(perm.mpt.cx * ctrl.modelScale, perm.mpt.cy * ctrl.modelScale, perm.mpt.cz * ctrl.modelScale);

      perm.nrm.set(perm.mpt.nx, perm.mpt.ny, perm.mpt.nz);
      rotateTmpObjToNrm(perm);

      // perm.obj.rotation.x = Math.PI * 0.25;
      // perm.obj.rotation.y = Math.PI * 0.25;

      perm.obj.rotation.y =
        Math.sin(perm.mpt.cx / 4 + time * 0.0005) +
        Math.sin(perm.mpt.cy / 4 + time * 0.0005) +
        Math.sin(perm.mpt.cz / 4 + time * 0.0005);
      // perm.obj.rotation.y *= 1 + state.mid * 0.001;
      perm.obj.rotation.x = perm.obj.rotation.y * 0.5;

      if (ctrl.pulseSize) {
        perm.obj.scale.y = 1 + Math.sin(time * 0.001) * 1;
      }
      perm.obj.scale.set(1,1,1);
      // perm.obj.scale.y = 1 + state.lo / 128;
      // perm.obj.scale.x = perm.obj.scale.z = 1 + Math.sqrt(state.mid) / 16;

      perm.obj.updateMatrix();
      mesh.setMatrixAt(i, perm.obj.matrix);
      perm.clr.set(perm.mpt.r / 64, perm.mpt.g / 64, perm.mpt.b / 64);
      mesh.setColorAt(i, perm.clr);
    }
  },

};


function rotateTmpObjToNrm(perm) {
  perm.obj.rotation.z = Math.atan2(perm.nrm.y, perm.nrm.x);
  perm.hor.set(perm.nrm.x, perm.nrm.y, 0).normalize();
  perm.obj.rotation.y = -Math.atan2(perm.hor.z, perm.hor.x);
  perm.obj.rotation.x = -Math.atan2(perm.nrm.dot(perm.unitZ), perm.nrm.dot(perm.nrm.clone().cross(perm.unitZ)));
}


///return {
///  updateCtrl,
///  dyn,
///};
