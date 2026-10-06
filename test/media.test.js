'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const baseConfig = require('../config');
const T = require('../lib/time');
const { Store } = require('../lib/store');
const { handle } = require('../lib/commands');
const M = require('../lib/media');

const SENIN_0750 = '2026-10-05T00:50:00Z';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bot-m-'));
const tmpStore = () => new Store(path.join(tmp(), 'state.json'));

function mkCtx(text, over = {}) {
  return {
    text,
    chatId: '628111@s.whatsapp.net',
    isGroup: false,
    senderKeys: ['628111'],
    pushName: 'Rafiq',
    now: T.nowWIB(new Date(SENIN_0750)),
    store: tmpStore(),
    config: { ...baseConfig, admins: [] },
    startedAt: Date.now() - 90000,
    ...over
  };
}
const run = async (text, over) => (await handle(mkCtx(text, over))).map((r) => (typeof r === 'string' ? r : r)).flat();
const txt = async (text, over) => (await run(text, over)).filter((r) => typeof r === 'string').join('\n---\n');

// ---------- yt-dlp palsu untuk tes (tanpa internet) ----------
const FAKE_DIR = tmp();
const FAKE = path.join(FAKE_DIR, 'fake-ytdlp.js');
const LOG = path.join(FAKE_DIR, 'args.json');
fs.writeFileSync(FAKE, `#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
fs.writeFileSync(process.env.FAKE_LOG, JSON.stringify(a));
const url = a[a.length - 1];
if (url.includes('private')) { console.error('ERROR: [Instagram] x: This video is private'); process.exit(1); }
if (url.includes('login')) { console.error('ERROR: Sign in to confirm you are not a bot'); process.exit(1); }
if (url.includes('lama')) process.exit(0); // dilewati filter durasi → tidak ada file
if (url.includes('slow')) setTimeout(() => {}, 60000);
else {
  const tpl = a[a.indexOf('-o') + 1];
  const audio = a.includes('-x');
  fs.writeFileSync(tpl.replace('%(ext)s', audio ? 'mp3' : 'mp4'), Buffer.alloc(2048, 7));
  console.log('Judul Video Tes');
}
`);
fs.chmodSync(FAKE, 0o755);
process.env.FAKE_LOG = LOG;
const mediaCfg = (over = {}) => ({ ...baseConfig.media, ytdlp: FAKE, cooldownMs: 0, ...over });
const cfgWith = (over = {}) => ({ ...baseConfig, admins: [], media: mediaCfg(over) });

// ---------------- URL ----------------
test('extractUrl: ambil link & buang tanda baca di ujung', () => {
  assert.equal(M.extractUrl('dl https://vt.tiktok.com/ZSabc/ ya'), 'https://vt.tiktok.com/ZSabc/');
  assert.equal(M.extractUrl('lihat (https://youtu.be/abc123).'), 'https://youtu.be/abc123');
  assert.equal(M.extractUrl('tanpa link'), null);
});

test('platformOf: hanya TikTok/IG/YouTube, domain palsu & alamat lokal ditolak', () => {
  assert.equal(M.platformOf('https://www.tiktok.com/@a/video/1').id, 'tiktok');
  assert.equal(M.platformOf('https://vm.tiktok.com/xyz').id, 'tiktok');
  assert.equal(M.platformOf('https://www.instagram.com/reel/abc/').id, 'instagram');
  assert.equal(M.platformOf('https://youtu.be/abc').id, 'youtube');
  assert.equal(M.platformOf('https://music.youtube.com/watch?v=a').id, 'youtube');
  for (const bad of [
    'https://youtube.com.evil.com/x', 'https://evil.com/?u=youtube.com', 'https://nottiktok.com/a',
    'http://localhost:8080/', 'http://169.254.169.254/latest', 'file:///etc/passwd',
    'https://user:pw@youtube.com/x', 'ftp://youtube.com/a', 'bukan url'
  ]) assert.equal(M.platformOf(bad), null, bad);
});

