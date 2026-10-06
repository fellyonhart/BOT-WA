'use strict';
const { jadwalSeragam, jadwalPPLG3 } = require('../content/jadwal');
const { kelas } = require('../config');
const T = require('./time');
const { norm } = require('./util');

const HARI_SEKOLAH = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
const SHORT = { Senin: 'Sen', Selasa: 'Sel', Rabu: 'Rab', Kamis: 'Kam', Jumat: 'Jum', Sabtu: 'Sab', Minggu: 'Min' };

// Kegiatan yang bukan mata pelajaran
const NON_PELAJARAN = new Set([
  'Istirahat', 'Ibadah Pagi', 'Upacara', 'Tausyiah', 'Pendidikan Karakter',
  'Self Upgrading', 'Kumpul Rayon', 'Ekstrakurikuler'
]);

// Singkatan/nama lain -> nama mapel di data
const ALIAS = {
  mtk: 'MTK', matematika: 'MTK', math: 'MTK',
  indo: 'B. Indo', 'b indo': 'B. Indo', 'bahasa indonesia': 'B. Indo',
  inggris: 'B. Inggris', 'b inggris': 'B. Inggris', english: 'B. Inggris',
  sunda: 'B. Sunda', 'b sunda': 'B. Sunda',
  agama: 'PABP', pabp: 'PABP', pai: 'PABP',
  pkn: 'PP', pp: 'PP', pancasila: 'PP',
  ipas: 'P. IPAS', 'p ipas': 'P. IPAS',
  prod: 'PROD (Produktif)', produktif: 'PROD (Produktif)', 'prod produktif': 'PROD (Produktif)',
  pjok: 'PJOK', olahraga: 'PJOK', penjas: 'PJOK',
  info: 'Informatika', informatika: 'Informatika',
  sejarah: 'Sejarah',
  koko: 'Kokurikuler', kokurikuler: 'Kokurikuler',
  karakter: 'Pendidikan Karakter',
  ekskul: 'Ekstrakurikuler', ekstrakurikuler: 'Ekstrakurikuler',
  kka: 'KKA'
};

const adaSekolah = (hari) => HARI_SEKOLAH.includes(hari);
const getHari = (sem, hari) => jadwalPPLG3[sem]?.[hari] || null;
const seragamOf = (hari) => jadwalSeragam[hari] || 'Tidak ada jadwal seragam khusus.';

// Semester aktif: auto (ikut kalender) atau manual (pilihan admin)
function activeSemester(store, now) {
  return store.state.semesterMode === 'manual'
    ? store.state.semester
    : T.semesterByDate(now);
}

// Ubah singkatan ("mtk") jadi nama mapel resmi; kalau tak dikenal, kembalikan apa adanya
function canonMapel(s) {
  return ALIAS[norm(s)] || String(s).trim();
}

// Gabungkan JP berurutan yang sama (mapel+guru+ruang) menjadi satu blok
function blocksOf(items) {
  const out = [];
  for (const it of items) {
    const { start, end } = T.parseRange(it.jam);
    const last = out[out.length - 1];
    if (last && last.mapel === it.mapel && last.guru === it.guru && last.ruang === it.ruang && last.end === start) {
      last.end = end;
      last.jp++;
    } else {
      out.push({
        mapel: it.mapel, guru: it.guru, ruang: it.ruang,
        start, end, jp: 1, pelajaran: !NON_PELAJARAN.has(it.mapel)
      });
    }
  }
  return out;
}

function nextSchoolDay(now, from = 1) {
  for (let i = from; i <= 7; i++) {
    const s = T.shift(now, i);
    if (adaSekolah(s.hari)) return { ...s, offset: i };
  }
  return null;
}

const rentang = (b) => `${T.jam(b.start)}–${T.jam(b.end)}`;
const detail = (b) =>
  `${b.mapel}${b.guru ? ` · ${b.guru}` : ''}${b.ruang ? ` · 📍${b.ruang}` : ''}`;

const HR = '━━━━━━━━━━━━━━━━━━━━';

