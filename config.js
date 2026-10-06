'use strict';
// ============================================
// KONFIGURASI BOT PPLG X-3
// Nilai bisa diubah lewat file .env (lihat .env.example)
// ============================================
const fs = require('fs');
const path = require('path');

// Loader .env mini (tanpa dependency tambahan)
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
})();

const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.replace(/\D/g, ''))
    .filter(Boolean);

module.exports = {
  versi: '2.0.0',
  kelas: 'PPLG X-3',
  sekolah: 'SMK Wikrama',
  tahunAjaran: '2026-2027',
  timezone: 'Asia/Jakarta',

  // Di grup, bot hanya merespons pesan berawalan salah satu prefix ini
  prefixes: ['.', '!', '/'],

  // Native-flow WhatsApp tidak resmi; aktifkan hanya bila tombol berfungsi di perangkat.
  interactive: /^on$/i.test(process.env.INTERACTIVE_MENU || ''),

  // Nomor admin (angka saja, pisahkan koma). Kosong = semua orang dianggap admin.
  // Ketik ".id" ke bot untuk melihat nomor/ID kamu.
  admins: list(process.env.BOT_ADMINS),

  // Isi nomor bot (628xxx) untuk login pakai pairing code, tanpa scan QR
  pairNumber: (process.env.PAIR_NUMBER || '').replace(/\D/g, ''),

  reminders: {
    pagi: '05:45', // ringkasan hari ini (Senin-Jumat)
    malam: '20:00', // persiapan besok (Minggu-Kamis malam)
    pelajaranMenit: 10 // pengingat sebelum pelajaran (opsional per chat)
  },

  cooldownMs: 1500, // jeda minimal antar perintah per pengguna
  dataFile: path.join(__dirname, 'data', 'state.json'),
  authDir: path.join(__dirname, 'auth_info_baileys')
};
