params.surfOrField.lerpTo(1, 5);

params.simSpeed.inoutTo(0.0001, 5);

params.pointTwirlie.lerpTo(1, 5);

params.pointTwirlie.set(0);

params.twirlieAudioGain.set(50);

params.surfOrField.set(1);

params.pointTwirlie.lerpTo(0, 5);
params.surfOrField.lerpTo(1, 5);
params.simSpeed.inoutTo(0.00005, 5);


params.simSpeed.inoutTo(0.0003, 5);
params.stableAge.set(50000);


params.renderBG = false;

params.dynScale.set(0.5);

// .5: slow  1: decent  2: brisk 
params.lengthRotSpeed.set(2);


params.stableAge.set(2000);
params.simSpeed.inoutTo(0.00003, 5);

reset();


params.pointTwirlie.lerpTo(0, 5);
 

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

setGain(0.04);

reset();

setUseShadow(true);
slowCam();
params.surfOrField.set(1);

setCodeOffScreen(true);

setCodeOffScreen(false);
