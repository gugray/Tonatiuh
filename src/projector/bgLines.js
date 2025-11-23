import {Color} from "three";

export class BackgroundLines {
  constructor(elmCanvas, allColors, params, audio) {
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

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        this.w = entry.contentRect.width;
        this.h = entry.contentRect.height;
      }
    });
    resizeObserver.observe(elmCanvas);
  }

  renderBackie() {
    ++this.frameIx;

    if (!this.params.renderBG) {
      if (!this.isCleared) {
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, this.w, this.h);
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
