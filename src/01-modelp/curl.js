/*
 * A fast 3D curl noise algorithm
 *
 * Taken from Alo Roosing's 3D curl post at
 * https://al-ro.github.io/projects/embers/
 *
 * Adapted by Gabor Ugray to work as an ES6 module
 * Version 2023-10-18
 *
 */


import * as noise from "./noise.js"

export function normalize(v){
  let length = Math.hypot(v[0], v[1], v[2]);
  return [v[0]/length, v[1]/length, v[2]/length];
}

export function cross(a, b){
  return [ a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function simplex3curl(x, y, z){

  let eps = 1e-4;

  //Find rate of change in X
  let n1 = noise.simplex3(x + eps, y, z);
  let n2 = noise.simplex3(x - eps, y, z);
  //Average to find approximate derivative
  let a = (n1 - n2)/(2 * eps);

  //Find rate of change in Y
  n1 = noise.simplex3(x, y + eps, z);
  n2 = noise.simplex3(x, y - eps, z);
  //Average to find approximate derivative
  let b = (n1 - n2)/(2 * eps);

  //Find rate of change in Z
  n1 = noise.simplex3(x, y, z + eps);
  n2 = noise.simplex3(x, y, z - eps);
  //Average to find approximate derivative
  let c = (n1 - n2)/(2 * eps);

  let noiseGrad0 = [a, b, c];

  // Offset position for second noise read
  x += 10000.5;
  y += 10000.5;
  z += 10000.5;

  //Find rate of change in X
  n1 = noise.simplex3(x + eps, y, z);
  n2 = noise.simplex3(x - eps, y, z);
  //Average to find approximate derivative
  a = (n1 - n2)/(2 * eps);

  //Find rate of change in Y
  n1 = noise.simplex3(x, y + eps, z);
  n2 = noise.simplex3(x, y - eps, z);
  //Average to find approximate derivative
  b = (n1 - n2)/(2 * eps);

  //Find rate of change in Z
  n1 = noise.simplex3(x, y, z + eps);
  n2 = noise.simplex3(x, y, z - eps);
  //Average to find approximate derivative
  c = (n1 - n2)/(2 * eps);

  let noiseGrad1 = [a, b, c];

  noiseGrad1 = normalize(noiseGrad1);
  noiseGrad1 = normalize(noiseGrad1);
  let curl = cross(noiseGrad0, noiseGrad1);

  return normalize(curl);
}
