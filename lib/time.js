'use strict';
const { timezone: TZ } = require('../config');
const { norm, pad2 } = require('./util');

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = [
  'januari', 'februari', 'maret', 'april', 'mei', 'juni',
  'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
];
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short'
});

// Waktu sekarang di zona WIB (tidak bergantung zona server)
function nowWIB(date = new Date()) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const y = +p.year, m = +p.month, d = +p.day, h = +p.hour, mi = +p.minute;
  const hariIdx = WD[p.weekday];
  return {
    date, y, m, d, h, mi,
    minutes: h * 60 + mi,
    hariIdx,
    hari: HARI[hariIdx],
    ymd: `${y}-${pad2(m)}-${pad2(d)}`,
    hhmm: `${pad2(h)}:${pad2(mi)}`
  };
}

// "06.50-07.15" -> { start: 410, end: 435 }
function parseRange(jamStr) {
  const [a, b] = jamStr.split('-').map((s) => s.trim().split('.').map(Number));
  return { start: a[0] * 60 + a[1], end: b[0] * 60 + b[1] };
}

// Menit sejak tengah malam -> "07.15"
const jam = (m) => `${pad2(Math.floor(m / 60))}.${pad2(m % 60)}`;

const ymdToDate = (ymd) => new Date(ymd + 'T00:00:00Z');
const addDays = (ymd, n) => {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a, b) => Math.round((ymdToDate(a) - ymdToDate(b)) / 86400000);
const hariDari = (ymd) => HARI[ymdToDate(ymd).getUTCDay()];

// Geser n hari dari "sekarang"
function shift(now, n) {
  const ymd = addDays(now.ymd, n);
  const hari = hariDari(ymd);
  return { ymd, hari, hariIdx: HARI.indexOf(hari) };
}

function fmtTanggal(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${hariDari(ymd).slice(0, 3)}, ${d} ${BULAN[m - 1]} ${y}`;
}

// "12 Okt 2026" (tanpa nama hari)
function fmtTglPendek(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

function fmtDur(min) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} jam ${m} menit`;
  if (h) return `${h} jam`;
  return `${m} menit`;
}

// Tahun ajaran: Ganjil = Juli-Desember, Genap = Januari-Juni
const semesterByDate = (now) => (now.m >= 7 ? 'ganjil' : 'genap');

function validYmd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    ? `${y}-${pad2(m)}-${pad2(d)}`
    : null;
}

const fullYear = (y) => (y < 100 ? 2000 + y : y);

// Parser tanggal fleksibel: "besok", "lusa", "+3", "senin", "25/10", "25 okt", "2026-10-25"
function parseTanggal(input, now) {
  const s = norm(input);
  if (!s) return null;
  if (['hari ini', 'hariini', 'today', 'sekarang'].includes(s)) return now.ymd;
  if (['besok', 'bsk', 'tomorrow'].includes(s)) return addDays(now.ymd, 1);
  if (s === 'lusa') return addDays(now.ymd, 2);
  if (s === 'minggu depan' || s === 'pekan depan') return addDays(now.ymd, 7);

  let m = s.match(/^\+(\d{1,3})$/) || s.match(/^(\d{1,3}) hari( lagi)?$/);
  if (m) return addDays(now.ymd, +m[1]);

  m = s.match(/^([a-z]+)( depan| ini)?$/);
  if (m) {
    const idx = HARI.findIndex((h) => norm(h) === m[1] || (m[1] === 'jumaat' && h === 'Jumat'));
    if (idx >= 0) {
      let n = (idx - now.hariIdx + 7) % 7;
      if (n === 0) n = 7; // hari yang sama = pekan depan
      return addDays(now.ymd, n);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, mo, d] = s.split('-').map(Number);
    return validYmd(y, mo, d);
  }

  let d, mo, y;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (m) {
    d = +m[1]; mo = +m[2]; y = m[3] ? fullYear(+m[3]) : null;
  } else {
    m = s.match(/^(\d{1,2}) ([a-z]+)(?: (\d{2,4}))?$/);
    if (!m) return null;
    const i = BULAN_PANJANG.findIndex((b) => b === m[2] || b.slice(0, 3) === m[2].slice(0, 3));
    if (i < 0) return null;
    d = +m[1]; mo = i + 1; y = m[3] ? fullYear(+m[3]) : null;
  }

  if (y) return validYmd(y, mo, d);
  let res = validYmd(now.y, mo, d);
  if (res && res < now.ymd) res = validYmd(now.y + 1, mo, d);
  return res;
}

module.exports = {
  HARI, BULAN, nowWIB, parseRange, jam, addDays, diffDays, hariDari, shift,
  fmtTanggal, fmtTglPendek, fmtDur, semesterByDate, parseTanggal, ymdToDate
};
