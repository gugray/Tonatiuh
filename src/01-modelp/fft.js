let context, analyzer, mediaSource, gainNode;
let timeData;
let nLoBins = 0, nMidBins = 0, nHiBins = 0;
const loTop = 250, midTop = 2000, hiTop = 12000;

function getUserMedia(dictionary, callback) {
  try {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
    navigator.getUserMedia(dictionary, callback, e => console.dir(e));
  }
  catch (e) {
    console.error('getUserMedia threw exception :' + e);
  }
}

export function connectAudioAPI(intialGain) {
  try {
    context = new AudioContext();
    analyzer = context.createAnalyser();
    analyzer.fftSize = 512;

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then(function (stream) {
        mediaSource = context.createMediaStreamSource(stream);
        gainNode = context.createGain();
        mediaSource.connect(gainNode);
        gainNode.connect(analyzer);
        gainNode.gain.setValueAtTime(intialGain, context.currentTime);
        void context.resume();
      })
      .catch(function (err) {
        console.error(err)
      });
  }
  catch (e) {
    console.error(e);
  }
}

export function setGain(gain) {
  if (!gainNode) return;
  gainNode.gain.setValueAtTime(gain, context.currentTime);
}

function initData() {
  const nBins = analyzer.frequencyBinCount;
  timeData = new Uint8Array(nBins);
  const binRange = context.sampleRate / 2 / nBins;
  let i = 0, freq = 0;
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

export function updateFFT() {
  if (!analyzer) return null;
  if (!timeData || timeData.length != analyzer.frequencyBinCount)
    initData();
  analyzer.getByteFrequencyData(timeData);
  let lo = 0, mid = 0, hi = 0, sum = 0;
  let i;
  for (i = 0; i < nLoBins; ++i) lo += timeData[i];
  for (; i < nLoBins + nMidBins; ++i) mid += timeData[i];
  for (; i < nLoBins + nMidBins + nHiBins; ++i) hi += timeData[i];
  return [lo, mid, hi, lo+mid+hi];
}
