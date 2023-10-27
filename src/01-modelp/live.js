function updateCtrl(ctrl) {
  ctrl.renderBG = false;
  ctrl.bgLinesPerFrame = 0.1;
  ctrl.renderScene = true;
  ctrl.useShadow = true;
  ctrl.gain = 0.05;
  ctrl.runSimulation = false;
  ctrl.simFieldMul = 1.5;
  ctrl.simSpeed = 0.001;
  ctrl.maxAge = 1000;
  ctrl.oneTimeReset = "model";
}

const dyn = {

  // ========================================================
  // Update boxes from current positions in model
  // ========================================================
  updateInstances: function(perm, ctrl, state, model, mesh) {

    // const pointTo = "surface";
    // const pointTo = "field";
    const pointTo = "blah";

    const scaleThickness = false;
    // const rotateAll = false;
    const rotateAll = "swing";
    // const rotateAll = "circle";
    const pointTwirlie = true;

    if (rotateAll) {
      state.time1 += state.dT + (128 - state.vol * 0.5) * 0.0;
      if (rotateAll == "swing")
        mesh.rotation.y = Math.sin(state.time1 * 0.0002) * 0.3;
      else if (rotateAll == "circle")
        mesh.rotation.y = state.time1 * 0.0002 % (2 * Math.PI);
    }
    if (pointTwirlie) {
      state.time2 += state.dT;
    }

    for (let i = 0; i < model.count; ++i) {

      model.getPoint(i, perm.mpt);

      // Update instance's matrix and color
      perm.obj.scale.set(1, 1, 1);

      // What about length?
      // Scale by audio
      // perm.obj.scale.y = 1 + state.hi / 256;
      // Pulse
      // perm.obj.scale.y = 1 + Math.sin(state.time * 0.001) * 1.1;
      // Something else
      // perm.obj.scale.y = 0.15;

      if (scaleThickness) {
        perm.obj.scale.x = perm.obj.scale.z = 1 + state.mid / 256;
      }
      else {
        perm.obj.scale.x = perm.obj.scale.z = 1;
      }

      perm.obj.position.set(perm.mpt.cx * ctrl.modelScale, perm.mpt.cy * ctrl.modelScale, perm.mpt.cz * ctrl.modelScale);

      // Where should boxes point? Flow field, or surface normal
      if (pointTo == "surface") {
        perm.nrm.set(perm.mpt.nx, perm.mpt.ny, perm.mpt.nz);
        rotateTmpObjToNrm(perm);
      }
      // Flow field
      else if (pointTo == "field") {
        perm.nrm.set(perm.mpt.vx, perm.mpt.vy, perm.mpt.vz);
        perm.nrm.normalize();
        rotateTmpObjToNrm2(perm);
      }
      // Something else..
      else {
        perm.obj.rotation.set(0, 0, 0);
      }

      // Twirl boxes
      if (pointTwirlie) {
        perm.obj.rotation.y =
          Math.sin(perm.mpt.mx / 4 + state.time2 * 0.0005) +
          Math.sin(perm.mpt.my / 4 + state.time2 * 0.0005) +
          Math.sin(perm.mpt.cz / 4 + state.time2 * 0.0005);
        perm.obj.rotation.x = perm.obj.rotation.y * 1.5;
      }

      perm.obj.updateMatrix();
      mesh.setMatrixAt(i, perm.obj.matrix);
      perm.clr.set(perm.mpt.r / 64, perm.mpt.g / 64, perm.mpt.b / 64);
      mesh.setColorAt(i, perm.clr);
      mesh.material.opacity = 1.0;
    }
  },

  // ========================================================
  // Render 2D background
  // ========================================================
  renderBG: function(elmCanvas, perm, ctrl, state) {
    const nPerFrame = ctrl.bgLinesPerFrame;
    const ctx = elmCanvas.getContext("2d");
    const w = elmCanvas.width;
    const h = elmCanvas.height;
    const ll = w + h; // Greater than diagonal

    if ((state.frameIx % 5) == 0) {
      ctx.globalAlpha = 0.04;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, w, h);
    }

    if (nPerFrame < 1 && Math.random() > nPerFrame) return;

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.lineWidth = 3;
    const clrHex = perm.allColors[state.frameIx % perm.allColors.length];
    perm.clr.set(clrHex);
    const hsl = {};
    perm.clr.getHSL(hsl);
    hsl.s = Math.min(0.5, state.hi / 256);
    hsl.l = Math.min(1, state.vol / 8192);
    perm.clr.setHSL(hsl.h, hsl.s, hsl.l);
    ctx.strokeStyle = "#" + perm.clr.getHexString();
    for (let i = 0; i < nPerFrame; ++i) {
      const cx = Math.round(w * Math.random());
      const cy = Math.round(h * Math.random());
      const angle = Math.PI * Math.random();
      const lx = ll * Math.sin(angle);
      const ly = ll * Math.cos(angle);
      ctx.moveTo(cx - lx, cy - ly);
      ctx.lineTo(cx + lx, cy + ly);
    }
    ctx.stroke();
  }
};


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


///return {
///  updateCtrl,
///  dyn,
///};
