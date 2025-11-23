let context, analyzer, mediaSource, gainNode;
let timeData;
let currentGain = NaN;

// prettier-ignore
let nLoBins = 0, nMidBins = 0, nHiBins = 0;
// prettier-ignore
const loTop = 250, midTop = 2000, hiTop = 12000;

const smoothingSample = 5;

class Smoother {
  constructor() {
    this.buf = [];
    for (let i = 0; i < smoothingSample; ++i) this.buf.push(0);
    this.pos = 0;
    this.sum = 0;
    this.avg = 0;
  }

  add(val) {
    this.sum -= this.buf[this.pos];
    this.buf[this.pos] = val;
    this.sum += val;
    this.avg = this.sum / smoothingSample;
    this.pos = (this.pos + 1) % smoothingSample;
  }
}

export class Audio {
  constructor() {
    this.sLo = new Smoother();
    this.sMid = new Smoother();
    this.sHi = new Smoother();
    this.sVol = new Smoother();
    this.lo = 0;
    this.mid = 0;
    this.hi = 0;
    this.vol = 0;
  }

  update() {
    let fft = updateFFT();
    if (!fft) fft = [0, 0, 0, 0];

    this.sLo.add(fft[0]);
    this.sMid.add(fft[1]);
    this.sHi.add(fft[2]);
    this.sVol.add(fft[3]);
    this.lo = this.sLo.avg;
    this.mid = this.sMid.avg;
    this.hi = this.sHi.avg;
    this.vol = this.sVol.avg;
  }

  setGain(gain) {
    if (!gainNode) return;
    if (currentGain == gain) return;
    currentGain = gain;
    gainNode.gain.setValueAtTime(gain, context.currentTime);
  }
}

export function connectAudioAPI(intialGain) {
  try {
    context = new AudioContext();
    analyzer = context.createAnalyser();
    analyzer.fftSize = 512;

    navigator.mediaDevices
      .getUserMedia({audio: true, video: false})
      .then(function (stream) {
        mediaSource = context.createMediaStreamSource(stream);
        gainNode = context.createGain();
        mediaSource.connect(gainNode);
        gainNode.connect(analyzer);
        gainNode.gain.setValueAtTime(intialGain, context.currentTime);
        void context.resume();
      })
      .catch(function (err) {
        console.error(err);
      });
  } catch (e) {
    console.error(e);
  }
}

function getUserMedia(dictionary, callback) {
  try {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    navigator.getUserMedia(dictionary, callback, (e) => console.dir(e));
  } catch (e) {
    console.error("getUserMedia threw exception :" + e);
  }
}

function initData() {
  const nBins = analyzer.frequencyBinCount;
  timeData = new Uint8Array(nBins);
  const binRange = context.sampleRate / 2 / nBins;
  let i = 0,
    freq = 0;
  while (i < nBins) {
    freq += binRange;
    ++nLoBins;
    if (freq > loTop) break;
    else ++i;
  }
  while (i < nBins) {
    freq += binRange;
    ++nMidBins;
    if (freq > midTop) break;
    else ++i;
  }
  while (i < nBins) {
    freq += binRange;
    ++nHiBins;
    if (freq > hiTop) break;
    else ++i;
  }
  console.log(`Bin count: ${timeData.length}; Sample rate: ${context.sampleRate}`);
  console.log(`Lo bins: ${nLoBins}; Mid bins: ${nMidBins}; Hi bins: ${nHiBins}`);
}

function updateFFT() {
  if (!analyzer) return null;
  if (!timeData || timeData.length != analyzer.frequencyBinCount) initData();
  analyzer.getByteFrequencyData(timeData);
  // prettier-ignore
  let lo = 0, mid = 0, hi = 0, sum = 0;
  let i;
  for (i = 0; i < nLoBins; ++i) lo += timeData[i];
  for (; i < nLoBins + nMidBins; ++i) mid += timeData[i];
  for (; i < nLoBins + nMidBins + nHiBins; ++i) hi += timeData[i];
  lo /= nLoBins * 128;
  mid /= nMidBins * 128;
  hi /= nHiBins * 128;
  sum = lo + mid + hi;
  return [lo, mid, hi, sum];
}