// ---------------- download ----------------
test('download: video & mp3 lewat yt-dlp, URL dipisah dengan "--", file sementara dibersihkan', async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('pplgbot-')).length;
  const v = await M.download('https://vt.tiktok.com/abc', 'video', mediaCfg());
  assert.equal(v.title, 'Judul Video Tes');
  assert.equal(v.mime, 'video/mp4');
  assert.equal(v.buffer.length, 2048);
  let args = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  assert.equal(args[args.length - 2], '--');
  assert.equal(args[args.length - 1], 'https://vt.tiktok.com/abc');
  assert.ok(args.includes('--no-playlist') && args.includes('--ignore-config') && args.includes('--max-filesize'));

  const a = await M.download('https://youtu.be/abc', 'audio', mediaCfg());
  assert.equal(a.mime, 'audio/mpeg');
  args = JSON.parse(fs.readFileSync(LOG, 'utf8'));
  assert.ok(args.includes('-x') && args.includes('mp3'));

  const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('pplgbot-')).length;
  assert.equal(after, before); // tidak ada folder sementara tertinggal
});

test('download: pesan error yang ramah (privat, login, terlalu panjang, link asing, yt-dlp hilang)', async () => {
  await assert.rejects(M.download('https://instagram.com/p/private', 'video', mediaCfg()), /privat/);
  await assert.rejects(M.download('https://youtube.com/watch?v=login', 'video', mediaCfg()), /YTDLP_COOKIES/);
  await assert.rejects(M.download('https://youtube.com/watch?v=lama', 'video', mediaCfg()), /terlalu panjang/);
  await assert.rejects(M.download('https://example.com/a.mp4', 'video', mediaCfg()), /belum didukung/);
  await assert.rejects(
    M.download('https://youtu.be/a', 'video', mediaCfg({ ytdlp: '/tidak/ada/yt-dlp' })),
    /belum terpasang/
  );
});

test('download: unduhan yang menggantung dibatalkan oleh timeout', async () => {
  await assert.rejects(M.download('https://youtu.be/slow', 'video', mediaCfg({ timeoutMs: 400 })), /terlalu lama/);
});

test('limiter: antrean penuh ditolak, yang lain tetap berjalan berurutan', async () => {
  const lim = M.makeLimiter(1, 1);
  const order = [];
  const slow = lim.run(async () => { await new Promise((r) => setTimeout(r, 60)); order.push('a'); });
  const queued = lim.run(async () => { order.push('b'); });
  await assert.rejects(lim.run(async () => {}), /Antrean/);
  await Promise.all([slow, queued]);
  assert.deepEqual(order, ['a', 'b']);
});

// ---------------- perintah download ----------------
test('perintah dl: video terkirim sebagai objek media; link dari pesan yang dibalas juga dibaca', async () => {
  const r1 = await run('dl https://vt.tiktok.com/abc', { config: cfgWith() });
  const vid = r1.find((x) => typeof x === 'object');
  assert.ok(Buffer.isBuffer(vid.video));
  assert.match(vid.caption, /Judul Video Tes/);
  assert.match(vid.caption, /TikTok/);

  const r2 = await run('.tt', { config: cfgWith(), isGroup: true, chatId: '1@g.us', quotedText: 'nih https://www.tiktok.com/@a/video/1' });
  assert.ok(r2.some((x) => typeof x === 'object' && x.video));
});

test('perintah mp3: audio terkirim + judul', async () => {
  const r = await run('mp3 https://youtu.be/abc', { config: cfgWith() });
  const aud = r.find((x) => typeof x === 'object');
  assert.equal(aud.mimetype, 'audio/mpeg');
  assert.match(aud.fileName, /Judul Video Tes\.mp3$/);
  assert.ok(r.some((x) => typeof x === 'string' && /Judul Video Tes/.test(x)));
});

test('perintah dl: tanpa link, link asing, dan jeda antar unduhan', async () => {
  assert.match(await txt('dl', { config: cfgWith() }), /Download Video/);
  assert.match(await txt('mp3', { config: cfgWith() }), /Download MP3/);
  assert.match(await txt('dl https://example.com/x', { config: cfgWith() }), /belum didukung/);
  assert.match(await txt('dl https://instagram.com/p/private', { config: cfgWith() }), /privat/);

  const cfg = cfgWith({ cooldownMs: 60000 });
  const o = { config: cfg, senderKeys: ['628222'], chatId: '628222@s.whatsapp.net' };
  assert.ok((await run('dl https://youtu.be/a', o)).some((x) => typeof x === 'object'));
  assert.match(await txt('dl https://youtu.be/a', o), /Sabar/);
});

