const params = [];

class Animation {
  constructor(type, startVal, targetVal, durationMsec) {
    this.type = type;
    this.startVal = startVal;
    this.targetVal = targetVal;
    this.durationMsec = durationMsec;
    this.elapsedMsec = 0;
    this.currentVal = startVal;
  }

  timePassed(delta) {
    this.elapsedMsec += delta;
    if (this.elapsedMsec >= this.durationMsec) {
      this.currentVal = this.targetVal;
      return;
    }
    const t = this.elapsedMsec / this.durationMsec;
    let v = t;
    if (this.type == "lerp") {
    } //
    else if (this.type == "inout") {
      v = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    this.currentVal = this.startVal + v * (this.targetVal - this.startVal);
  }

  isFinished() {
    return this.elapsedMsec >= this.durationMsec;
  }
}

export class SmoothParam {
  constructor(value) {
    this.value = value;
    this.animation = null;
  }

  get() {
    if (!this.animation) return this.value;
    else return this.animation.currentVal;
  }

  set(value) {
    this.value = value;
    this.animation = null;
  }

  lerpTo(target, inSec) {
    this.animation = new Animation("lerp", this.get(), target, inSec * 1000);
  }

  inoutTo(target, inSec) {
    this.animation = new Animation("inout", this.get(), target, inSec * 1000);
  }
}

export function createParam(value) {
  const param = new SmoothParam(value);
  params.push(param);
  return param;
}

export function updateParams(elapsedMsec) {
  for (const p of params) {
    if (!p.animation) continue;
    p.animation.timePassed(elapsedMsec);
    if (p.animation.isFinished()) {
      p.value = p.animation.targetVal;
      p.animation = null;
    }
  }
}
