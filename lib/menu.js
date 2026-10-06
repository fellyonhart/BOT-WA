'use strict';
// ============================================
// DEFINISI MENU INTERAKTIF
// Menu utama = daftar kategori; tiap kategori membuka daftar perintahnya.
// (Dibuat 2 tingkat supaya tiap list ≤ 10 baris — batas aman WhatsApp.)
//
// Mau tambah/ubah tombol? Cukup edit CATEGORIES di bawah:
//   cmd  = perintah yang dijalankan saat baris diketuk (tanpa prefix)
//   admin: true = baris hanya tampil untuk admin
// ============================================
const CATEGORIES = [
  {
    key: 'jadwal',
    icon: '📚',
    title: 'Jadwal & Seragam',
    desc: 'Pelajaran, seragam, cari guru',
    rows: [
      { cmd: 'sekarang', title: 'Pelajaran Sekarang', desc: 'Lagi pelajaran apa?' },
      { cmd: 'next', title: 'Pelajaran Berikutnya', desc: 'Setelah ini belajar apa' },
      { cmd: 'hariini', title: 'Jadwal Hari Ini', desc: 'Lengkap + seragam & deadline' },
      { cmd: 'besok', title: 'Jadwal Besok', desc: 'Siapkan buku untuk besok' },
      { cmd: 'seminggu', title: 'Jadwal Seminggu', desc: 'Senin sampai Jumat' },
      { cmd: 'jadwal', title: 'Pilih Hari…', desc: 'Lihat jadwal hari tertentu' },
      { cmd: 'seragam', title: 'Seragam Hari Ini', desc: 'Pakai seragam apa hari ini' },
      { cmd: 'seragam minggu', title: 'Seragam Seminggu', desc: 'Jadwal seragam Senin–Jumat' },
      { cmd: 'guru', title: 'Daftar Guru & Ruang', desc: 'Nama guru tiap mapel' },
      { cmd: 'cari', title: 'Cari Mapel / Guru', desc: 'Cari berdasarkan kata kunci' }
    ]
  },
  {
    key: 'tugas',
    icon: '📝',
    title: 'Tugas & Agenda',
    desc: 'Tugas, ulangan, acara kelas',
    rows: [
      { cmd: 'tugas', title: 'Daftar Tugas', desc: 'Tugas yang masih aktif' },
      { cmd: 'tugas semua', title: 'Semua Tugas', desc: 'Termasuk yang sudah selesai' },
      { cmd: 'agenda', title: 'Agenda & Ulangan', desc: 'Ulangan, libur, acara' },
      { cmd: 'tugas tambah', title: 'Cara Tambah Tugas', desc: 'Khusus admin', admin: true },
      { cmd: 'agenda tambah', title: 'Cara Tambah Agenda', desc: 'Khusus admin', admin: true }
    ]
  },
  {
    key: 'pengingat',
    icon: '🔔',
    title: 'Pengingat Otomatis',
    desc: 'Ringkasan pagi & deadline',
    rows: [
      { cmd: 'langganan status', title: 'Status Pengingat', desc: 'Cek pengingat di chat ini' },
      { cmd: 'langganan on', title: 'Aktifkan Pengingat', desc: 'Pagi, malam, dan deadline tugas' },
      { cmd: 'langganan off', title: 'Matikan Pengingat', desc: 'Berhenti semua pengingat' },
      { cmd: 'langganan kelas on', title: 'Ping Sebelum Pelajaran', desc: (ctx) => `${ctx.config.reminders.pelajaranMenit} menit sebelum jam pelajaran` },
      { cmd: 'langganan kelas off', title: 'Matikan Ping Pelajaran', desc: 'Hentikan ping sebelum pelajaran' }
    ]
  },
  {
    key: 'media',
    icon: '🎬',
    title: 'Download & Stiker',
    desc: 'Video, MP3, stiker',
    rows: [
      { cmd: 'dl', title: 'Download Video', desc: 'TikTok / Instagram / YouTube' },
      { cmd: 'mp3', title: 'Download MP3', desc: 'Ambil audionya saja' },
      { cmd: 's', title: 'Buat Stiker', desc: 'Dari gambar / video / GIF' }
    ]
  },
  {
    key: 'seru',
    icon: '🎲',
    title: 'Seru-seruan',
    desc: 'Acak, kelompok, koin, dadu',
    rows: [
      { cmd: 'acak', title: 'Acak Pilihan / Angka', desc: 'Pilih satu dari beberapa nama' },
      { cmd: 'kelompok', title: 'Bagi Kelompok', desc: 'Acak nama jadi kelompok' },
      { cmd: 'koin', title: 'Lempar Koin', desc: 'Angka atau gambar' },
      { cmd: 'dadu', title: 'Lempar Dadu', desc: 'Dadu 1–6' },
      { cmd: 'quote', title: 'Kata Motivasi', desc: 'Semangat buat anak PPLG' }
    ]
  },
  {
    key: 'ai',
    icon: '🤖',
    title: 'AI Assistant',
    desc: 'Tanya apa saja ke AI',
    rows: [
      { cmd: 'ai', title: 'Tanya AI', desc: 'Cara pakai: ai <pertanyaan>' },
      { cmd: 'resetai', title: 'Reset Riwayat AI', desc: 'Mulai percakapan baru' }
    ]
  },
  {
    key: 'lainnya',
    icon: '⚙️',
    title: 'Lainnya',
    desc: 'Semester, info bot, admin',
    rows: [
      { cmd: 'semester', title: 'Semester Aktif', desc: 'Ganjil / genap' },
      { cmd: 'ping', title: 'Ping Bot', desc: 'Cek bot hidup & kecepatan' },
      { cmd: 'id', title: 'ID Saya', desc: 'Lihat ID & status admin' },
      { cmd: 'tentang', title: 'Tentang Bot', desc: 'Versi & pembuat' },
      { cmd: 'admin', title: 'Panel Admin', desc: 'Khusus admin', admin: true },
      { cmd: 'menu teks', title: 'Menu Versi Teks', desc: 'Daftar lengkap tanpa tombol' }
    ]
  }
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
// Alias supaya "menu tugas", "menu download", "menu fun" dst. juga jalan
const ALIAS = {
  hari: 'jadwal', seragam: 'jadwal', pelajaran: 'jadwal',
  agenda: 'tugas', pr: 'tugas',
  reminder: 'pengingat', langganan: 'pengingat',
  download: 'media', dl: 'media', stiker: 'media', sticker: 'media',
  fun: 'seru', game: 'seru',
  info: 'lainnya', admin: 'lainnya'
};

const find = (name) => BY_KEY.get(name) || BY_KEY.get(ALIAS[name]) || null;

const prefixOf = (ctx) => ctx.config.prefixes[0] || '.';
const val = (v, ctx) => (typeof v === 'function' ? v(ctx) : v);

function salam(now) {
  if (now.h < 11) return 'Selamat pagi';
  if (now.h < 15) return 'Selamat siang';
  if (now.h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const footer = (ctx) => `Tombol tidak muncul? Ketik ${prefixOf(ctx)}menu teks`;

const row = (ctx, r) => ({
  id: `${prefixOf(ctx)}${r.cmd}`,
  title: r.title,
  description: val(r.desc, ctx)
});

// ---------- Menu utama ----------
function main(ctx, fallback) {
  const kelas = ctx.config.kelas;
  return {
    interactive: {
      title: `📋 MENU BOT ${kelas}`,
      body: `${salam(ctx.now)}, *${ctx.pushName || 'teman'}*! 👋\nAku bot kelas *${kelas}*.\n\nKetuk *📋 Pilih Menu* untuk melihat semua fitur, atau pakai tombol cepat di bawah.`,
      footer: footer(ctx),
      list: {
        button: '📋 Pilih Menu',
        sections: [
          {
            title: 'Kategori',
            rows: CATEGORIES.map((c) => ({
              id: `${prefixOf(ctx)}menu ${c.key}`,
              title: `${c.icon} ${c.title}`,
              description: c.desc
            }))
          }
        ]
      },
      buttons: [
        { id: `${prefixOf(ctx)}hariini`, text: '📅 Hari Ini' },
        { id: `${prefixOf(ctx)}next`, text: '⏭️ Berikutnya' },
        { id: `${prefixOf(ctx)}tugas`, text: '📝 Tugas' }
      ]
    },
    fallback
  };
}

// ---------- Sub-menu satu kategori ----------
function sub(ctx, cat) {
  const rows = cat.rows.filter((r) => !r.admin || ctx.isAdmin).map((r) => row(ctx, r));
  return {
    interactive: {
      title: `${cat.icon} ${cat.title.toUpperCase()}`,
      body: `${cat.desc}.\n\nKetuk *Pilih Perintah* lalu pilih yang kamu mau.`,
      footer: footer(ctx),
      list: { button: 'Pilih Perintah', sections: [{ title: cat.title, rows }] },
      buttons: [{ id: `${prefixOf(ctx)}menu`, text: '⬅️ Menu Utama' }]
    }
  };
}

// ---------- Pemilih hari (untuk perintah "jadwal" tanpa argumen) ----------
const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
function dayPicker(ctx, semesterAktif, fallback) {
  const p = prefixOf(ctx);
  return {
    interactive: {
      title: '📅 MAU LIHAT JADWAL KAPAN?',
      body: `Pilih hari yang ingin dilihat.\nSemester aktif: *${String(semesterAktif).toUpperCase()}*`,
      footer: `Semester lain: ketik ${p}jadwal rabu genap`,
      list: {
        button: 'Pilih Hari',
        sections: [
          {
            title: 'Hari sekolah',
            rows: [
              ...HARI.map((h) => ({
                id: `${p}jadwal ${h.toLowerCase()}`,
                title: h,
                description: ctx.now.hari === h ? 'Hari ini' : `Jadwal hari ${h}`
              })),
              { id: `${p}seminggu`, title: 'Seminggu Penuh', description: 'Senin sampai Jumat' }
            ]
          }
        ]
      },
      buttons: [
        { id: `${p}hariini`, text: '📅 Hari Ini' },
        { id: `${p}besok`, text: '➡️ Besok' },
        { id: `${p}menu`, text: '⬅️ Menu Utama' }
      ]
    },
    fallback
  };
}

module.exports = { CATEGORIES, find, main, sub, dayPicker };
