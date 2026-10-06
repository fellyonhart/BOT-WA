"use strict";
// ============================================
// BRAT GENERATOR — gambar & video gaya "brat" (Charli XCX) + konversi ke stiker WebP
// Pakai: @xayz/brat-generator (generate gambar/video) + ffmpeg (konversi, lewat lib/media.js)
//
// ⚠️ CATATAN: @xayz/brat-generator tidak punya dokumentasi publik yang baku, jadi
// resolveFn() di bawah mencoba beberapa nama fungsi/bentuk export yang umum dipakai
// paket sejenis (named export, default export, atau class dengan method serupa).
// Kalau instalasi kamu ternyata beda, cek dulu export aslinya:
//   node -e "console.log(require('@xayz/brat-generator'))"
// lalu tambahkan/ubah nama di IMAGE_FN_NAMES / HD_FN_NAMES / VIDEO_FN_NAMES di bawah.
// ============================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const cfg = require("../config");
const M = require("./media"); // run(), MediaError, makeSticker()

class BratError extends Error {} // pesan aman, boleh ditampilkan ke pengguna

const PKG_NAME = "@xayz/brat-generator";

// Kemungkinan nama fungsi generator gambar/HD/video di dalam paket.
// Urutan = prioritas pencarian.
const IMAGE_FN_NAMES = [
  "generateBratImage",
  "generateImage",
  "bratImage",
  "image",
  "brat",
  "generate"
];
const HD_FN_NAMES = [
  "generateBratHD",
  "generateHD",
  "bratHD",
  "hd",
  "generateImageHD"
];
const VIDEO_FN_NAMES = [
  "generateBratVideo",
  "generateVideo",
  "bratVideo",
  "video",
  "toVideo"
];

// ---------- util kecil ----------
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "bratgen-"));
const rmDir = (d) => {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {}
};

function assertText(text) {
  const t = String(text ?? "").trim();
  if (!t)
    throw new BratError("📝 Teksnya mana? Contoh: *.brat kuliah jam 7 pagi*");
  if (t.length > 200)
    throw new BratError(
      "📏 Teks maksimal 200 karakter ya, biar gambarnya tetap rapi."
    );
  return t;
}

// "light" (brat klasik hijau/putih) atau "dark" — default "light".
// Nilai apa pun tetap diteruskan apa adanya ke library (siapa tahu mendukung tema lain).
function normTheme(theme) {
  const t = String(theme ?? "")
    .trim()
    .toLowerCase();
  return t || "light";
}

// Normalisasi berbagai kemungkinan bentuk hasil yang dikembalikan library pihak ketiga
// (Buffer langsung, { buffer }, { data }, { image }, { video }, base64/data URL, dll).
function toBuffer(x) {
  if (!x) return null;
  if (Buffer.isBuffer(x)) return x;
  if (x instanceof Uint8Array) return Buffer.from(x);
  if (x instanceof ArrayBuffer) return Buffer.from(x);
  if (typeof x === "string") {
    const b64 = x.startsWith("data:") ? x.slice(x.indexOf(",") + 1) : x;
    try {
      const buf = Buffer.from(b64, "base64");
      return buf.length ? buf : null;
    } catch {
      return null;
    }
  }
  if (typeof x === "object") {
    for (const key of [
      "buffer",
      "data",
      "image",
      "video",
      "result",
      "output"
    ]) {
      if (key in x) {
        const buf = toBuffer(x[key]);
        if (buf) return buf;
      }
    }
  }
  return null;
}

// ---------- muat & cari fungsi di dalam paket ----------
let _lib = null;
function loadLib() {
  if (_lib) return _lib;
  try {
    _lib = require(PKG_NAME);
  } catch (e) {
    throw new BratError(
      `🛠️ Modul *${PKG_NAME}* belum terpasang. Jalankan: npm i ${PKG_NAME}`
    );
  }
  return _lib;
}

// Cari fungsi generator dari daftar nama yang mungkin, di beberapa kemungkinan bentuk export.
function resolveFn(lib, names) {
  const roots = [lib, lib && lib.default].filter(Boolean);
  for (const root of roots) {
    for (const name of names) {
      if (typeof root[name] === "function") return root[name].bind(root);
    }
  }
  // Bentuk class: new Lib() lalu panggil method dengan nama serupa
  for (const root of roots) {
    if (typeof root === "function") {
      try {
        const inst = new root();
        for (const name of names) {
          if (typeof inst[name] === "function") return inst[name].bind(inst);
        }
      } catch {
        /* bukan constructor tanpa-argumen, lewati */
      }
    }
  }
  return null;
}

