'use strict';
// ============================================
// MEDIA: download TikTok / Instagram / YouTube (video & mp3) + stiker WhatsApp
// Memakai program luar: yt-dlp dan ffmpeg (dipanggil tanpa shell → aman dari injeksi)
// ============================================
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

class MediaError extends Error {} // pesan aman ditampilkan ke pengguna

// ---------- util proses ----------
function run(cmd, args, { timeoutMs = 60000, maxOut = 2 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    let timedOut = false;
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const timer = setTimeout(() => {
      timedOut = true;
      p.kill('SIGKILL');
    }, timeoutMs);
    p.stdout.on('data', (d) => { if (out.length < maxOut) out += d; });
    p.stderr.on('data', (d) => { if (err.length < maxOut) err += d; });
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? Object.assign(new Error(`${cmd} tidak ditemukan`), { code: 'ENOENT' }) : e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err, timedOut });
    });
  });
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pplgbot-'));
const rmDir = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} };

// ---------- antrean (batasi unduhan bersamaan) ----------
function makeLimiter(max, maxWaiting = 5) {
  let active = 0;
  const waiting = [];
  const next = () => {
    while (active < max && waiting.length) {
      active++;
      waiting.shift()();
    }
  };
  return {
    get busy() { return active; },
    async run(fn) {
      if (active >= max && waiting.length >= maxWaiting) {
        throw new MediaError('⏳ Antrean unduhan penuh, coba lagi sebentar lagi ya.');
      }
      await new Promise((res) => { waiting.push(res); next(); });
      try {
        return await fn();
      } finally {
        active--;
        next();
      }
    }
  };
}
let limiter = null;
const getLimiter = (cfg) => (limiter ||= makeLimiter(cfg.concurrency || 2));

// ---------- cek program ----------
async function checkTools(cfg) {
  const res = {};
  for (const [name, cmd, arg] of [['ytdlp', cfg.ytdlp, '--version'], ['ffmpeg', cfg.ffmpeg, '-version']]) {
    try {
      const r = await run(cmd, [arg], { timeoutMs: 10000 });
      res[name] = r.code === 0 ? (r.out.split('\n')[0] || 'ok').trim() : null;
    } catch {
      res[name] = null;
    }
  }
  return res;
}

// ---------- URL ----------
const PLATFORMS = [
  { id: 'tiktok', nama: 'TikTok', hosts: ['tiktok.com'] },
  { id: 'instagram', nama: 'Instagram', hosts: ['instagram.com', 'instagr.am'] },
  { id: 'youtube', nama: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'] }
];

// Ambil URL pertama dari teks (buang tanda baca di ujung)
function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"'`]+/i);
  return m ? m[0].replace(/[)\].,;!?*_~]+$/, '') : null;
}

// Hanya domain yang diizinkan (mencegah yt-dlp dipakai untuk mengakses alamat sembarang)
function platformOf(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  return PLATFORMS.find((p) => p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) || null;
}

function explainYtdlpError(stderr) {
  const e = String(stderr || '');
  if (/larger than max-filesize|File is larger/i.test(e)) return '📦 File terlalu besar untuk dikirim lewat WhatsApp.';
  if (/does not pass filter|duration/i.test(e) && /filter/i.test(e)) return '⏱️ Durasinya terlalu panjang.';
  if (/Sign in to confirm|not a bot|cookies/i.test(e)) return '🔐 YouTube meminta verifikasi login. Admin perlu mengisi YTDLP_COOKIES (lihat README).';
  if (/login required|rate-limit reached|empty media response|requiring login/i.test(e)) return '🔐 Instagram meminta login untuk konten ini. Admin perlu mengisi YTDLP_COOKIES (lihat README).';
  if (/private|Private video|This video is private|unavailable|removed|not available|deleted/i.test(e)) return '🚫 Konten tidak tersedia / privat / sudah dihapus.';
  if (/Unsupported URL/i.test(e)) return '❓ Link ini tidak dikenali. Pastikan link langsung ke video/reel/post.';
  if (/Unable to download|HTTP Error|timed out|Temporary failure|Network is unreachable/i.test(e)) return '🌐 Gagal terhubung ke server. Coba lagi nanti.';
  if (/ffmpeg|ffprobe/i.test(e) && /not found|not installed|Postprocessing/i.test(e)) return '🛠️ ffmpeg belum terpasang di server bot.';
  return null;
}

