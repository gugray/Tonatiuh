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

};

///return {
///  updateCtrl,
///  dyn,
///};
