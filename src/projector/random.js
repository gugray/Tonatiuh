

let rand = Math.random;

function setRandomGenerator(randomFun) {
  rand = randomFun;
}

function mulberry32(seed) {
  return function () {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

function rand_range(min, max) {
  return min + rand() * (max - min);
}

/**
 * Returns a value between min and max, with clipped Gaussian distribution
 * (Nothing >3.6 standard deviations away - less than 0.02% chance)
 * @param {Number} min Low end of the range, inclusive
 * @param {Number} max High end of the range, inclusive
 * @param {Number} skew If 1, symmetric. N>1 skews left, 1/N skews right
 */
function randn_bm(min, max, skew = 1) {
  // Based on https://stackoverflow.com/a/49434653
  let u = 0, v = 0;
  while (u === 0) u = rand() //Converting [0,1) to (0,1)
  while (v === 0) v = rand()
  let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)

  num = num / 10.0 + 0.5 // Translate to 0 -> 1
  if (num > 1 || num < 0)
    num = randn_bm(min, max, skew) // resample between 0 and 1 if out of range

  else {
    num = Math.pow(num, skew) // Skew
    num *= max - min // Stretch to fill range
    num += min // offset to min
  }
  return num
}

/**
 * Returns a number whose value is limited to the given range.
 *
 * Example: limit the output of this computation to between 0 and 255
 * clamp(x * 255, 0, 255)
 *
 * @param {Number} x The number to clamp.
 * @param {Number} min The lower boundary of the output range
 * @param {Number} max The upper boundary of the output range
 * @returns A number in the range [min, max]
 * @type Number
 */
function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

function shuffle(array, rndFun) {
  if (!rndFun) rndFun = rand;
  // Fisher-Yates shuffle
  // https://stackoverflow.com/a/2450976
  let ix = array.length, randIx;
  while (ix != 0) {
    randIx = Math.floor(rndFun() * ix);
    ix--;
    [array[ix], array[randIx]] = [array[randIx], array[ix]];
  }
  return array;
}

function rand_select(array) {
  let ix = Math.floor(rand() * array.length);
  return array[ix];
}

export { rand, rand_range, setRandomGenerator, randn_bm, mulberry32, clamp, shuffle, rand_select };