// ---------------- stiker ----------------
function webpChunks(buf) {
  const out = [];
  let i = 12;
  while (i < buf.length) {
    const id = buf.toString('ascii', i, i + 4);
    const n = buf.readUInt32LE(i + 4);
    out.push({ id, data: buf.subarray(i + 8, i + 8 + n) });
    i += 8 + n + (n & 1);
  }
  return out;
}
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('addExif: struktur WebP tetap valid & metadata pack tersimpan', { skip: !hasFfmpeg && 'ffmpeg tidak ada' }, async () => {
  const d = tmp();
  const png = path.join(d, 'a.png');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=300x200', '-frames:v', '1', png]).status, 0);
  const webp = await M.makeSticker(fs.readFileSync(png), { mime: 'image/png', pack: 'Kelas X', author: 'feyy' }, baseConfig.media);
  assert.equal(webp.toString('ascii', 0, 4), 'RIFF');
  assert.equal(webp.readUInt32LE(4), webp.length - 8);
  const chunks = webpChunks(webp);
  assert.equal(chunks[0].id, 'VP8X');
  assert.ok(chunks[0].data[0] & 0x08, 'flag EXIF aktif');
  assert.equal(chunks[0].data.readUIntLE(4, 3) + 1, 512); // lebar kanvas
  const exif = chunks.find((c) => c.id === 'EXIF').data;
  assert.equal(exif.readUInt32LE(14), exif.length - 22);
  const meta = JSON.parse(exif.subarray(22).toString('utf8'));
  assert.equal(meta['sticker-pack-name'], 'Kelas X');
  assert.equal(meta['sticker-pack-publisher'], 'feyy');
  assert.ok(webp.length <= 100 * 1024); // batas stiker diam WhatsApp
});

