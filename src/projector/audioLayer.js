import Prism from "prismjs";
import "prismjs/components/prism-haskell.js";
import html2canvas from "html2canvas";

const reTidalDef1 = new RegExp("^(d\\d+)");
const reTidalDef2 = new RegExp("\\s(d\\d+)");
const elmFixedCode = document.getElementById("fixedCode");

const sampleSources = [
  `d1 $ whenmod 8 1 (const silence) $ sound "goddrone"
  # n (irand 5)
  # speed (choose [1, -1, 0.5, -0.5])
  # gain (range 1.1 1.6 $ rand)
  # pan rand`,
  `d3 $ stack [
  whenmod 32 1 (const silence)  $ sound "godfx:1"
    # speed (choose [-0.5, 0.5, 1])
    # pan rand
    # gain (range 1 1.2 $ rand)
    # djf (range 0.1 1 (slow 32 sine)),
  whenmod 64 1 (const silence) $ sound "godfx"
    # pan rand
    # gain (range 1 1.3 $ rand)
    # djf (range 0.1 1 (slow 32 sine))
    # speed (choose [2, -2, 1, -1]),
  whenmod 24 1 (const silence) $ sound "godfx:04"
    # speed (choose [1 , -1, 0.5])
    # pan rand
    # gain (range 1 1.4 $ rand)]`,
  `d9 $ stack [
  whenmod 4 0 (const silence) $ slow 1 $ sound "godbass:0"  # gain "0.4",
  whenmod 16 0 (const silence) $ slow 1 $ sound "godbass:1" # gain "0.5",
  whenmod 32 0 (const silence) $ slow 1 $ sound "godbass:2"  # gain "0.5",
  whenmod 16 0 (const silence) $ slow 1 $ sound "godbass:3"  # gain "0.5",
  whenmod 16 2 (const silence) $ slow 1 $ sound "godbass:4" # gain "1",
  whenmod 16 0 (const silence) $ slow 1 $ sound "godbass:5"  # gain "0.5"]`,
];

let onTidalCanvasUpdatedFun = null;

export function onTidalCanvasUpdated(fun) {
  onTidalCanvasUpdatedFun = fun;
}

export function setTidalOffscreen(val) {
  if (val) elmFixedCode.classList.add("offscreen");
  else elmFixedCode.classList.remove("offscreen");
}

export function fillTidalSamples() {
  let i = 0;
  update();
  function update() {
    const src = sampleSources[i];
    tidalUpdate(src, true);
    i = (i + 1) % sampleSources.length;
    setTimeout(update, 3000);
  }
}

export function tidalUpdate(codeStr, renderBitmap) {
  let match = codeStr.match(reTidalDef1);
  if (!match) match = codeStr.match(reTidalDef2);
  const id = match ? match[1] : "dX";
  let elm = document.getElementById(id);
  if (!elm) {
    elm = document.createElement("p");
    elm.id = id;
    elmFixedCode.prepend(elm);
  }
  const html = Prism.highlight(codeStr, Prism.languages.haskell, "haskell");
  elm.innerHTML = html;
  elmFixedCode.querySelectorAll("p").forEach((e) => e.classList.remove("last"));
  elm.classList.add("last");

  // Create a clone here; render to bitmap, don't wait
  if (renderBitmap) {
    html2canvas(elm, {backgroundColor: null}).then((canvas) => {
      if (onTidalCanvasUpdatedFun) onTidalCanvasUpdatedFun(canvas);
      flash(0);
    });
  }
  // If not rendering to texture, flash now
  else {
    flash(50);
  }

  function flash(firstTimeout) {
    // Move to top if not fully visible, or if not an identifiable dN section, or a new section
    setTimeout(() => {
      const h = elmFixedCode.clientHeight;
      const bot = elm.offsetTop + elm.offsetHeight;
      if (id == "dX" || bot > h) {
        elmFixedCode.prepend(elm);
      }
      elm.classList.add("hilite");
    }, firstTimeout);
    setTimeout(() => {
      elm.classList.remove("hilite");
    }, 100);
  }
}
