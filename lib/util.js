"use strict";

// Normalisasi teks: huruf kecil, tanpa aksen/apostrof, spasi rapi
function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\x27’`´]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// Pecah teks panjang per baris agar aman dikirim lewat WhatsApp
function chunkText(text, max = 3500) {
  const out = [];
  let cur = "";
  for (const line of String(text).split("\n")) {
    if (cur && (cur + line + "\n").length > max) {
      out.push(cur.trimEnd());
      cur = "";
    }
    cur += line + "\n";
  }
  if (cur.trim()) out.push(cur.trimEnd());
  return out;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad2 = (n) => String(n).padStart(2, "0");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { norm, levenshtein, chunkText, shuffle, pick, pad2, sleep };