// ---------- Jadwal 1 hari ----------
function formatHari(hari, sem, now) {
  const head = `📅 *JADWAL ${kelas}*\n🗓️ *${hari.toUpperCase()}* · Semester *${sem.toUpperCase()}*\n${HR}\n`;
  const items = getHari(sem, hari);
  if (!items) {
    return head + `🎉 *${hari}* libur, tidak ada jadwal.\n\n👉 Masuk lagi *Senin*.`;
  }

  const blocks = blocksOf(items);
  const isToday = now && now.hari === hari;
  let txt = head;
  for (const b of blocks) {
    const cur = isToday && now.minutes >= b.start && now.minutes < b.end;
    const mark = cur ? '▶️ ' : '';
    if (!b.pelajaran) {
      txt += `${mark}_${rentang(b)} · ${b.mapel}_\n`;
    } else {
      txt += `${mark}*${rentang(b)}*\n   ${detail(b)} _(${b.jp} JP)_\n`;
    }
  }

  const kbm = blocks.filter((b) => b.pelajaran);
  const jp = kbm.reduce((a, b) => a + b.jp, 0);
  const mapelUnik = new Set(kbm.map((b) => b.mapel)).size;
  const pulang = [...blocks].reverse().find((b) => b.mapel !== 'Ekstrakurikuler');
  txt += `${HR}\n📚 ${mapelUnik} mapel · ${jp} JP · masuk ${T.jam(blocks[0].start)}`;
  if (pulang) txt += ` · pulang ${T.jam(pulang.end)}`;
  if (isToday) txt += `\n_▶️ = sedang berlangsung_`;
  return txt;
}

// Versi ringkas (pelajaran saja) untuk pengingat
function ringkasHari(hari, sem) {
  const items = getHari(sem, hari);
  if (!items) return '';
  return blocksOf(items)
    .filter((b) => b.pelajaran)
    .map((b) => `• ${T.jam(b.start)} ${b.mapel}${b.guru ? ` (${b.guru})` : ''}${b.ruang ? ` 📍${b.ruang}` : ''}`)
    .join('\n');
}

// ---------- Jadwal seminggu (ringkas, mapel yang sama digabung) ----------
function formatMinggu(sem) {
  let txt = `📖 *JADWAL SEMINGGU ${kelas}*\nSemester: *${sem.toUpperCase()}*\n${HR}\n`;
  for (const hari of HARI_SEKOLAH) {
    txt += `\n🔹 *${hari.toUpperCase()}*  _${seragamOf(hari)}_\n`;
    const grup = new Map();
    for (const b of blocksOf(getHari(sem, hari) || []).filter((x) => x.pelajaran)) {
      const k = `${b.mapel}|${b.guru}|${b.ruang}`;
      const g = grup.get(k) || { ...b, jp: 0, start: b.start };
      g.jp += b.jp;
      grup.set(k, g);
    }
    for (const g of grup.values()) {
      txt += `• ${T.jam(g.start)} ${g.mapel}${g.guru ? ` (${g.guru})` : ''}${g.ruang ? ` 📍${g.ruang}` : ''} · ${g.jp} JP\n`;
    }
  }
  return txt.trimEnd();
}

function formatSeragamMinggu(now) {
  let txt = `👕 *JADWAL SERAGAM*\n${HR}\n`;
  for (const hari of [...HARI_SEKOLAH, 'Sabtu', 'Minggu']) {
    const hi = now && now.hari === hari ? ' 👈 hari ini' : '';
    txt += `• *${hari}*: ${seragamOf(hari)}${hi}\n`;
  }
  return txt.trimEnd();
}

// ---------- Pelajaran berikutnya ----------
function nextPelajaran(now, sem) {
  if (adaSekolah(now.hari)) {
    const blocks = blocksOf(getHari(sem, now.hari) || []);
    const b = blocks.find((x) => x.pelajaran && x.start > now.minutes);
    if (b) return { block: b, hari: now.hari, ymd: now.ymd, offset: 0, menit: b.start - now.minutes };
  }
  const n = nextSchoolDay(now, 1);
  if (!n) return null;
  const first = blocksOf(getHari(sem, n.hari) || []).find((x) => x.pelajaran);
  if (!first) return null;
  return { block: first, hari: n.hari, ymd: n.ymd, offset: n.offset, menit: null };
}

function formatNext(now, sem) {
  const n = nextPelajaran(now, sem);
  if (!n) return '🤷 Tidak ada pelajaran berikutnya yang ditemukan.';
  const b = n.block;
  let t = `⏭️ *PELAJARAN BERIKUTNYA*\n${HR}\n📚 *${detail(b)}*\n🕐 ${rentang(b)} _(${b.jp} JP)_\n`;
  if (n.offset === 0) t += `⏳ ${T.fmtDur(n.menit)} lagi`;
  else if (n.offset === 1) t += `📆 Besok (${n.hari})`;
  else t += `📆 ${n.hari}, ${T.fmtTglPendek(n.ymd)}`;
  return t;
}