// ---------- DOWNLOAD ----------
// mode: 'video' | 'audio'  →  { buffer, title, mime, size, ext }
async function download(url, mode, cfg) {
  const plat = platformOf(url);
  if (!plat) throw new MediaError('❓ Link belum didukung. Yang bisa: *TikTok*, *Instagram*, *YouTube*.');

  return getLimiter(cfg).run(async () => {
    const dir = tmpDir();
    try {
      const maxMb = cfg.maxMb;
      const args = [
        '--ignore-config', '--no-playlist', '--no-warnings', '--no-progress', '--no-colors',
        '--restrict-filenames',
        '--socket-timeout', '20', '--retries', '2',
        '--max-filesize', `${maxMb}M`,
        '--match-filter', `!is_live & duration<=?${cfg.maxMenit * 60}`,
        '--print', '%(title).100s', '--no-simulate',
        '-o', path.join(dir, 'out.%(ext)s')
      ];
      if (cfg.ffmpeg !== 'ffmpeg') args.push('--ffmpeg-location', cfg.ffmpeg);
      if (cfg.cookies && fs.existsSync(cfg.cookies)) args.push('--cookies', cfg.cookies);

      if (mode === 'audio') {
        args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '128K');
      } else {
        // utamakan mp4 (h264/aac) ≤720p supaya bisa diputar di semua HP
        args.push(
          '-f', 'b[height<=720][ext=mp4]/bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/bv*[height<=720]+ba/b',
          '-S', 'vcodec:h264,res,acodec:aac',
          '--merge-output-format', 'mp4'
        );
      }
      args.push('--', url); // "--" = apa pun setelahnya pasti URL, bukan opsi

      let r;
      try {
        r = await run(cfg.ytdlp, args, { timeoutMs: cfg.timeoutMs });
      } catch (e) {
        if (e.code === 'ENOENT') throw new MediaError('🛠️ *yt-dlp* belum terpasang di server bot. Admin: lihat bagian "Download & Stiker" di README.');
        throw e;
      }
      if (r.timedOut) throw new MediaError('⌛ Unduhan terlalu lama, dibatalkan. Coba link lain / coba lagi.');

      const files = fs.readdirSync(dir).filter((f) => f.startsWith('out.') && !/\.(part|ytdl|json)$/i.test(f));
      if (r.code !== 0 || !files.length) {
        console.error('[yt-dlp]', (r.err || r.out).trim().split('\n').slice(-3).join(' | '));
        // filter durasi/ukuran yang menolak unduhan tidak selalu menghasilkan kode error
        if (r.code === 0 && !files.length) throw new MediaError('📦 Video dilewati: terlalu panjang atau terlalu besar.');
        throw new MediaError(explainYtdlpError(r.err) || '❌ Gagal mengunduh. Pastikan link benar dan konten tidak privat.');
      }

      // pilih file hasil utama (hindari file bantu)
      files.sort((a, b) => fs.statSync(path.join(dir, b)).size - fs.statSync(path.join(dir, a)).size);
      const file = path.join(dir, files[0]);
      const ext = path.extname(file).slice(1).toLowerCase();
      const size = fs.statSync(file).size;
      if (size > maxMb * 1048576) throw new MediaError(`📦 File ${(size / 1048576).toFixed(1)} MB, melebihi batas ${maxMb} MB.`);
      if (mode === 'audio' && ext !== 'mp3') throw new MediaError('🛠️ Konversi ke MP3 gagal — pastikan *ffmpeg* terpasang.');
      if (mode === 'video' && !['mp4', 'mov', 'webm', 'mkv'].includes(ext)) {
        throw new MediaError('📷 Link ini berisi foto/slide, bukan video. Fitur foto belum tersedia.');
      }

      const title = (r.out.split('\n')[0] || '').trim() || plat.nama;
      return {
        buffer: fs.readFileSync(file),
        title, size, ext, platform: plat,
        mime: mode === 'audio' ? 'audio/mpeg' : 'video/mp4'
      };
    } finally {
      rmDir(dir);
    }
  });
}

