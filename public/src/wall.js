// A DOM element drawn as if it hung on a wall (a page, a Flash piece, a video, in a plugin's
// dimension): the 3x3 projective transform that carries the element's own rectangle onto four screen
// points, written out as a CSS matrix3d.
const adj = (m) => [
  m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
];
const mul = (a, b) => Array.from({ length: 9 }, (_, n) => a[3 * Math.floor(n / 3)] * b[n % 3] + a[3 * Math.floor(n / 3) + 1] * b[3 + (n % 3)] + a[3 * Math.floor(n / 3) + 2] * b[6 + (n % 3)]);
function basis(p) { // p: four [x, y] points
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1], a = adj(m);
  const v = [0, 1, 2].map((i) => a[3 * i] * p[3][0] + a[3 * i + 1] * p[3][1] + a[3 * i + 2]);
  return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}
export function wallTransform(w, h, corners) {
  const t = mul(basis(corners), adj(basis([[0, 0], [w, 0], [w, h], [0, h]]))).map((n, _, all) => n / all[8]);
  return `matrix3d(${[t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].join(",")})`;
}
