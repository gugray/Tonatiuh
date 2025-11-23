import Stats from "./mystats.js";

export class Metrics {
  constructor(audio) {
    this.audio = audio;

    this.elmVolumeVal = document.getElementById("volumeVal");
    this.elmVolume = document.getElementById("volume");

    this.stats = new Stats();
    this.stats.dom.style.display = "none";
    this.stats.dom.classList.add("metric");
    document.body.appendChild(this.stats.dom);

    this.isShown = false;
  }

  toggle() {
    this.isShown = !this.isShown;
    const display = this.isShown ? "block" : "none";
    const elms = document.querySelectorAll(".metric");
    elms.forEach((e) => (e.style.display = display));
  }

  update() {
    this.stats.update();
    const volPercent = this.audio.vol * 100;
    this.elmVolumeVal.style.height = volPercent.toFixed(2) + "%";
  }
}
