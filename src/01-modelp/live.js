function updateCtrl(ctrl) {
  ctrl.renderBG = false;
  ctrl.bgLinesPerFrame = 0.08;
  ctrl.renderScene = true;
  ctrl.useShadow = false;
  ctrl.gain = 0.04;
  ctrl.runSimulation = false;
  // .3: just a flowing blob
  // .6: calm
  // .9: varied
  ctrl.simFieldMul = .9;
  // ===========
  ctrl.simSpeed = 0.0002;
  ctrl.maxAge = 15000;
  // ===========
  // ----------------
  // Start with calm field, keep resetting
  // ctrl.simSpeed = 0.0003;
  // ctrl.maxAge = 15000;
  // ----------------
  // Slowish moving: 0.0002
  // maAge 5: no movement
  // Switch surface/field orientation at 1500
  // ctrl.simSpeed = 0.0002;
  // ctrl.maxAge = 1500;
  // ----------------
  // Slow moving: 0.0001, goes far
  // ctrl.simSpeed = 0.0001;
  // ctrl.maxAge = 140000;
  ctrl.oneTimeReset = "modell";
}

const dyn = {

  // ========================================================
  // Gets position and intensity of point light
  // Returns intensity; sets perm.pos
  // ========================================================
  getPointLight: function(ix, pos, perm, ctrl, state) {
    pos.set(
      20 * Math.sin(state.time * 0.0003),
      0,
      12 * Math.cos(state.time * 0.0003)
    );
    pos.y = 5;
    // return 0;
    return 50 + state.mid / 50;
  },

  // ========================================================
  // Update boxes from current positions in model
  // ========================================================
  updateInstances: function(perm, ctrl, state, model, mesh) {

    const pointTo = "surface";
    // const pointTo = "field";

    let scaleThickness = false;
    // scaleThickness = true;


    let rotateAll = false;
    // rotateAll = "swing";
    // rotateAll = "circle";

    let pointTwirlie = false;
    pointTwirlie = true;
    if (pointTwirlie) {
      // state.time2 += state.dT * 0.5;
      state.time2 += state.dT * 0.1 + state.vol * 0.02;
      // state.time2 += state.vol * 0.01;
    }

    if (rotateAll) {
      // state.time1 += state.dT + (64 - state.hi * 3.5) * 0.0;
      state.time1 += state.dT;
      if (rotateAll == "swing")
        mesh.rotation.y = Math.sin(state.time1 * 0.0003) * 0.3;
      else if (rotateAll == "circle")
        mesh.rotation.y = state.time1 * 0.0002 % (2 * Math.PI);
    }

    for (let i = 0; i < model.count; ++i) {

      model.getPoint(i, perm.mpt);

      // Update instance's matrix and color
      perm.obj.scale.set(1, 1, 1);

      // What about length?
      // Scale by audio
      perm.obj.scale.y = 1 + state.lo * 0.005;
      // Pulse
      // perm.obj.scale.y = 1 + Math.sin(state.time * 0.001) * 1.1;
      // Something else
      perm.obj.scale.y = 1.2;

      if (scaleThickness)
        perm.obj.scale.x = perm.obj.scale.z = .8 + state.vol * 0.002;
      else
        perm.obj.scale.x = perm.obj.scale.z = 1;

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

  clearBG: function(elmCanvas) {
    const ctx = elmCanvas.getContext("2d");
    const w = elmCanvas.width;
    const h = elmCanvas.height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, w, h);
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