// ---------- STIKER ----------
// Tambahkan metadata EXIF (nama pack & author) ke file WebP
function addExif(webp, pack, author) {
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
    'sticker-pack-name': String(pack || ''),
    'sticker-pack-publisher': String(author || ''),
    emojis: ['😀']
  }), 'utf8');
  const head = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
  ]);
  const exif = Buffer.concat([head, json]);
  exif.writeUInt32LE(json.length, 14);

  if (webp.length < 20 || webp.toString('ascii', 0, 4) !== 'RIFF' || webp.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('bukan file WebP');
  }
  let body = webp.subarray(12); // semua chunk setelah "WEBP"

  const chunk = (fourcc, data) => {
    const h = Buffer.alloc(8);
    h.write(fourcc, 0, 'ascii');
    h.writeUInt32LE(data.length, 4);
    return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };

  const first = body.toString('ascii', 0, 4);
  if (first === 'VP8X') {
    body = Buffer.from(body); // salinan agar aman diubah
    body[8] |= 0x08; // flag EXIF
  } else {
    // File sederhana (VP8 / VP8L) → bungkus dengan VP8X
    let w, h;
    if (first === 'VP8 ') {
      w = (body.readUInt16LE(14) & 0x3fff);
      h = (body.readUInt16LE(16) & 0x3fff);
    } else if (first === 'VP8L') {
      const bits = body.readUInt32LE(9);
      w = (bits & 0x3fff) + 1;
      h = ((bits >> 14) & 0x3fff) + 1;
    } else {
      throw new Error('format WebP tidak dikenal');
    }
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x08;
    vp8x.writeUIntLE(w - 1, 4, 3);
    vp8x.writeUIntLE(h - 1, 7, 3);
    body = Buffer.concat([chunk('VP8X', vp8x), body]);
  }
  body = Buffer.concat([body, chunk('EXIF', exif)]);

  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write('WEBP', 8, 'ascii');
  return Buffer.concat([riff, body]);
}

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/webm': 'webm', 'video/quicktime': 'mov'
};

// buffer gambar/video → Buffer WebP stiker 512x512
// opsi: { video: bool, crop: bool, mime, pack, author }
async function makeSticker(input, opts, cfg) {
  const dir = tmpDir();
  try {
    const ext = EXT_BY_MIME[opts.mime] || (opts.video ? 'mp4' : 'jpg');
    const src = path.join(dir, `in.${ext}`);
    const dst = path.join(dir, 'out.webp');
    fs.writeFileSync(src, input);

    const fit = opts.crop
      ? 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba'
      : 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000';
    // WhatsApp: stiker diam ≤100 KB, stiker bergerak ≤500 KB
    const limit = opts.video ? 500 * 1024 : 100 * 1024;
    const steps = opts.video
      ? [{ q: 50, fps: 15 }, { q: 35, fps: 12 }, { q: 22, fps: 10 }, { q: 12, fps: 8 }]
      : [{ q: 80 }, { q: 60 }, { q: 40 }, { q: 22 }];

    let out = null;
    for (const s of steps) {
      const vf = opts.video ? `fps=${s.fps},${fit}` : fit;
      const args = ['-y', '-v', 'error', ...(opts.video ? ['-t', '6'] : []), '-i', src, '-vf', vf,
        ...(opts.video ? [] : ['-frames:v', '1']),
        '-an', '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(s.q),
        '-compression_level', '6', ...(opts.video ? ['-loop', '0'] : []), dst];
      let r;
      try {
        r = await run(cfg.ffmpeg, args, { timeoutMs: 60000 });
      } catch (e) {
        if (e.code === 'ENOENT') throw new MediaError('🛠️ *ffmpeg* belum terpasang di server bot. Admin: lihat README.');
        throw e;
      }
      if (r.timedOut) throw new MediaError('⌛ Pembuatan stiker terlalu lama.');
      if (r.code !== 0 || !fs.existsSync(dst)) {
        console.error('[ffmpeg]', r.err.trim().split('\n').slice(-2).join(' | '));
        throw new MediaError('❌ Gagal memproses media itu menjadi stiker.');
      }
      out = fs.readFileSync(dst);
      if (out.length <= limit) break;
      fs.rmSync(dst, { force: true });
    }
    if (out.length > 1024 * 1024) throw new MediaError('📦 Hasil stiker terlalu besar. Coba media yang lebih pendek/sederhana.');
    return addExif(out, opts.pack ?? cfg.stickerPack, opts.author ?? cfg.stickerAuthor);
  } finally {
    rmDir(dir);
  }
}

module.exports = {
  MediaError, run, checkTools, extractUrl, platformOf, download, makeSticker, addExif,
  makeLimiter, explainYtdlpError, PLATFORMS
};