async function runGenerator(names, text, opts, label) {
  const lib = loadLib();
  const fn = resolveFn(lib, names);
  if (!fn) {
    throw new BratError(
      `❌ Tidak menemukan fungsi generator ${label} di ${PKG_NAME}. ` +
        `Cek nama export paket itu (lihat catatan di atas lib/brat.js) lalu sesuaikan daftar nama fungsinya.`
    );
  }
  let result;
  try {
    result = await fn(text, opts);
  } catch (e) {
    console.error(`[brat] ${label} error:`, e && e.message ? e.message : e);
    throw new BratError(
      `❌ Gagal membuat ${label} brat.${e && e.message ? ` (${e.message})` : ""}`
    );
  }
  const buf = toBuffer(result);
  if (!buf || !buf.length)
    throw new BratError(
      `❌ Hasil ${label} brat kosong atau formatnya tidak dikenali.`
    );
  return buf;
}

// Pastikan buffer video valid MP4 (h264/aac); kalau belum, transcode pakai ffmpeg.
async function ensureMp4(buffer) {
  // Cek cepat: kontainer MP4/MOV punya atom "ftyp" di awal file
  if (buffer.length > 12 && buffer.toString("ascii", 4, 8) === "ftyp")
    return buffer;

  const dir = tmpDir();
  try {
    const src = path.join(dir, "in.bin");
    const dst = path.join(dir, "out.mp4");
    fs.writeFileSync(src, buffer);

    let r;
    try {
      r = await M.run(
        cfg.media.ffmpeg,
        [
          "-y",
          "-v",
          "error",
          "-i",
          src,
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          dst
        ],
        { timeoutMs: 60000 }
      );
    } catch (e) {
      if (e.code === "ENOENT")
        throw new BratError(
          "🛠️ *ffmpeg* belum terpasang di server bot. Admin: lihat README."
        );
      throw e;
    }
    if (r.timedOut)
      throw new BratError("⌛ Konversi video brat terlalu lama, dibatalkan.");
    if (r.code !== 0 || !fs.existsSync(dst)) {
      console.error(
        "[brat] ffmpeg mp4 error:",
        (r.err || "").trim().split("\n").slice(-2).join(" | ")
      );
      throw new BratError("❌ Gagal mengonversi video brat ke MP4.");
    }
    return fs.readFileSync(dst);
  } finally {
    rmDir(dir);
  }
}

// ---------- API tingkat-rendah (langsung dari @xayz/brat-generator) ----------

// Gambar brat statis (buffer PNG/JPEG apa adanya dari library)
async function buatBratImage(text, theme) {
  const t = assertText(text);
  return runGenerator(IMAGE_FN_NAMES, t, { theme: normTheme(theme) }, "gambar");
}

// Gambar brat kualitas HD. Kalau paketnya tidak punya fungsi HD khusus,
// jatuh ke generator gambar biasa dengan opsi kualitas tinggi.
async function buatBratHD(text, theme) {
  const t = assertText(text);
  const opts = { theme: normTheme(theme), hd: true, quality: "hd", scale: 2 };

  const lib = loadLib();
  const hdFn = resolveFn(lib, HD_FN_NAMES);
  if (hdFn) {
    try {
      const buf = toBuffer(await hdFn(t, opts));
      if (buf && buf.length) return buf;
    } catch (e) {
      console.error(
        "[brat] HD gagal, coba fallback ke generator biasa:",
        e && e.message ? e.message : e
      );
    }
  }
  return runGenerator(IMAGE_FN_NAMES, t, opts, "gambar HD");
}

// Video brat (buffer MP4 valid — ditranscode via ffmpeg kalau perlu)
async function buatBratVideo(text, theme) {
  const t = assertText(text);
  const raw = await runGenerator(
    VIDEO_FN_NAMES,
    t,
    { theme: normTheme(theme) },
    "video"
  );
  return ensureMp4(raw);
}

// ---------- konversi ke stiker WhatsApp (WebP 512x512) ----------
// options: { video, crop, mime, pack, author }
async function convertToWebP(buffer, options = {}) {
  const { video = false, crop = false, mime, pack, author } = options;
  try {
    return await M.makeSticker(
      buffer,
      {
        video,
        crop,
        mime: mime || (video ? "video/mp4" : "image/png"),
        pack,
        author
      },
      cfg.media
    );
  } catch (e) {
    if (e instanceof M.MediaError) throw new BratError(e.message);
    throw e;
  }
}

// ---------- API tingkat-tinggi (siap kirim sebagai stiker WhatsApp) ----------

// Stiker brat statis (WebP) — dipakai command .brat
async function buatBratSticker(text, theme) {
  const img = await buatBratImage(text, theme);
  return convertToWebP(img, { video: false, mime: "image/png" });
}

// Stiker brat video / animasi (WebP animasi) — dipakai command .bratsticker
async function buatBratVideoSticker(text, theme) {
  const vid = await buatBratVideo(text, theme);
  return convertToWebP(vid, { video: true, mime: "video/mp4" });
}

module.exports = {
  BratError,
  buatBratImage,
  buatBratHD,
  buatBratVideo,
  buatBratSticker,
  buatBratVideoSticker,
  convertToWebP
};
