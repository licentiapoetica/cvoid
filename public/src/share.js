// A place, shared (see comeShared and shareHere in main.js), written as one word that says nothing to the eye:
// /?v=<word>. In it: the dimension, the room in it (if any, and its name), where (to the unit) and which way
// (to about a hundredth of a degree), and who shared it, packed tight, then scrambled from a byte of chance
// at its head (the same place shared twice is two different words) and sealed with a byte that must agree
// (a word mistyped or made up is nothing, not somewhere wrong).
import { mulberry32 } from "./noise.js";

const KEY = 0x766f6964; // ("void")
const TURN = Math.PI * 2, STEPS = 65536;
const ROOM = 1, LABEL = 2, FROM = 4;

const scramble = (bytes, salt) => {
  const next = mulberry32(KEY ^ Math.imul(salt + 1, 0x9e3779b1));
  return bytes.map((b) => b ^ ((next() * 256) | 0));
};
const seal = (bytes) => bytes.reduce((sum, b, i) => (sum * 31 + b + i) % 251, 7);
const toWord = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromWord = (word) => Uint8Array.from(atob(word.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

// { realm, position: [x, y, z], yaw, pitch, room?: { key, label }, from? } -> a word
export function writePlace({ realm, position, yaw, pitch, room, from }) {
  const out = [], text = new TextEncoder();
  const count = (n) => { do { out.push((n & 0x7f) | (n > 0x7f ? 0x80 : 0)); n = Math.floor(n / 128); } while (n > 0); };
  const words = (s) => { const b = text.encode(s); count(b.length); out.push(...b); };
  const whole = (n) => count(n < 0 ? -2 * n - 1 : 2 * n); // (signed, kept small either way)
  const angle = (a) => { const s = Math.round(((((a % TURN) + TURN) % TURN) / TURN) * STEPS) % STEPS; out.push(s >> 8, s & 0xff); };
  const label = room && room.label && room.label !== room.key ? room.label : "";
  out.push((room ? ROOM : 0) | (label ? LABEL : 0) | (from ? FROM : 0));
  words(realm);
  for (const v of position) whole(Math.round(v));
  angle(yaw);
  angle(pitch);
  if (room) words(room.key);
  if (label) words(label);
  if (from) words(from);
  const salt = (Math.random() * 256) | 0, body = scramble(out, salt);
  return toWord([salt, ...body, seal([salt, ...body])]);
}

// a word -> the place it says, or null (not one of these)
export function readPlace(word) {
  let all;
  try { all = [...fromWord(word)]; } catch { return null; }
  if (all.length < 8 || seal(all.slice(0, -1)) !== all.at(-1)) return null;
  const bytes = scramble(all.slice(1, -1), all[0]), text = new TextDecoder();
  let i = 0;
  const count = () => { let n = 0, scale = 1, b; do { if (i >= bytes.length) throw 0; b = bytes[i++]; n += (b & 0x7f) * scale; scale *= 128; } while (b & 0x80); return n; };
  const words = () => { const n = count(); if (i + n > bytes.length) throw 0; return text.decode(new Uint8Array(bytes.slice(i, (i += n)))); };
  const whole = () => { const n = count(); return n % 2 ? -(n + 1) / 2 : n / 2; };
  const angle = () => { if (i + 2 > bytes.length) throw 0; const s = (bytes[i++] << 8) | bytes[i++]; const a = (s / STEPS) * TURN; return a > Math.PI ? a - TURN : a; };
  try {
    const flags = bytes[i++], realm = words(), position = [whole(), whole(), whole()], yaw = angle(), pitch = angle();
    const key = flags & ROOM ? words() : null, label = flags & LABEL ? words() : null, from = flags & FROM ? words() : "";
    if (!realm || i !== bytes.length) return null;
    return { realm, position, yaw, pitch, room: key ? { key, label: label || key } : null, from };
  } catch {
    return null;
  }
}
