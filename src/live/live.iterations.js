// Test messages from live.js
// Test messages from Tidal

// Dial in gain (looking at metrics)
// Plug in headset and restart Chrome; verify input source
// --> Put to live start
setGain(0.05);

// Check BG image intensity (on projector)
// => Set 0.11

// Calibrate background lines
params.renderBG = true;
params.bgLinesPerFrame.set(0.01);

// Calibrate point twirly gain
params.pointTwirlie.set(1);
params.twirlieAudioGain.set(30);

params.dynScale.set(0.5);

params.pointTwirlie.set(0);
params.renderBG = false;
params.dynScale.set(0);

// ---------------------------------------------------
// ^^^ All this is calibration; don't perform :)
// ---------------------------------------------------

// Live setup => after reload!
setGain(0.05);
params.twirlieAudioGain.set(30);
params.bgLinesPerFrame.set(0.01);

// Starts swinging, just view for a bit

// Swinging off
params.swing.inoutTo(0, 30);

// Start by gently disturbing
// Don't go flow-ways
params.lengthRotSpeed.lerpTo(1, 15);
params.simSpeed.inoutTo(0.00001, 15);
params.stableAge.set(4000);

// Double sim speed, increase age
params.simSpeed.inoutTo(0.00001, 15);

params.stableAge.set(4000);


// Turn off sim + rot; turn on twirlie
params.lengthRotSpeed.lerpTo(0, 15);
params.simSpeed.inoutTo(0, 15);
params.pointTwirlie.lerpTo(0.5, 15);

reset();

// Fly around the mask
// ...

// Point twirlie off, anim start, big bulb
params.simFieldMul.set(1.2);
params.pointTwirlie.lerpTo(0, 5);
params.surfOrField.lerpTo(1, 15);
params.simSpeed.inoutTo(0.00005, 15);
params.stableAge.set(5000);

// Expand, faster, broader
// Reset a few times
// Fly around
// 
// => Switch to sails
// => Near-freeze animation
// => nable dynScale; maybe pointtwirlie
//
// => Turn on BG lines
// => Paint with mask

params.simSpeed.inoutTo(0.0001, 5);

params.stableAge.set(10000);

reset();
reseed();

reset();

params.simFieldMul.set(1.5);
reset();

resetCam();

// .5: slow  1: decent  2: brisk 
params.lengthRotSpeed.set(1);

params.simSpeed.inoutTo(0.0001, 5);

params.stableAge.set(15000);

params.simSpeed.inoutTo(0.0002, 5);

params.stableAge.set(55000);

params.simFieldMul.set(1.5);
reset();

reset();

// Sails ON
setCodeOffScreen(true);

// Back on PANEL
setCodeOffScreen(false);

// Background lines
params.renderBG = true;

params.bgLinesPerFrame.set(0.05);

params.dynScale.set(0.5);

// .5: slow  1: decent  2: brisk 
params.lengthRotSpeed.set(2);


resetCam();


// Easing out at the end:
// Reduce lifetime, and sim speed
// Return to surface dir
// Fade out to far away

params.stableAge.set(25000);

params.simSpeed.inoutTo(0.00005, 5);

params.simSpeed.inoutTo(0.00001, 5);

params.simSpeed.inoutTo(0, 5);

reset();

params.surfOrField.lerpTo(0, 20);



// Dummy declarations for auto-complete
// Nothing to see here :)
// -----------------------------------------

const params = {
  simFieldMul: createParam(2.5),
  simSpeed: createParam(0), // 0.001
  stableAge: createParam(5000),
  swing: createParam(1), // left-right swing
  surfOrField: createParam(0), // 0 is surface, 1 is field
  pointTwirlie: createParam(0), // How much twirling is mixed in
  twirlieAudioGain: createParam(50), // How much audio nudges twirling ahead
  dynScale: createParam(0), // Scale box size by volume
  lengthRotSpeed: createParam(0), // Speed of lengthwise rotation
  renderBG: false,
  bgLinesPerFrame: createParam(0.05),
};

function setUseShadow(isOn) {}
function setGain(val) {}
function setCodeOffScreen(val) {}
function slowCam() {}
function fastCam() {}
function resetCam() {}
function reset() {}
function reseed() {}

class Param {
  constructor(initialVal) {}
  set(val) {}
  lerpTo(val, inSeconds) {}
  inoutTo(val, inSeconds) {}
}

function createParam(initialVal) {
  return new Param(initialVal);
}
