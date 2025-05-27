import Prism from "prismjs";
import "prismjs/components/prism-haskell.js";

const showSamples = false;
const relaySockerUrl = "wss://liverelay.aka-gabor.xyz/relay";
const reTidalDef1 = new RegExp("^(d\\d+)");
const reTidalDef2 = new RegExp("\\s(d\\d+)");
const elmFixedCode = document.getElementById("fixedCode");

const sampleSource = `d1 $ sound "hc*5 [hc*3 ~ hc*2]"
      # pan (range (-1) 1 $ slow 3 $ sine)
      # cutoff (range 800 12000 $ slow 4 $ tri)
      # gain (range 0.4 1 $ rand)`;

export function setupAudioLayer() {

  let state = 0;
  let socket = null;

  const connectSocket = () => {
    if (state == 1) return;
    console.log("AudioLayer socket: connecting...");
    state = 1;
    socket = new WebSocket(relaySockerUrl);
    socket.addEventListener("open", () => {
      state = 2;
      console.log("AudioLayer socket open");
    });
    socket.addEventListener("message", (event) => {
      const msgStr = event.data;
      console.log(`AudioLayer message: ${truncate(msgStr, 64).replaceAll("\n", " ")}`);
      onAudioUpdate(msgStr);
    });
    socket.addEventListener("close", () => {
      state = 0;
      console.log("AudioLayer socket closed");
      setTimeout(() => connectSocket(), 1000);
    });
  }

  setInterval(() => {
    if (socket != null && state == 2) socket.send("ping");
  }, 5000);

  connectSocket();
  if (showSamples) fillWithSamples();
}

function fillWithSamples() {
  onAudioUpdate(sampleSource);
  let s2 = sampleSource.replaceAll("d1", "d2");
  onAudioUpdate(s2);
  s2 = sampleSource.replaceAll("d1", "d3");
  onAudioUpdate(s2);
  s2 = sampleSource.replaceAll("d1", "d4");
  onAudioUpdate(s2);
  s2 = sampleSource.replaceAll("d1", "d5");
  onAudioUpdate(s2);
  s2 = sampleSource.replaceAll("d1", "d6");
  onAudioUpdate(s2);
  s2 = sampleSource.replaceAll("d1", "d7");
  onAudioUpdate(s2);
  s2 = sampleSource.replaceAll("d1", "d8");
  onAudioUpdate(s2);
  s2 = sampleSource.replaceAll("d1", "d3");
  onAudioUpdate(s2);
}

function onAudioUpdate(codeStr) {
  let match = codeStr.match(reTidalDef1);
  if (!match) match = codeStr.match(reTidalDef2);
  const id = match ? match[1] : "dX";
  let elm = document.getElementById(id);
  if (!elm) {
    elm = document.createElement("p");
    elm.id = id;
    elmFixedCode.prepend(elm);
  }
  const html = Prism.highlight(codeStr, Prism.languages.haskell, 'haskell');
  elm.innerHTML = html;
  elmFixedCode.querySelectorAll("p").forEach(e => e.classList.remove("last"));
  elm.classList.add("last");
  // Once rendered: move to top if not fully visible, or if not an identifiable dN section, or a new section
  setTimeout(() => {
    const h = elmFixedCode.clientHeight;
    const bot = elm.offsetTop + elm.offsetHeight;
    if (bot > h) {
      elmFixedCode.prepend(elm);
    }
    elm.classList.add("hilite");
  }, 50);
  setTimeout(() => {
    elm.classList.remove("hilite");
  }, 100);
}

function initSocket() {
}

export function truncate(str, num) {
  if (str.length > num) {
    return str.slice(0, num) + "...";
  } else {
    return str;
  }
}