// ---------- Status "sekarang" ----------
function statusSekarang(now, sem) {
  const jamStr = `🕐 ${now.hhmm} WIB · ${now.hari}`;
  if (!adaSekolah(now.hari)) {
    const n = nextSchoolDay(now);
    return `🎉 *Hari ini libur* (${now.hari})\n\n👉 Sekolah lagi *${n.hari}*, ${T.fmtTglPendek(n.ymd)}\n👕 ${seragamOf(n.hari)}`;
  }
  const blocks = blocksOf(getHari(sem, now.hari) || []);
  const cur = blocks.find((b) => now.minutes >= b.start && now.minutes < b.end);

  if (!cur) {
    const up = blocks.find((b) => b.start > now.minutes);
    if (up) {
      return `${jamStr}\n⏳ *Belum mulai.* ${up.mapel} dimulai ${T.fmtDur(up.start - now.minutes)} lagi (${T.jam(up.start)}).\n\n${formatNext(now, sem)}`;
    }
    const n = nextSchoolDay(now);
    return `${jamStr}\n✅ *KBM hari ini sudah selesai.* Istirahat yang cukup! 😴\n\n👉 ${n.offset === 1 ? 'Besok' : 'Masuk lagi'}: *${n.hari}*${n.offset > 1 ? ` (${T.fmtTglPendek(n.ymd)})` : ''}\n👕 ${seragamOf(n.hari)}`;
  }

  const sisa = cur.end - now.minutes;
  let t = `${jamStr}\n${HR}\n`;
  t += cur.pelajaran
    ? `📚 *SEDANG BELAJAR*\n*${detail(cur)}*\n🕐 ${rentang(cur)} _(${cur.jp} JP)_\n`
    : `📍 *SEDANG:* *${cur.mapel}*\n🕐 ${rentang(cur)}\n`;
  t += `⏳ Sisa ${T.fmtDur(sisa)}\n`;

  const nxt = blocks.find((b) => b.start >= cur.end && b !== cur && b.pelajaran);
  if (nxt) t += `\n⏭️ *Setelah ini:* ${detail(nxt)} (${T.jam(nxt.start)})`;
  else t += `\n⏭️ Tidak ada pelajaran lagi hari ini.`;
  return t;
}

// ---------- Pencarian mapel / guru / ruang ----------
function cari(q, sem) {
  const nq = norm(q);
  if (nq.length < 2) return null;
  const target = ALIAS[nq];
  const hits = [];
  for (const hari of HARI_SEKOLAH) {
    for (const b of blocksOf(getHari(sem, hari) || [])) {
      const m = norm(b.mapel), g = norm(b.guru), r = norm(b.ruang);
      if ((target && b.mapel === target) || m.includes(nq) || (g && g.includes(nq)) || (r && r === nq)) {
        hits.push({ hari, b });
      }
    }
  }
  if (!hits.length) return { ada: false, text: `🔎 Tidak ada hasil untuk *"${q}"* di semester ${sem.toUpperCase()}.\nCoba nama mapel, nama guru, atau nomor ruang. Ketik *guru* untuk daftar lengkap.` };

  const totalJp = hits.filter((h) => h.b.pelajaran).reduce((a, h) => a + h.b.jp, 0);
  let t = `🔎 *HASIL: "${q}"*\nSemester ${sem.toUpperCase()}\n${HR}\n`;
  for (const { hari, b } of hits) {
    t += `• *${SHORT[hari]}* ${rentang(b)} · ${detail(b)}${b.pelajaran ? ` _(${b.jp} JP)_` : ''}\n`;
  }
  if (totalJp) t += `${HR}\nTotal ${totalJp} JP per pekan`;
  return { ada: true, text: t.trimEnd() };
}

// ---------- Daftar guru ----------
function guruList(sem) {
  const map = new Map();
  for (const hari of HARI_SEKOLAH) {
    for (const b of blocksOf(getHari(sem, hari) || [])) {
      if (!b.pelajaran || !b.guru) continue;
      const g = map.get(b.guru) || { mapel: new Set(), ruang: new Set(), hari: new Set(), jp: 0 };
      g.mapel.add(b.mapel);
      if (b.ruang) g.ruang.add(b.ruang);
      g.hari.add(SHORT[hari]);
      g.jp += b.jp;
      map.set(b.guru, g);
    }
  }
  let t = `👩‍🏫 *DAFTAR GURU & MAPEL*\nSemester ${sem.toUpperCase()}\n${HR}\n`;
  for (const [nama, g] of [...map].sort((a, b) => a[0].localeCompare(b[0]))) {
    t += `• *${nama}* — ${[...g.mapel].join(', ')}\n   📍${[...g.ruang].join('/')} · ${[...g.hari].join(', ')} · ${g.jp} JP\n`;
  }
  t += `\n_Ketik *cari <nama guru/mapel/ruang>* untuk lihat jamnya._`;
  return t;
}

module.exports = {
  HARI_SEKOLAH, SHORT, NON_PELAJARAN, ALIAS, HR,
  adaSekolah, getHari, seragamOf, activeSemester, canonMapel, blocksOf, nextSchoolDay,
  formatHari, ringkasHari, formatMinggu, formatSeragamMinggu,
  nextPelajaran, formatNext, statusSekarang, cari, guruList, rentang, detail
};
