'use strict';
const J = require('./jadwal');
const A = require('./agenda');
const T = require('./time');
const QUOTES = require('../content/quotes');
const { pick } = require('./util');

const HR = J.HR;
const MAX_CATCHUP_MENIT = 5;

function salam(now) {
  if (now.h < 11) return 'Selamat pagi';
  if (now.h < 15) return 'Selamat siang';
  if (now.h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function briefPagi(store, config, now, sem, sub) {
  let t = `☀️ *${salam(now)}, ${config.kelas}!*\n🗓️ ${now.hari}, ${T.fmtTglPendek(now.ymd)} · Semester ${sem.toUpperCase()}\n${HR}\n`;
  t += `👕 *Seragam:* ${J.seragamOf(now.hari)}\n\n📚 *Jadwal hari ini*\n${J.ringkasHari(now.hari, sem)}\n`;
  if (sub.tugas !== false) {
    const r = A.ringkas(store, now, 2);
    if (r.length) t += `\n🔔 *Perhatikan:*\n${r.join('\n')}\n`;
  }
  t += `\n💬 _${pick(QUOTES)}_`;
  return t;
}

function briefMalam(store, config, now, sem, sub) {
  const b = T.shift(now, 1);
  let t = `🌙 *Persiapan besok* — ${b.hari}, ${T.fmtTglPendek(b.ymd)}\n${HR}\n`;
  t += `👕 *Seragam:* ${J.seragamOf(b.hari)}\n\n📚 *Jadwal besok*\n${J.ringkasHari(b.hari, sem)}\n`;
  if (sub.tugas !== false) {
    const r = A.ringkas(store, now, 3);
    if (r.length) t += `\n🔔 *Deadline dekat:*\n${r.join('\n')}\n`;
  }
  t += `\n🎒 Siapkan buku & seragam, lalu tidur cukup ya! 😴`;
  return t;
}

// Semua pengingat yang jatuh tempo pada menit `now` (fungsi murni, tidak mengirim apa pun)
function dueAt(store, config, now) {
  const out = [];
  const r = config.reminders;
  const sem = J.activeSemester(store, now);
  const besokSekolah = J.adaSekolah(T.shift(now, 1).hari);
  const blocks = J.adaSekolah(now.hari) ? J.blocksOf(J.getHari(sem, now.hari) || []) : [];
  const mulai = blocks.filter((b) => b.pelajaran && b.start - now.minutes === r.pelajaranMenit);

  for (const [jid, sub] of Object.entries(store.state.subscribers)) {
    const add = (tipe, suffix, text) => {
      const key = `${now.ymd}|${tipe}${suffix}|${jid}`;
      if (!store.state.sent[key]) out.push({ jid, text, key });
    };
    if (sub.pagi && now.hhmm === r.pagi && J.adaSekolah(now.hari)) {
      add('pagi', '', briefPagi(store, config, now, sem, sub));
    }
    if (sub.malam && now.hhmm === r.malam && besokSekolah) {
      add('malam', '', briefMalam(store, config, now, sem, sub));
    }
    if (sub.kelas) {
      for (const b of mulai) {
        add('kelas', `|${b.start}`, `⏰ *${r.pelajaranMenit} menit lagi!*\n📚 *${J.detail(b)}*\n🕐 ${J.rentang(b)} _(${b.jp} JP)_`);
      }
    }
  }
  return out;
}

// Kumpulkan pengingat sejak tick terakhir sampai sekarang (maks 5 menit ke belakang,
// supaya pengingat tidak hilang bila event loop sempat tersendat)
function collect(store, config, nowDate = new Date()) {
  const endMin = Math.floor(nowDate.getTime() / 60000);
  let last = store.state.lastTick ? Math.floor(store.state.lastTick / 60000) : endMin - 1;
  if (endMin - last > MAX_CATCHUP_MENIT) last = endMin - MAX_CATCHUP_MENIT;

  const out = [];
  for (let m = last + 1; m <= endMin; m++) out.push(...dueAt(store, config, T.nowWIB(new Date(m * 60000))));
  store.state.lastTick = endMin * 60000;

  // Bersihkan catatan lama agar state tidak membengkak
  const batas = T.addDays(T.nowWIB(nowDate).ymd, -2);
  for (const k of Object.keys(store.state.sent)) if (k.slice(0, 10) < batas) delete store.state.sent[k];
  return out;
}

function markSent(store, key) {
  store.state.sent[key] = Date.now();
  store.save();
}

module.exports = { collect, markSent, dueAt, briefPagi, briefMalam };
