params.simSpeed.inoutTo(0.0003, 3);

params.stableAge.set(55000);

reset();

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
