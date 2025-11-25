params.surfOrField.lerpTo(1, 5);
params.simSpeed.inoutTo(0.0001, 5);

params.pointTwirlie.lerpTo(1, 5);

params.simSpeed.inoutTo(0.0003, 5);


params.renderBG = false


params.stableAge.set(55000);

reset();

params.simSpeed.set(0);

params.simSpeed.inoutTo(0.0001, 3);

params.simFieldMul.set(1.0);

params.simFieldMul.inoutTo(2.0, 15);

params.simSpeed.inoutTo(0.0001, 15);

params.simSpeed.inoutTo(0.0002, 5);

slowCam();

fastCam();

resetCam();

setUseShadow(false);

setUseShadow(true);

params.gain = 0.01;

reset();
