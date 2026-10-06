'use strict';
const T = require('./time');

const HR = '━━━━━━━━━━━━━━━━━━━━';
const KIND = {
  tugas: { label: 'TUGAS', icon: '📝' },
  agenda: { label: 'AGENDA', icon: '📅' }
};
const MAX_AKTIF = 100;

// Label hitung mundur deadline
function countdown(due, now) {
  const d = T.diffDays(due, now.ymd);
  if (d < 0) return `⚠️ terlewat ${-d} hari`;
  if (d === 0) return '🔥 HARI INI';
  if (d === 1) return '⏳ BESOK';
  return `H-${d}`;
}

const byDue = (a, b) => a.due.localeCompare(b.due) || a.id - b.id;

// Tugas: semua yang belum selesai (termasuk yang terlewat). Agenda: yang akan datang.
function aktif(store, kind, now) {
  const arr = store.state[kind].filter((x) => !x.done);
  return (kind === 'agenda' ? arr.filter((x) => x.due >= now.ymd) : arr).sort(byDue);
}

function line(kind, x, now) {
  const isi = `${x.title}${x.desc ? ` — ${x.desc}` : ''}`;
  if (x.done) return `*#${x.id}* ~${isi}~ ✅\n   📆 ${T.fmtTanggal(x.due)}`;
  return `*#${x.id}* ${isi}\n   📆 ${T.fmtTanggal(x.due)} · ${countdown(x.due, now)}`;
}

function formatList(store, kind, now, semua = false) {
  const k = KIND[kind];
  let items;
  if (semua) {
    items = [...store.state[kind]].sort(byDue).slice(-40);
  } else {
    items = aktif(store, kind, now);
  }
  if (!items.length) {
    return kind === 'tugas'
      ? `${k.icon} *INFO TUGAS*\n${HR}\nBelum ada tugas yang aktif. Aman! 🎉\n\n_Admin: *tugas tambah <mapel> | <deskripsi> | <deadline>*_`
      : `${k.icon} *AGENDA KELAS*\n${HR}\nBelum ada agenda mendatang.\n\n_Admin: *agenda tambah <judul> | <tanggal> | <catatan>*_`;
  }
  let t = `${k.icon} *${semua ? 'RIWAYAT ' : 'DAFTAR '}${k.label}* (${items.length})\n${HR}\n`;
  t += items.map((x) => line(kind, x, now)).join('\n\n');
  return t;
}

// Item yang jatuh tepat pada tanggal tertentu (untuk "besok", "hari ini")
function dueOn(store, ymd, now) {
  const out = [];
  for (const x of store.state.tugas) if (!x.done && x.due === ymd) out.push(`• 📝 *${x.title}* — ${x.desc} (#${x.id})`);
  for (const x of store.state.agenda) if (!x.done && x.due === ymd) out.push(`• 📅 *${x.title}*${x.desc ? ` — ${x.desc}` : ''} (#${x.id})`);
  return out;
}

// Ringkasan deadline sampai `horizon` hari ke depan (termasuk tugas terlewat)
function ringkas(store, now, horizon = 2) {
  const out = [];
  for (const x of aktif(store, 'tugas', now)) {
    if (T.diffDays(x.due, now.ymd) <= horizon) out.push(`• 📝 *${x.title}* — ${x.desc} · ${countdown(x.due, now)}`);
  }
  for (const x of aktif(store, 'agenda', now)) {
    if (T.diffDays(x.due, now.ymd) <= horizon) out.push(`• 📅 *${x.title}*${x.desc ? ` — ${x.desc}` : ''} · ${countdown(x.due, now)}`);
  }
  return out;
}

function add(store, kind, { title, desc, due, by }, now) {
  if (aktif(store, kind, now).length >= MAX_AKTIF) return null;
  const item = {
    id: store.state.counters[kind]++,
    title, desc: desc || '', due, done: false, by: by || '', created: now.ymd
  };
  store.state[kind].push(item);
  store.save();
  return item;
}

const find = (store, kind, id) => store.state[kind].find((x) => x.id === id);

function setDone(store, kind, id) {
  const x = find(store, kind, id);
  if (!x) return null;
  x.done = true;
  store.save();
  return x;
}

function remove(store, kind, id) {
  const i = store.state[kind].findIndex((x) => x.id === id);
  if (i < 0) return null;
  const [x] = store.state[kind].splice(i, 1);
  store.save();
  return x;
}

// Buang item selesai dan item yang sudah lewat > 7 hari
function bersih(store, kind, now) {
  const before = store.state[kind].length;
  store.state[kind] = store.state[kind].filter((x) => !x.done && T.diffDays(now.ymd, x.due) <= 7);
  store.save();
  return before - store.state[kind].length;
}

module.exports = {
  KIND, HR, countdown, aktif, line, formatList, dueOn, ringkas, add, find, setDone, remove, bersih
};
