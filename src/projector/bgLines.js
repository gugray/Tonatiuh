import {Color} from "three";

const maxBgAlpha = 0.15;

export class BackgroundLines {
  constructor(elmCanvas, allColors, params, audio, bgImg) {
    this.elmCanvas = elmCanvas;
    this.allColors = allColors;
    this.params = params;
    this.audio = audio;
    this.w = elmCanvas.width;
    this.h = elmCanvas.height;
    this.ctx = elmCanvas.getContext("2d");
    this.clr = new Color();
    this.frameIx = 0;
    this.isCleared = false;

    this.bgImg = bgImg;
    this.bgOfs = [0, 0];
    this.bgAlpha = maxBgAlpha;
    if (this.bgImg) {
      this.bgPat = this.ctx.createPattern(this.bgImg, "repeat");
      this.bgPat.setTransform(new DOMMatrix().translate(...this.bgOfs));
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        this.w = entry.contentRect.width;
        this.h = entry.contentRect.height;
        this.isCleared = false;
      }
    });
    resizeObserver.observe(elmCanvas);
  }

  viewChanged(azim, alt, dist) {
    if (!this.bgImg) return;

    console.log(alt);
    // prettier-ignore
    const newOfs = [
      -Math.PI * azim * this.bgImg.width * 0.07,
      -Math.PI * alt * this.bgImg.height * 0.07];

    const fadeStart = 50;
    const fadeEnd = 90;
    let newAlpha;
    if (dist < fadeStart) newAlpha = maxBgAlpha;
    else if (dist > fadeEnd) newAlpha = 0;
    else newAlpha = maxBgAlpha * (1 - (dist - fadeStart) / (fadeEnd - fadeStart));

    if (
      Math.abs(newOfs[0] - this.bgOfs[0]) > 1 ||
      Math.abs(newOfs[1] - this.bgOfs[1]) > 1 ||
      Math.abs(newAlpha - this.bgAlpha) > 0.005
    ) {
      this.bgOfs = newOfs;
      this.bgAlpha = newAlpha;
      this.bgPat.setTransform(new DOMMatrix().translate(...this.bgOfs));
      this.isCleared = false;
    }
  }

  renderBackie() {
    ++this.frameIx;

    if (!this.params.renderBG) {
      if (!this.isCleared) {
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.w, this.h);
        if (this.bgImg) {
          this.ctx.save();
          this.ctx.globalAlpha = this.bgAlpha;
          this.ctx.fillStyle = this.bgPat;
          this.ctx.fillRect(0, 0, this.w, this.h);
          this.ctx.restore();
        }
      }
      this.isCleared = true;
      return;
    }
    this.isCleared = false;

    const nPerFrame = this.params.bgLinesPerFrame.get();
    const ll = this.w + this.h; // Greater than diagonal

    if (this.frameIx % 5 == 0) {
      this.ctx.globalAlpha = 0.04;
      this.ctx.fillStyle = "black";
      this.ctx.fillRect(0, 0, this.w, this.h);
    }

    if (nPerFrame < 1 && Math.random() > nPerFrame) return;

    this.ctx.globalAlpha = 1;
    this.ctx.beginPath();
    this.ctx.lineWidth = 3;
    const clrHex = this.allColors[this.frameIx % this.allColors.length];
    this.clr.set(clrHex);
    const hsl = {};
    this.clr.getHSL(hsl);
    hsl.s = Math.min(0.5, this.audio.hi * 200);
    hsl.l = Math.min(1, this.audio.vol * 0.5);
    this.clr.setHSL(hsl.h, hsl.s, hsl.l);
    this.ctx.strokeStyle = "#" + this.clr.getHexString();
    for (let i = 0; i < nPerFrame; ++i) {
      const cx = Math.round(this.w * Math.random());
      const cy = Math.round(this.h * Math.random());
      const angle = Math.PI * Math.random();
      const lx = ll * Math.sin(angle);
      const ly = ll * Math.cos(angle);
      this.ctx.moveTo(cx - lx, cy - ly);
      this.ctx.lineTo(cx + lx, cy + ly);
    }
    this.ctx.stroke();
  }
}
