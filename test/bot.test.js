'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const baseConfig = require('../config');
const T = require('../lib/time');
const J = require('../lib/jadwal');
const { Store } = require('../lib/store');
const { handle } = require('../lib/commands');
const reminders = require('../lib/reminders');
const { levenshtein, chunkText, norm } = require('../lib/util');

// Senin, 5 Okt 2026 jam 07:50 WIB = 00:50 UTC
const at = (iso) => T.nowWIB(new Date(iso));
const SENIN_0750 = '2026-10-05T00:50:00Z';

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
  return new Store(path.join(dir, 'state.json'));
}

function mkCtx(text, over = {}) {
  return {
    text,
    chatId: '628111@s.whatsapp.net',
    isGroup: false,
    senderKeys: ['628111'],
    pushName: 'Rafiq',
    now: at(SENIN_0750),
    store: tmpStore(),
    config: { ...baseConfig, admins: [], interactive: false }, // tes lama = mode teks; tes menu interaktif ada di bagian bawah
    startedAt: Date.now() - 90000,
    ...over
  };
}
const run = async (text, over) => (await handle(mkCtx(text, over))).join('\n---\n');

// ---------------- waktu ----------------
test('jadwal tidak lagi memuat Piket Rayon', () => {
  for (const sem of ['ganjil', 'genap']) {
    for (const hari of ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']) {
      for (const item of J.getHari(sem, hari) || []) assert.notEqual(item.mapel, 'Piket Rayon');
    }
  }
});

test('nowWIB menghitung hari & jam WIB dari UTC', () => {
  const n = at(SENIN_0750);
  assert.equal(n.hari, 'Senin');
  assert.equal(n.hhmm, '07:50');
  assert.equal(n.ymd, '2026-10-05');
  // lewat tengah malam UTC tapi masih hari yang sama di WIB
  assert.equal(at('2026-10-04T17:30:00Z').hari, 'Senin'); // 00:30 WIB
});

test('parseRange & jam', () => {
  assert.deepEqual(T.parseRange('06.50-07.15'), { start: 410, end: 435 });
  assert.equal(T.jam(435), '07.15');
});

test('parseTanggal: berbagai format', () => {
  const n = at(SENIN_0750);
  assert.equal(T.parseTanggal('besok', n), '2026-10-06');
  assert.equal(T.parseTanggal('lusa', n), '2026-10-07');
  assert.equal(T.parseTanggal('+3', n), '2026-10-08');
  assert.equal(T.parseTanggal('jumat', n), '2026-10-09');
  assert.equal(T.parseTanggal("jum'at", n), '2026-10-09');
  assert.equal(T.parseTanggal('senin', n), '2026-10-12'); // hari yang sama = pekan depan
  assert.equal(T.parseTanggal('25/10', n), '2026-10-25');
  assert.equal(T.parseTanggal('25 okt', n), '2026-10-25');
  assert.equal(T.parseTanggal('3 desember 2026', n), '2026-12-03');
  assert.equal(T.parseTanggal('2/1', n), '2027-01-02'); // sudah lewat → tahun depan
  assert.equal(T.parseTanggal('31/02', n), null);
  assert.equal(T.parseTanggal('asal', n), null);
});

test('semester otomatis mengikuti kalender', () => {
  assert.equal(T.semesterByDate(at('2026-10-05T00:00:00Z')), 'ganjil');
  assert.equal(T.semesterByDate(at('2027-02-01T00:00:00Z')), 'genap');
});

// ---------------- jadwal ----------------
test('blocksOf menggabungkan JP berurutan', () => {
  const rabu = J.blocksOf(J.getHari('ganjil', 'Rabu'));
  const kokur = rabu.filter((b) => b.mapel === 'Kokurikuler');
  assert.equal(kokur.length, 3); // dipisah dua istirahat
  assert.equal(kokur.reduce((a, b) => a + b.jp, 0), 10);
});