test('makeSticker: video pendek → stiker bergerak ≤500 KB', { skip: !hasFfmpeg && 'ffmpeg tidak ada' }, async () => {
  const d = tmp();
  const mp4 = path.join(d, 'a.mp4');
  assert.equal(spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=480x270:rate=15:duration=2', '-pix_fmt', 'yuv420p', mp4]).status, 0);
  const webp = await M.makeSticker(fs.readFileSync(mp4), { mime: 'video/mp4', video: true, crop: true }, baseConfig.media);
  assert.ok(webpChunks(webp).some((c) => c.id === 'ANIM'));
  assert.ok(webp.length <= 500 * 1024);
});

test('makeSticker: file rusak → pesan ramah, bukan crash', { skip: !hasFfmpeg && 'ffmpeg tidak ada' }, async () => {
  await assert.rejects(M.makeSticker(Buffer.from('bukan gambar'), { mime: 'image/png' }, baseConfig.media), /Gagal memproses/);
});

test('perintah s: tanpa media → panduan; dengan media → stiker; opsi crop & nama pack', { skip: !hasFfmpeg && 'ffmpeg tidak ada' }, async () => {
  assert.match(await txt('s'), /BUAT STIKER/); // tidak ada getMedia
  assert.match(await txt('s', { getMedia: async () => null }), /BUAT STIKER/);

  const d = tmp();
  const png = path.join(d, 'a.png');
  spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360', '-frames:v', '1', png]);
  const media = { buffer: fs.readFileSync(png), mime: 'image/png', isVideo: false };
  const r = await run('.s crop Pack Ku | Aku', { getMedia: async () => media, isGroup: true, chatId: '1@g.us' });
  const st = r.find((x) => typeof x === 'object');
  assert.ok(Buffer.isBuffer(st.sticker));
  const meta = JSON.parse(webpChunks(st.sticker).find((c) => c.id === 'EXIF').data.subarray(22).toString('utf8'));
  assert.equal(meta['sticker-pack-name'], 'Pack Ku');
  assert.equal(meta['sticker-pack-publisher'], 'Aku');

  const big = async () => { throw new M.MediaError('📦 Media terlalu besar (maks 15 MB).'); };
  assert.match(await txt('s', { getMedia: big }), /terlalu besar/);
});

// ---------------- admin ----------------
test('admin: pengirim dikenali lewat ID LID/nomor, nomor bot sendiri, dan 0812… → 62812…', async () => {
  assert.equal(baseConfig.normNum('0812-3456-789'), '628123456789');
  const cfg = { ...baseConfig, admins: ['628999', '123456789012345'] };
  const adminTugas = (over) => txt('tugas tambah mtk | x | besok', { config: cfg, ...over });

  assert.match(await adminTugas({ senderKeys: ['628111'] }), /khusus admin/);
  assert.match(await adminTugas({ senderKeys: ['628999'] }), /Tugas #1 ditambahkan/); // nomor
  assert.match(await adminTugas({ senderKeys: ['99999', '123456789012345'] }), /Tugas #1 ditambahkan/); // LID
  assert.match(await adminTugas({ senderKeys: ['628999'], isGroup: true, chatId: '1@g.us', text: '.tugas tambah mtk | x | besok' }), /ditambahkan/);
  assert.match(await adminTugas({ senderKeys: ['1'], fromMe: true }), /ditambahkan/); // pesan dari nomor bot sendiri
});

test('admin: ID terdeteksi ditampilkan saat ditolak, dan balasan sukses memuat jejak aksi admin', async () => {
  const cfg = { ...baseConfig, admins: ['628999'] };
  const deny = await txt('semester genap', { config: cfg, senderKeys: ['555123'] });
  assert.match(deny, /555123/);
  assert.match(deny, /admin tambah 555123/);

  const ok = await txt('semester genap', { config: cfg, senderKeys: ['628999'] });
  assert.match(ok, /Aksi admin: semester genap/);
});

test('admin: panel, tambah/hapus lewat bot (nomor, mention, balasan), dan admin .env tidak bisa dicabut', async () => {
  const store = tmpStore();
  const cfg = { ...baseConfig, admins: ['628999'] };
  const o = (extra = {}) => ({ store, config: cfg, senderKeys: ['628999'], ...extra });

  assert.match(await txt('admin', { store, config: cfg }), /khusus admin/);
  const panel = await txt('admin', o({ tools: { ytdlp: '2026.01.01', ffmpeg: 'ok' } }));
  assert.match(panel, /PANEL ADMIN/);
  assert.match(panel, /terdaftar di BOT_ADMINS/);
  assert.match(panel, /yt-dlp ✅ · ffmpeg ✅/);

  assert.match(await txt('admin tambah 0812-1111-2222', o()), /6281211112222/);
  assert.deepEqual(store.state.admins, ['6281211112222']);
  assert.match(await txt('admin tambah', o()), /Format/);
  assert.match(await txt('admin tambah', o({ targetKeys: ['777000111222333'] })), /777000111222333/); // mention/balasan (LID)
  assert.match(await txt('admin list', o()), /6281211112222[\s\S]*777000111222333/);

  // admin baru langsung bisa memakai perintah admin
  assert.match(await txt('tugas tambah mtk | x | besok', o({ senderKeys: ['777000111222333'] })), /ditambahkan/);

  assert.match(await txt('admin hapus 777000111222333', o()), /dicabut/);
  assert.match(await txt('tugas tambah mtk | x | besok', o({ senderKeys: ['777000111222333'] })), /khusus admin/);
  assert.match(await txt('admin hapus 628999', o()), /\.env/);
  assert.deepEqual(store.state.admins, ['6281211112222']);
});

test('admin: mode terbuka → "admin tambah" menjadikan pengirim admin pertama dan mengunci', async () => {
  const store = tmpStore();
  const cfg = { ...baseConfig, admins: [] };
  assert.match(await txt('admin', { store, config: cfg }), /Mode terbuka/);
  assert.match(await txt('admin tambah', { store, config: cfg, senderKeys: ['628111', '4444'] }), /628111/);
  assert.deepEqual(store.state.admins, ['628111', '4444']);
  assert.match(await txt('tugas tambah mtk | x | besok', { store, config: cfg, senderKeys: ['628555'] }), /khusus admin/);
});

test('cooldown dicek sebelum perintah dijalankan (perintah admin tidak ikut jalan saat dibatasi)', async () => {
  const store = tmpStore();
  const r = await handle(mkCtx('tugas tambah mtk | x | besok', { store, limited: () => true }));
  assert.deepEqual(r, []);
  assert.equal(store.state.tugas.length, 0);

  let dipanggil = 0;
  await handle(mkCtx('tugas tambah mtk | x | besok', { store, limited: () => { dipanggil++; return false; } }));
  assert.equal(dipanggil, 1);
  assert.equal(store.state.tugas.length, 1);

  // pesan biasa (bukan perintah) tidak menghabiskan jatah cooldown
  let n = 0;
  await handle(mkCtx('halo semua', { isGroup: true, chatId: '1@g.us', limited: () => { n++; return false; } }));
  await handle(mkCtx('.tidakadaperintahini', { isGroup: true, chatId: '1@g.us', limited: () => { n++; return false; } }));
  assert.equal(n, 0);
});