test('statusSekarang: sedang belajar, sebelum mulai, selesai, libur', () => {
  const sedang = J.statusSekarang(at('2026-10-05T01:30:00Z'), 'ganjil'); // Senin 08:30
  assert.match(sedang, /SEDANG BELAJAR/);
  assert.match(sedang, /B\. Inggris/);
  assert.match(sedang, /Setelah ini/);

  assert.match(J.statusSekarang(at('2026-10-04T22:00:00Z'), 'ganjil'), /Belum mulai/); // 05:00
  assert.match(J.statusSekarang(at('2026-10-05T11:00:00Z'), 'ganjil'), /sudah selesai/); // 18:00
  assert.match(J.statusSekarang(at('2026-10-09T17:00:00Z'), 'ganjil'), /libur/); // Sabtu
});

test('nextPelajaran melompat ke hari sekolah berikutnya', () => {
  const n = J.nextPelajaran(at('2026-10-09T10:00:00Z'), 'ganjil'); // Jumat 17:00
  assert.equal(n.hari, 'Senin');
  assert.equal(n.offset, 3);
});

test('cari: mapel, alias, guru, ruang', () => {
  assert.equal(J.cari('mtk', 'ganjil').ada, true);
  assert.match(J.cari('mtk', 'ganjil').text, /Dede H/);
  assert.match(J.cari('endang', 'ganjil').text, /B\. Inggris/);
  assert.equal(J.cari('223', 'ganjil').ada, true); // nomor ruang
  assert.equal(J.cari('207', 'ganjil').ada, false); // ruang 207 hanya ada di semester genap
  assert.equal(J.cari('207', 'genap').ada, true);
  assert.equal(J.cari('zzzz', 'ganjil').ada, false);
  assert.equal(J.cari('a', 'ganjil'), null);
});

// ---------------- perintah ----------------
test('menu & angka lama tetap bekerja di chat pribadi', async () => {
  assert.match(await run('menu'), /MENU BOT PPLG X-3/);
  assert.match(await run('1'), /SERAGAM/);
  assert.match(await run('3'), /JADWAL PPLG X-3/);
  assert.match(await run('4'), /SEMINGGU/);
  assert.match(await run('8'), /MADE from feyy/);
});

test('grup: wajib prefix, tanpa prefix diabaikan', async () => {
  assert.deepEqual(await handle(mkCtx('menu', { isGroup: true, chatId: '1@g.us' })), []);
  assert.deepEqual(await handle(mkCtx('halo semua', { isGroup: true, chatId: '1@g.us' })), []);
  assert.match(await run('.menu', { isGroup: true, chatId: '1@g.us' }), /awali perintah dengan/);
  // perintah tak dikenal di grup tidak dibalas (anti spam)
  assert.deepEqual(await handle(mkCtx('.xyzabc', { isGroup: true, chatId: '1@g.us' })), []);
});

test('salah ketik → saran "maksud kamu"', async () => {
  assert.match(await run('jadwl'), /Maksud kamu \*jadwal\*/);
  assert.match(await run('sekarng'), /Maksud kamu \*sekarang\*/);
  assert.match(await run('qwertyuiop'), /tidak dikenali/);
});

test('jadwal: hari, besok, ganjil/genap, dan hari tak valid', async () => {
  assert.match(await run('jadwal senin'), /SENIN/);
  assert.match(await run('jadwal rabu genap'), /GENAP/);
  assert.match(await run('jadwal besok'), /SELASA/);
  assert.match(await run('jadwal sabtu'), /libur/);
  assert.match(await run('jadwal hari ini'), /▶️/); // penanda sedang berlangsung
  assert.match(await run('jadwal hari xyz'), /tidak dikenali/);
});

test('sekarang / next / seragam / besok', async () => {
  assert.match(await run('sekarang'), /Upacara|BELAJAR|SEDANG/);
  assert.match(await run('next'), /BERIKUTNYA/);
  assert.match(await run('seragam besok'), /Pramuka/);
  assert.match(await run('seragam senin'), /Jas abu/);
  assert.match(await run('seragam jumat'), /Jumat/);
  assert.match(await run('seragam minggu'), /hari ini/);
  assert.match(await run('besok'), /Seragam: \*Seragam Pramuka/);
});

test('semester: otomatis, kunci manual, dan hak admin', async () => {
  const store = tmpStore();
  assert.match(await run('semester', { store }), /GANJIL/);
  assert.match(await run('semester genap', { store }), /dikunci ke \*GENAP\*/);
  assert.equal(store.state.semesterMode, 'manual');
  assert.match(await run('jadwal senin', { store }), /GENAP/);
  assert.match(await run('set semester auto', { store }), /otomatis/);
  assert.equal(store.state.semesterMode, 'auto');

  // bila admin dikonfigurasi, anggota biasa ditolak
  const cfg = { ...baseConfig, admins: ['628999'] };
  assert.match(await run('semester genap', { config: cfg }), /khusus admin/);
  assert.match(await run('semester genap', { config: cfg, senderKeys: ['628999'] }), /dikunci/);
});

test('tugas: tambah, daftar, selesai, hapus, validasi', async () => {
  const store = tmpStore();
  const o = { store };
  assert.match(await run('tugas', o), /Belum ada tugas/);
  assert.match(await run('tugas tambah MTK', o), /Format/);
  assert.match(await run('tugas tambah mtk | Latihan bab 3 | 31/02', o), /tidak dikenali/);
  assert.match(await run('tugas tambah mtk | Latihan bab 3 | 1/1/2020', o), /sudah lewat/);
  assert.match(await run('tugas tambah mtk | Latihan bab 3 hal 20 | besok', o), /Tugas #1 ditambahkan/);
  assert.match(await run('tugas tambah indo | Esai | jumat', o), /Tugas #2/);

  const list = await run('tugas', o);
  assert.match(list, /MTK — Latihan bab 3 hal 20/); // alias "mtk" dikanonkan
  assert.match(list, /B\. Indo — Esai/);
  assert.match(list, /BESOK/);
  assert.ok(list.indexOf('#1') < list.indexOf('#2')); // urut deadline

  assert.match(await run('besok', o), /Deadline besok/);
  assert.match(await run('tugas selesai 1', o), /selesai/);
  assert.doesNotMatch(await run('tugas', o), /#1/);
  assert.match(await run('tugas semua', o), /#1/);
  assert.match(await run('tugas hapus 2', o), /dihapus/);
  assert.match(await run('tugas hapus 99', o), /tidak ditemukan/);
});

test('tugas: anggota non-admin hanya bisa melihat', async () => {
  const cfg = { ...baseConfig, admins: ['628999'] };
  const store = tmpStore();
  const o = { store, config: cfg };
  assert.match(await run('tugas tambah mtk | x | besok', o), /khusus admin/);
  assert.match(await run('tugas', o), /Belum ada tugas/);
  assert.equal(store.state.tugas.length, 0);
});

test('agenda: tambah dengan catatan & hanya tampil yang akan datang', async () => {
  const store = tmpStore();
  const o = { store };
  assert.match(await run('agenda tambah Ulangan MTK | 15/10 | Bab 1-3', o), /Agenda #1/);
  const list = await run('agenda', o);
  assert.match(list, /Ulangan MTK — Bab 1-3/);
  assert.match(list, /H-10/);
});

test('langganan: aktif/nonaktif/opsi, dan di grup hanya admin', async () => {
  const store = tmpStore();
  const o = { store };
  assert.match(await run('langganan', o), /NONAKTIF/);
  assert.match(await run('langganan on', o), /diaktifkan/);
  assert.ok(store.state.subscribers['628111@s.whatsapp.net']);
  assert.match(await run('langganan kelas on', o), /dinyalakan/);
  assert.equal(store.state.subscribers['628111@s.whatsapp.net'].kelas, true);
  assert.match(await run('langganan pagi off', o), /dimatikan/);
  assert.match(await run('langganan', o), /AKTIF/);
  assert.match(await run('langganan off', o), /dimatikan untuk chat ini/);
  assert.equal(Object.keys(store.state.subscribers).length, 0);

  const cfg = { ...baseConfig, admins: ['628999'] };
  assert.match(await run('.langganan on', { config: cfg, isGroup: true, chatId: '1@g.us' }), /khusus admin/);
});

test('pengumuman: admin saja, memanggil broadcast', async () => {
  let sent = null;
  const broadcast = async (t) => { sent = t; return 3; };
  const cfg = { ...baseConfig, admins: ['628999'] };
  assert.match(await run('pengumuman halo', { config: cfg, broadcast }), /khusus admin/);
  assert.equal(sent, null);
  assert.match(await run('pengumuman Besok libur', { config: cfg, broadcast, senderKeys: ['628999'] }), /3 chat/);
  assert.match(sent, /Besok libur/);
});

test('fitur seru: acak, kelompok, koin, dadu, quote', async () => {
  assert.match(await run('acak Budi, Sari, Andi'), /Budi|Sari|Andi/);
  assert.match(await run('acak 1-36'), /Angka acak/);
  assert.match(await run('acak sendirian'), /Contoh/);

  const g = await run('kelompok 3 | a, b, c, d, e, f, g');
  assert.match(g, /3 KELOMPOK/);
  const names = g.match(/\d\. ([a-g])/g);
  assert.equal(names.length, 7); // semua nama terbagi, tidak ada yang hilang
  assert.equal(new Set(names.map((x) => x.slice(-1))).size, 7);
  assert.match(await run('kelompok 5 | a, b'), /Butuh/);

  assert.match(await run('koin'), /Angka|Gambar/);
  assert.match(await run('dadu 2'), /=/);
  assert.match(await run('quote'), /💬/);
});

test('id & ping & halo', async () => {
  assert.match(await run('id'), /628111/);
  assert.match(await run('ping'), /Pong/);
  assert.match(await run('halo'), /Selamat pagi, \*Rafiq\*/);
  assert.match(await run('assalamualaikum'), /Wa’alaikumussalam/);
});

// ---------------- pengingat ----------------
function subscribe(store, extra = {}) {
  store.state.subscribers['628111@s.whatsapp.net'] = { pagi: true, malam: true, tugas: true, kelas: false, ...extra };
}

test('pengingat pagi: terkirim sekali, berisi seragam, jadwal, dan tugas', () => {
  const store = tmpStore();
  subscribe(store);
  store.state.tugas.push({ id: 1, title: 'MTK', desc: 'Bab 3', due: '2026-10-06', done: false, created: '2026-10-01' });

  const due = reminders.collect(store, baseConfig, new Date('2026-10-04T22:45:00Z')); // Senin 05:45 WIB
  assert.equal(due.length, 1);
  assert.match(due[0].text, /Selamat pagi/);
  assert.match(due[0].text, /Seragam Jas abu/);
  assert.match(due[0].text, /B\. Inggris/);
  assert.match(due[0].text, /\*MTK\* — Bab 3/);

  // belum ditandai terkirim → tick berikutnya (menit sama) tidak mengulang karena lastTick
  assert.equal(reminders.collect(store, baseConfig, new Date('2026-10-04T22:45:30Z')).length, 0);
  // setelah ditandai terkirim, kunci yang sama tidak keluar lagi walau dikejar ulang
  reminders.markSent(store, due[0].key);
  store.state.lastTick = 0;
  assert.equal(reminders.collect(store, baseConfig, new Date('2026-10-04T22:45:10Z')).length, 0);
});

test('pengingat: tidak ada di akhir pekan; malam hanya bila besok sekolah', () => {
  const store = tmpStore();
  subscribe(store);
  // Sabtu 05:45 WIB
  assert.equal(reminders.collect(store, baseConfig, new Date('2026-10-09T22:45:00Z')).length, 0);
  // Jumat 20:00 WIB → besok Sabtu → tidak ada
  store.state.lastTick = 0;
  assert.equal(reminders.collect(store, baseConfig, new Date('2026-10-09T13:00:00Z')).length, 0);
  // Minggu 20:00 WIB → besok Senin → ada
  store.state.lastTick = 0;
  const due = reminders.collect(store, baseConfig, new Date('2026-10-04T13:00:00Z'));
  assert.equal(due.length, 1);
  assert.match(due[0].text, /Persiapan besok\* — Senin/);
});

test('pengingat kelas: 10 menit sebelum pelajaran, hanya bila opt-in', () => {
  const store = tmpStore();
  subscribe(store, { pagi: false, malam: false, kelas: false });
  // B. Inggris Senin mulai 08.15 → ping 08:05 WIB = 01:05 UTC
  assert.equal(reminders.collect(store, baseConfig, new Date('2026-10-05T01:05:00Z')).length, 0);
  store.state.lastTick = 0;
  subscribe(store, { pagi: false, malam: false, kelas: true });
  const due = reminders.collect(store, baseConfig, new Date('2026-10-05T01:05:00Z'));
  assert.equal(due.length, 1);
  assert.match(due[0].text, /10 menit lagi/);
  assert.match(due[0].text, /B\. Inggris/);
});

test('pengingat: catch-up menit yang terlewat (maks 5 menit)', () => {
  const store = tmpStore();
  subscribe(store);
  store.state.lastTick = new Date('2026-10-04T22:42:00Z').getTime();
  // event loop tersendat: tick berikutnya baru jalan 05:47 → 05:45 tetap terkejar
  const due = reminders.collect(store, baseConfig, new Date('2026-10-04T22:47:00Z'));
  assert.equal(due.length, 1);
  // tertinggal terlalu lama (>5 menit) → tidak dikejar
  const s2 = tmpStore();
  subscribe(s2);
  s2.state.lastTick = new Date('2026-10-04T22:00:00Z').getTime();
  assert.equal(reminders.collect(s2, baseConfig, new Date('2026-10-04T22:55:00Z')).length, 0);
});

// ---------------- store & util ----------------
test('store: simpan lalu muat ulang, dan pulih dari file rusak', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
  const file = path.join(dir, 'sub', 'state.json');
  const a = new Store(file);
  a.state.tugas.push({ id: 1, title: 'X' });
  a.flush();
  assert.equal(new Store(file).state.tugas[0].title, 'X');

  fs.writeFileSync(file, '{rusak');
  const b = new Store(file);
  assert.deepEqual(b.state.tugas, []); // mulai bersih
  assert.ok(fs.readdirSync(path.dirname(file)).some((f) => f.includes('.corrupt-'))); // salinan disimpan
});

test('util: levenshtein, chunkText, norm', () => {
  assert.equal(levenshtein('jadwl', 'jadwal'), 1);
  assert.equal(norm("Jum'at  ÜNI"), 'jumat uni');
  const chunks = chunkText(Array.from({ length: 200 }, (_, i) => `baris ${i} `.padEnd(40, 'x')).join('\n'), 1000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 1100));
});

// ---------------- menu interaktif (tombol + list) ----------------
const I = require('../lib/interactive');
const Menu = require('../lib/menu');

const ON = { ...baseConfig, admins: [], interactive: true };
const runI = async (text, over = {}) => handle(mkCtx(text, { config: ON, ...over }));
const rowsOf = (spec) => (spec.list?.sections || []).flatMap((s) => s.rows);

test('menu: balasan berupa pesan interaktif (list kategori + 3 tombol cepat)', async () => {
  const [r, ...rest] = await runI('menu');
  assert.equal(rest.length, 0);
  assert.ok(I.isInteractive(r));
  const s = r.interactive;
  assert.match(s.title, /MENU BOT PPLG X-3/);
  assert.match(s.body, /Selamat pagi, \*Rafiq\*/);
  assert.equal(rowsOf(s).length, Menu.CATEGORIES.length);
  assert.equal(s.buttons.length, 3);
  assert.match(r.fallback, /MENU BOT PPLG X-3/); // cadangan teks = menu lama
});

test('menu: teks, sub-menu, alias kategori, dan angka 0', async () => {
  const [t] = await runI('menu teks');
  assert.equal(typeof t, 'string');
  assert.match(t, /MENU BOT PPLG X-3/);

  const [j] = await runI('menu jadwal');
  assert.ok(I.isInteractive(j));
  assert.match(j.interactive.title, /JADWAL & SERAGAM/);
  assert.ok(rowsOf(j.interactive).some((x) => x.id === '.hariini'));

  const [alias] = await runI('menu download');
  assert.match(alias.interactive.title, /DOWNLOAD & STIKER/);

  assert.ok(I.isInteractive((await runI('0'))[0]));
  assert.ok(I.isInteractive((await runI('menu ngawur'))[0])); // kategori tak dikenal → menu utama
});

test('menu: INTERACTIVE_MENU=off → semua balasan kembali berupa teks', async () => {
  const out = await handle(mkCtx('menu', { config: { ...ON, interactive: false } }));
  assert.equal(out.length, 1);
  assert.equal(typeof out[0], 'string');
  assert.match(out[0], /MENU BOT PPLG X-3/);
  // picker hari juga turun ke teks lama
  const j = await handle(mkCtx('jadwal', { config: { ...ON, interactive: false } }));
  assert.match(j[0], /MAU LIHAT JADWAL KAPAN/);
});

test('jadwal tanpa argumen → pilih hari (list Senin–Jumat + seminggu)', async () => {
  const [r] = await runI('jadwal');
  assert.ok(I.isInteractive(r));
  const ids = rowsOf(r.interactive).map((x) => x.id);
  assert.deepEqual(ids, ['.jadwal senin', '.jadwal selasa', '.jadwal rabu', '.jadwal kamis', '.jadwal jumat', '.seminggu']);
  assert.match(r.fallback, /MAU LIHAT JADWAL KAPAN/);
});

test('menu: baris khusus admin hanya tampil untuk admin', async () => {
  const cfg = { ...ON, admins: ['628999'] };
  const member = (await runI('menu tugas', { config: cfg }))[0];
  assert.ok(!rowsOf(member.interactive).some((x) => /tambah/.test(x.id)));
  const admin = (await runI('menu tugas', { config: cfg, senderKeys: ['628999'] }))[0];
  assert.ok(rowsOf(admin.interactive).some((x) => x.id === '.tugas tambah'));
  const lain = (await runI('menu lainnya', { config: cfg }))[0];
  assert.ok(!rowsOf(lain.interactive).some((x) => x.id === '.admin'));
});

test('menu: semua menu patuh batas WhatsApp (jumlah baris & panjang teks)', async () => {
  const cfg = { ...ON, admins: [] }; // mode terbuka → semua baris admin ikut tampil
  const all = [(await runI('menu', { config: cfg }))[0], (await runI('jadwal', { config: cfg }))[0]];
  for (const c of Menu.CATEGORIES) all.push((await runI(`menu ${c.key}`, { config: cfg }))[0]);
  for (const r of all) {
    const s = r.interactive;
    const rows = rowsOf(s);
    assert.ok(rows.length >= 1 && rows.length <= I.LIM.rows, `${s.title}: ${rows.length} baris`);
    assert.ok(s.buttons.length <= I.LIM.quick);
    assert.ok(Array.from(s.footer).length <= I.LIM.footer, 'footer terlalu panjang');
    assert.ok(Array.from(s.list.button).length <= I.LIM.listButton);
    for (const x of rows) {
      assert.ok(Array.from(x.title).length <= I.LIM.rowTitle, `judul baris "${x.title}"`);
      assert.ok(Array.from(x.description).length <= I.LIM.rowDesc, `deskripsi "${x.description}"`);
    }
    for (const b of s.buttons) assert.ok(Array.from(b.text).length <= I.LIM.button, `tombol "${b.text}"`);
    assert.equal(new Set(rows.map((x) => x.id)).size, rows.length, 'id baris harus unik');
  }
});

test('menu: SETIAP tombol/baris mengarah ke perintah yang ada (tidak ada tombol mati)', async () => {
  const cfg = { ...ON, admins: [] };
  const specs = [(await runI('menu', { config: cfg }))[0], (await runI('jadwal', { config: cfg }))[0]];
  for (const c of Menu.CATEGORIES) specs.push((await runI(`menu ${c.key}`, { config: cfg }))[0]);

  const ids = new Set();
  for (const r of specs) {
    for (const x of rowsOf(r.interactive)) ids.add(x.id);
    for (const b of r.interactive.buttons) ids.add(b.id);
  }
  assert.ok(ids.size > 40);
  for (const id of ids) {
    const out = await handle(mkCtx(id, { config: cfg })); // persis seperti diketik pengguna
    const txt = out.map((o) => (typeof o === 'string' ? o : JSON.stringify(o))).join('\n');
    assert.ok(out.length >= 1, `"${id}" tidak membalas apa pun`);
    assert.doesNotMatch(txt, /Perintah tidak dikenali|Maksud kamu/, `"${id}" tidak dikenali router`);
  }
});

test('menu di grup: id berprefix tetap diproses, tanpa prefix diabaikan', async () => {
  const g = { isGroup: true, chatId: '1@g.us' };
  const [r] = await runI('.menu', g);
  assert.ok(I.isInteractive(r));
  assert.ok(rowsOf(r.interactive).every((x) => x.id.startsWith('.')));
  assert.match(r.interactive.footer, /\.menu teks/);
  // ketukan baris = pesan ".menu jadwal" → diproses
  assert.ok(I.isInteractive((await runI('.menu jadwal', g))[0]));
  assert.match((await runI('.hariini', g))[0], /JADWAL PPLG X-3/);
  // tanpa prefix → diabaikan seperti biasa
  assert.deepEqual(await runI('hariini', g), []);
});

// ---------------- lib/interactive ----------------
test('interactive: buildContent menyusun single_select + quick_reply sesuai format native flow', () => {
  const spec = {
    title: 'Judul', body: 'Isi', footer: 'Kaki',
    list: { button: 'Buka', sections: [{ title: 'Sek', rows: [{ id: '.a', title: 'A', description: 'deskripsi A' }] }] },
    buttons: [{ id: '.b', text: 'B' }]
  };
  const c = I.buildContent(spec);
  const m = c.viewOnceMessage.message;
  assert.deepEqual(m.messageContextInfo, { deviceListMetadata: {}, deviceListMetadataVersion: 2 });
  const im = m.interactiveMessage;
  assert.equal(im.header.title, 'Judul');
  assert.equal(im.body.text, 'Isi');
  assert.equal(im.footer.text, 'Kaki');
  const [sel, quick] = im.nativeFlowMessage.buttons;
  assert.equal(sel.name, 'single_select');
  const sp = JSON.parse(sel.buttonParamsJson);
  assert.equal(sp.title, 'Buka');
  assert.deepEqual(sp.sections[0].rows[0], { header: '', title: 'A', description: 'deskripsi A', id: '.a' });
  assert.equal(quick.name, 'quick_reply');
  assert.deepEqual(JSON.parse(quick.buttonParamsJson), { display_text: 'B', id: '.b' });
  assert.throws(() => I.buildContent({ body: 'x' }), /tanpa tombol/);
});

test('interactive: teks dipotong aman (emoji utuh), tombol cepat maks 3, baris maks 10', () => {
  assert.equal(I.clamp('abcdef', 4), 'abc…');
  assert.equal(I.clamp('📋📋📋📋', 3), '📋📋…'); // tidak memotong di tengah emoji
  const rows = Array.from({ length: 14 }, (_, i) => ({ id: `.r${i}`, title: `Baris ${i}` }));
  const buttons = Array.from({ length: 5 }, (_, i) => ({ id: `.b${i}`, text: `B${i}` }));
  const nb = I.nativeButtons({ body: 'x', list: { button: 'L', sections: [{ rows }] }, buttons });
  assert.equal(nb.filter((b) => b.name === 'quick_reply').length, 3);
  assert.equal(JSON.parse(nb[0].buttonParamsJson).sections[0].rows.length, 10);
});

test('interactive: node biz selalu ada; node bot hanya untuk chat pribadi', () => {
  const priv = I.bizNodes('628111@s.whatsapp.net');
  assert.equal(priv[0].tag, 'biz');
  assert.equal(priv[0].content[0].attrs.type, 'native_flow');
  assert.ok(priv.some((n) => n.tag === 'bot' && n.attrs.biz_bot === '1'));
  const grp = I.bizNodes('1@g.us');
  assert.equal(grp.length, 1);
});

test('interactive: send → generateWAMessageFromContent + relayMessage (+ additionalNodes)', async () => {
  const calls = {};
  const deps = {
    proto: { Message: { InteractiveMessage: { create: (o) => o } } },
    generateWAMessageFromContent: (jid, content, opts) => {
      calls.gen = { jid, content, opts };
      return { key: { id: 'MSG123' }, message: content };
    }
  };
  const sock = {
    user: { id: '628000:1@s.whatsapp.net' },
    relayMessage: async (jid, message, o) => { calls.relay = { jid, message, o }; }
  };
  const quoted = { key: { id: 'Q1' } };
  const res = await I.send(sock, '628111@s.whatsapp.net', { body: 'hai', buttons: [{ id: '.x', text: 'X' }] }, { deps, quoted });
  assert.equal(res.key.id, 'MSG123');
  assert.equal(calls.gen.opts.userJid, '628000:1@s.whatsapp.net');
  assert.equal(calls.gen.opts.quoted, quoted);
  assert.equal(calls.relay.o.messageId, 'MSG123');
  assert.equal(calls.relay.o.additionalNodes[0].tag, 'biz');
});

test('interactive: membaca ketukan tombol/list dari berbagai format respons', () => {
  const nf = (name, obj) => ({ interactiveResponseMessage: { nativeFlowResponseMessage: { name, paramsJson: JSON.stringify(obj) } } });
  assert.equal(I.replyIdOf(nf('single_select', { title: 'x', id: '.hariini' })), '.hariini');
  assert.equal(I.replyIdOf(nf('quick_reply', { display_text: 'x', id: '.next' })), '.next');
  assert.equal(I.replyIdOf(nf('single_select', { selectedRowId: '.besok' })), '.besok');
  assert.equal(I.replyIdOf({ buttonsResponseMessage: { selectedButtonId: '.tugas' } }), '.tugas');
  assert.equal(I.replyIdOf({ listResponseMessage: { singleSelectReply: { selectedRowId: '.agenda' } } }), '.agenda');
  assert.equal(I.replyIdOf({ templateButtonReplyMessage: { selectedId: '.ping' } }), '.ping');
  assert.equal(I.replyIdOf(nf('x', { tanpa: 'id' })), '');
  assert.equal(I.replyIdOf({ interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{rusak' } } }), '');
  assert.equal(I.replyIdOf({ conversation: 'halo' }), '');
  assert.ok(I.isReply(nf('quick_reply', {})));
  assert.ok(!I.isReply({ conversation: 'halo' }));
});

test('interactive: toText membuat daftar perintah bila command tak menyediakan fallback', () => {
  const t = I.toText({ title: 'T', body: 'B', list: { button: 'x', sections: [{ title: 'S', rows: [{ id: '.a', title: 'Aaa' }] }] }, buttons: [{ id: '.b', text: 'Bbb' }] });
  assert.match(t, /\*T\*/);
  assert.match(t, /\*\.a\* — Aaa/);
  assert.match(t, /\*\.b\* — Bbb/);
});
