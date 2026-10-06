const { tanyaAI, resetHistory } = require("./ai");
("use strict");
const J = require("./jadwal");
const A = require("./agenda");
const T = require("./time");
const { norm, levenshtein, shuffle, pick } = require("./util");
const M = require("./media");
const I = require("./interactive");
const Menu = require("./menu");
const Brat = require("./brat");

const HR = J.HR;

const QUOTES = require("../content/quotes");

const HARI_MAP = {
  senin: "Senin",
  selasa: "Selasa",
  rabu: "Rabu",
  kamis: "Kamis",
  jumat: "Jumat",
  jumaat: "Jumat",
  sabtu: "Sabtu",
  minggu: "Minggu",
  ahad: "Minggu"
};

// ---------- helper ----------
const semester = (ctx) => J.activeSemester(ctx.store, ctx.now);
const kelas = (ctx) => ctx.config.kelas;

function denyAdmin(ctx) {
  if (ctx.isAdmin) return null;
  const ids = ctx.senderKeys.length
    ? `\nID terdeteksi: ${ctx.senderKeys.join(", ")}`
    : "";
  return `🔒 Perintah ini khusus admin kelas.${ids}\n_Minta admin menambahkanmu: *admin tambah ${ctx.senderKeys[0] || "<id>"}* (atau isi BOT_ADMINS di .env)._`;
}

// Semua ID admin: dari .env + yang ditambahkan lewat bot
const adminIds = (ctx) => [
  ...new Set([...ctx.config.admins, ...(ctx.store.state.admins || [])])
];

// Cek admin. Alasan dikembalikan agar bisa ditampilkan di panel admin.
function adminReason(ctx) {
  if (ctx.fromMe) return "nomor bot sendiri";
  const ids = adminIds(ctx);
  if (!ids.length) return "mode terbuka (belum ada admin terdaftar)";
  const hit = ctx.senderKeys.find((k) => ids.includes(k));
  if (hit)
    return ctx.config.admins.includes(hit)
      ? "terdaftar di BOT_ADMINS"
      : "ditambahkan lewat bot";
  return null;
}

// Catat aksi admin ke konsol (jejak: siapa menjalankan apa)
function adminLog(ctx, aksi) {
  console.log(
    `👑 [ADMIN] ${ctx.senderKeys[0] || "bot"} ${ctx.isGroup ? "(grup)" : "(pribadi)"} → ${aksi}`
  );
}

// Balasan sukses untuk perintah admin (konsisten + tercatat)
function adminOk(ctx, aksi, teks) {
  adminLog(ctx, aksi);
  return `${teks}\n\n👑 _Aksi admin: ${aksi}_`;
}

function parseId(s) {
  const m = String(s).match(/#?(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

const splitList = (s) => {
  const t = String(s).trim();
  const parts = /[,|;\n]/.test(t) ? t.split(/[,|;\n]+/) : t.split(/\s+/);
  return parts.map((x) => x.trim()).filter(Boolean);
};

function salam(now) {
  if (now.h < 11) return "Selamat pagi";
  if (now.h < 15) return "Selamat siang";
  if (now.h < 18) return "Selamat sore";
  return "Selamat malam";
}

// ---------- teks yang dipakai ulang ----------
function teksHari(ctx, offset, sem = semester(ctx)) {
  const { now, store } = ctx;
  const s = T.shift(now, offset);
  let t = J.formatHari(
    s.hari,
    sem,
    offset === 0 ? now : { ...now, hari: null }
  );
  if (J.adaSekolah(s.hari)) t += `\n👕 Seragam: *${J.seragamOf(s.hari)}*`;
  const due = A.dueOn(store, s.ymd, now);
  if (due.length) {
    t += `\n\n🔔 *Deadline ${offset === 0 ? "hari ini" : offset === 1 ? "besok" : T.fmtTanggal(s.ymd)}:*\n${due.join("\n")}`;
  }
  return t;
}

function menuText(ctx) {
  const p = ctx.isGroup ? ctx.config.prefixes[0] : "";
  const c = (s) => `*${p}${s}*`;
  let t = `╔═══════════════════════╗
   📋 *MENU BOT ${kelas(ctx)}*
╚═══════════════════════╝
`;
  if (ctx.isGroup)
    t += `_Di grup, awali perintah dengan *${p}* ya (contoh ${c("menu")})._\n`;
  t += `
📚 *JADWAL*
• ${c("sekarang")} — lagi pelajaran apa
• ${c("next")} — pelajaran berikutnya
• ${c("hariini")} · ${c("besok")} · ${c("seminggu")}
• ${c("jadwal senin")} (senin–jumat, bisa + ganjil/genap)
• ${c("cari mtk")} — cari mapel / guru / ruang
• ${c("guru")} — daftar guru & ruang
• ${c("seragam")} [besok | minggu]

📝 *TUGAS & AGENDA*
• ${c("tugas")} — daftar tugas aktif
• ${c("agenda")} — ulangan, libur, acara
• ${c("tugas tambah MTK | Bab 3 | jumat")} _(admin)_
• ${c("tugas selesai 3")} · ${c("tugas hapus 3")} _(admin)_

🔔 *PENGINGAT OTOMATIS*
• ${c("langganan on")} — ringkasan pagi, persiapan malam, deadline
• ${c("langganan kelas on")} — ping ${ctx.config.reminders.pelajaranMenit} menit sebelum pelajaran
• ${c("langganan status")} · ${c("langganan off")}

🎬 *DOWNLOAD & STIKER*
• ${c("dl <link>")} — video TikTok / IG / YouTube
• ${c("mp3 <link>")} — audionya saja (MP3)
• ${c("s")} — stiker (kirim/balas gambar atau video dengan ${c("s")})

🎲 *SERU-SERUAN*
• ${c("acak a, b, c")} · ${c("acak 1-36")}
• ${c("kelompok 4 | nama1, nama2, ...")}
• ${c("koin")} · ${c("dadu")} · ${c("quote")}

🤖 *AI ASSISTANT*
• ${c("ai <pertanyaan>")} — tanya apa saja ke AI
• ${c("resetai")} — hapus riwayat percakapan

⚙️ *LAINNYA*
• ${c("semester")} [ganjil | genap | auto] _(admin)_
• ${c("pengumuman <teks>")} _(admin)_
• ${c("admin")} — panel admin · ${c("admin tambah <id>")} _(admin)_
• ${c("ping")} · ${c("id")} · ${c("tentang")}`;
  if (!ctx.isGroup) {
    t += `\n\n_Angka lama masih bisa: 1 seragam · 2 jadwal · 3 hari ini · 4/5 ganjil/genap · 6 semester · 7 tugas · 8 tentang_`;
  }
  return t;
}

// ---------- definisi perintah ----------
const COMMANDS = [];
const def = (names, run) => COMMANDS.push({ names, run });

// Menu interaktif (tombol + list). Versi teks: "menu teks" (juga jadi cadangan otomatis).
//   menu → menu utama · menu <kategori> → sub-menu · menu teks → daftar lengkap berupa teks
def(["menu", "help", "bantuan", "0", "start"], (ctx, args) => {
  const a = norm(args);
  if (["teks", "text", "lengkap", "semua"].includes(a)) return menuText(ctx);
  const cat = a && Menu.find(a);
  if (cat) {
    const r = Menu.sub(ctx, cat);
    r.fallback = menuText(ctx);
    return r;
  }
  return Menu.main(ctx, menuText(ctx));
});

def(
  ["halo", "hai", "hi", "hello", "p", "permisi", "assalamualaikum", "salam"],
  (ctx, args, name) => {
    if (name === "assalamualaikum")
      return "Wa’alaikumussalam warahmatullahi wabarakatuh 🙏\n\nKetik *menu* untuk lihat fitur bot.";
    return `${salam(ctx.now)}, *${ctx.pushName || "teman"}*! 👋\nAku bot kelas *${kelas(ctx)}*. Ketik *menu* untuk lihat semua fitur.`;
  }
);

// --- Seragam ---
def(["seragam", "1"], (ctx, args) => {
  const a = norm(args);
  if (["minggu", "semua", "seminggu", "pekan"].includes(a))
    return J.formatSeragamMinggu(ctx.now);

  const DAY_IDX = {
    senin: 1,
    selasa: 2,
    rabu: 3,
    kamis: 4,
    jumat: 5,
    jumaat: 5,
    sabtu: 6,
    ahad: 0
  };

  let s;
  let label;

  if (Object.prototype.hasOwnProperty.call(DAY_IDX, a)) {
    const target = DAY_IDX[a];
    let off = (target - ctx.now.hariIdx + 7) % 7;
    s = T.shift(ctx.now, off);
    label = off === 0 ? "HARI INI" : s.hari.toUpperCase();
  } else {
    const off = a === "besok" ? 1 : a === "lusa" ? 2 : 0;
    s = T.shift(ctx.now, off);
    label = off === 0 ? "HARI INI" : off === 1 ? "BESOK" : "LUSA";
  }

  return `👕 *JADWAL SERAGAM ${label}*\n\n🗓️ ${s.hari}, ${T.fmtTglPendek(s.ymd)}\n\n*${J.seragamOf(s.hari)}*`;
});

// --- Jadwal ---
def(["jadwal", "2"], (ctx, args) => {
  const toks = norm(args).split(" ").filter(Boolean);
  const semOverride = toks.find((t) => t === "ganjil" || t === "genap");
  const key = toks.filter((t) => t !== "ganjil" && t !== "genap").join(" ");
  const sem = semOverride || semester(ctx);

  if (!key) {
    if (semOverride) return J.formatMinggu(semOverride);
    const usage = `📅 *MAU LIHAT JADWAL KAPAN?*\n\n• *jadwal senin* … *jadwal jumat*\n• *jadwal hari ini* · *jadwal besok* · *jadwal lusa*\n• *jadwal seminggu*\n• Tambah *ganjil/genap* untuk semester lain, mis. *jadwal rabu genap*\n\nSemester aktif: *${semester(ctx).toUpperCase()}*`;
    return Menu.dayPicker(ctx, semester(ctx), usage);
  }
  if (["hari ini", "hariini", "today"].includes(key))
    return teksHari(ctx, 0, sem);
  if (["besok", "bsk", "tomorrow"].includes(key)) return teksHari(ctx, 1, sem);
  if (key === "lusa") return teksHari(ctx, 2, sem);
  if (
    ["seminggu", "minggu ini", "pekan", "pekan ini", "week", "semua"].includes(
      key
    )
  )
    return J.formatMinggu(sem);
  if (key === "sekarang" || key === "now")
    return J.statusSekarang(ctx.now, sem);
  const h = HARI_MAP[key];
  if (h)
    return J.formatHari(
      h,
      sem,
      h === ctx.now.hari ? ctx.now : { ...ctx.now, hari: null }
    );
  return `❓ Hari *"${args}"* tidak dikenali. Contoh: *jadwal senin*, *jadwal besok*, *jadwal seminggu*.`;
});

def(["hariini", "3", "today", "hr"], (ctx) => teksHari(ctx, 0));
def(["besok", "bsk", "tomorrow"], (ctx) => teksHari(ctx, 1));
def(["lusa"], (ctx) => teksHari(ctx, 2));
def(["seminggu", "pekan", "week", "mingguini"], (ctx) =>
  J.formatMinggu(semester(ctx))
);
def(["ganjil", "4"], () => J.formatMinggu("ganjil"));
def(["genap", "5"], () => J.formatMinggu("genap"));
def(["sekarang", "now", "skrg", "lagi"], (ctx) =>
  J.statusSekarang(ctx.now, semester(ctx))
);
def(["next", "berikutnya", "selanjutnya", "lanjut"], (ctx) =>
  J.formatNext(ctx.now, semester(ctx))
);

// --- Cari & guru ---
def(["cari", "search", "find", "ruang", "mapel"], (ctx, args) => {
  if (!args)
    return "🔎 Mau cari apa? Contoh:\n• *cari mtk*\n• *cari endang*\n• *cari 207* (nomor ruang)";
  const r = J.cari(args, semester(ctx));
  return r ? r.text : "🔎 Kata kunci terlalu pendek, minimal 2 huruf.";
});
def(["guru", "daftarguru"], (ctx, args) => {
  if (args) {
    const r = J.cari(args, semester(ctx));
    return r ? r.text : "🔎 Kata kunci terlalu pendek.";
  }
  return J.guruList(semester(ctx));
});

// --- Semester ---
def(["semester", "6"], (ctx, args) => {
  const a = norm(args);
  const sem = semester(ctx);
  const mode =
    ctx.store.state.semesterMode === "manual"
      ? "manual (diatur admin)"
      : "otomatis (ikut kalender)";
  if (!a) {
    return `🔄 *SEMESTER AKTIF:* *${sem.toUpperCase()}*\nMode: ${mode}\n\n_Ganjil = Juli–Desember, Genap = Januari–Juni._\n\nAdmin bisa ketik:\n• *semester ganjil*\n• *semester genap*\n• *semester auto*`;
  }
  const deny = denyAdmin(ctx);
  if (deny) return deny;
  if (a === "ganjil" || a === "genap") {
    ctx.store.state.semesterMode = "manual";
    ctx.store.state.semester = a;
    ctx.store.save();
    return adminOk(
      ctx,
      `semester ${a}`,
      `✅ Semester aktif dikunci ke *${a.toUpperCase()}* (manual).\nKetik *semester auto* untuk kembali mengikuti kalender.`
    );
  }
  if (a === "auto" || a === "otomatis") {
    ctx.store.state.semesterMode = "auto";
    ctx.store.save();
    return adminOk(
      ctx,
      "semester auto",
      `✅ Semester kembali *otomatis*. Sekarang: *${T.semesterByDate(ctx.now).toUpperCase()}*.`
    );
  }
  return "❓ Pilihan: *semester ganjil*, *semester genap*, atau *semester auto*.";
});

// --- Tugas & Agenda ---
function itemCommand(kind) {
  const isTugas = kind === "tugas";
  const nama = isTugas ? "Tugas" : "Agenda";
  const usage = isTugas
    ? "➕ *Format:* tugas tambah <mapel> | <deskripsi> | <deadline>\n*Contoh:* tugas tambah MTK | Latihan bab 3 hal 20 | jumat\n\n_Deadline: besok, lusa, senin–jumat, 25/10, 25 okt, +3_"
    : "➕ *Format:* agenda tambah <judul> | <tanggal> | <catatan opsional>\n*Contoh:* agenda tambah Ulangan MTK | 15/10 | Bab 1–3\n\n_Tanggal: besok, lusa, senin–jumat, 25/10, 25 okt, +3_";

  return (ctx, args) => {
    const m = args.match(/^(\S+)\s*([\s\S]*)$/);
    const sub = m ? norm(m[1]) : "";
    const rest = m ? m[2].trim() : "";
    const { store, now } = ctx;

    if (!sub) return A.formatList(store, kind, now);
    if (["semua", "all", "riwayat"].includes(sub))
      return A.formatList(store, kind, now, true);

    if (["detail", "info", "lihat"].includes(sub)) {
      const x = A.find(store, kind, parseId(rest));
      if (!x) return `❌ ${nama} #${rest || "?"} tidak ditemukan.`;
      return `${A.KIND[kind].icon} *${nama.toUpperCase()} #${x.id}*\n${HR}\n*${x.title}*\n${x.desc || "-"}\n\n📆 ${T.fmtTanggal(x.due)}${x.done ? " · ✅ selesai" : ` · ${A.countdown(x.due, now)}`}\n✍️ Dibuat ${T.fmtTglPendek(x.created)}${x.by ? ` oleh ${x.by}` : ""}`;
    }

    // Sisanya hanya untuk admin
    if (
      [
        "tambah",
        "add",
        "baru",
        "buat",
        "selesai",
        "done",
        "ok",
        "hapus",
        "del",
        "rm",
        "delete",
        "bersih",
        "clear"
      ].includes(sub)
    ) {
      const deny = denyAdmin(ctx);
      if (deny) return deny;
    }

    if (["tambah", "add", "baru", "buat"].includes(sub)) {
      const p = rest.split("|").map((x) => x.trim());
      if (
        isTugas
          ? p.length < 3 || !p[0] || !p[1] || !p[2]
          : p.length < 2 || !p[0] || !p[1]
      )
        return usage;
      const dueRaw = isTugas ? p[2] : p[1];
      const due = T.parseTanggal(dueRaw, now);
      if (!due) return `❌ Tanggal *"${dueRaw}"* tidak dikenali.\n\n${usage}`;
      if (due < now.ymd)
        return `❌ Tanggal *${T.fmtTanggal(due)}* sudah lewat.`;
      const title = (isTugas ? J.canonMapel(p[0]) : p[0]).slice(0, 60);
      const desc = (
        isTugas ? p.slice(1, 2).join(" ") : p.slice(2).join(" | ")
      ).slice(0, 300);
      const item = A.add(
        store,
        kind,
        { title, desc, due, by: ctx.pushName },
        now
      );
      if (!item)
        return `❌ Terlalu banyak ${nama.toLowerCase()} aktif (maks 100). Hapus yang lama dulu: *${kind} bersih*.`;
      return adminOk(
        ctx,
        `${kind} tambah #${item.id}`,
        `✅ *${nama} #${item.id} ditambahkan*\n\n${A.KIND[kind].icon} *${item.title}*${item.desc ? ` — ${item.desc}` : ""}\n📆 ${T.fmtTanggal(item.due)} · ${A.countdown(item.due, now)}`
      );
    }

    if (["selesai", "done", "ok"].includes(sub)) {
      const id = parseId(rest);
      if (id === null) return `Format: *${kind} selesai <nomor>*`;
      const x = A.setDone(store, kind, id);
      return x
        ? adminOk(
            ctx,
            `${kind} selesai #${id}`,
            `✅ ${nama} #${id} (*${x.title}*) ditandai selesai.`
          )
        : `❌ ${nama} #${id} tidak ditemukan.`;
    }

    if (["hapus", "del", "rm", "delete"].includes(sub)) {
      const id = parseId(rest);
      if (id === null) return `Format: *${kind} hapus <nomor>*`;
      const x = A.remove(store, kind, id);
      return x
        ? adminOk(
            ctx,
            `${kind} hapus #${id}`,
            `🗑️ ${nama} #${id} (*${x.title}*) dihapus.`
          )
        : `❌ ${nama} #${id} tidak ditemukan.`;
    }

    if (["bersih", "clear"].includes(sub)) {
      const n = A.bersih(store, kind, now);
      return adminOk(
        ctx,
        `${kind} bersih`,
        `🧹 ${n} ${nama.toLowerCase()} lama/selesai dibersihkan.`
      );
    }

    return `❓ Perintah *${kind} ${sub}* tidak dikenali.\n\n• *${kind}* — daftar aktif\n• *${kind} semua* — termasuk riwayat\n• *${kind} detail <no>*\n• *${kind} tambah …* / *selesai <no>* / *hapus <no>* / *bersih* _(admin)_`;
  };
}
def(["tugas", "7", "pr"], itemCommand("tugas"));
def(["agenda", "acara", "jadwalujian", "ujian"], itemCommand("agenda"));

// --- Pengingat ---
def(["langganan", "subscribe", "pengingat", "reminder"], (ctx, args) => {
  const toks = norm(args).split(" ").filter(Boolean);
  const subs = ctx.store.state.subscribers;
  const id = ctx.chatId;
  const cur = subs[id];
  const r = ctx.config.reminders;

  const status = () => {
    if (!cur) {
      return `🔕 *Pengingat NONAKTIF* di chat ini.\n\nAktifkan: *langganan on*\n_(di grup, hanya admin yang bisa)_`;
    }
    const tick = (b) => (b ? "✅" : "❌");
    return `🔔 *Pengingat AKTIF* di chat ini\n${HR}\n☀️ Ringkasan pagi (${r.pagi}, Sen–Jum) ${tick(cur.pagi)}\n🌙 Persiapan besok (${r.malam}, Min–Kam) ${tick(cur.malam)}\n📝 Deadline tugas di ringkasan ${tick(cur.tugas)}\n⏰ ${r.pelajaranMenit} mnt sebelum pelajaran ${tick(cur.kelas)}\n\nUbah: *langganan pagi off*, *langganan kelas on*, dst.\nMatikan semua: *langganan off*`;
  };

  if (!toks.length || toks[0] === "status") return status();

  if (ctx.isGroup) {
    const deny = denyAdmin(ctx);
    if (deny) return deny;
  }

  if (["on", "aktif", "mulai"].includes(toks[0])) {
    subs[id] = {
      pagi: true,
      malam: true,
      tugas: true,
      kelas: false,
      since: ctx.now.ymd,
      ...(cur || {})
    };
    ctx.store.save();
    const okOn = `🔔 *Pengingat diaktifkan!*\n\nChat ini akan menerima ringkasan pagi, persiapan malam, dan deadline tugas.\nTambah ping sebelum pelajaran: *langganan kelas on*`;
    return ctx.isGroup ? adminOk(ctx, "langganan on", okOn) : okOn;
  }
  if (["off", "stop", "berhenti", "mati"].includes(toks[0])) {
    delete subs[id];
    ctx.store.save();
    return ctx.isGroup
      ? adminOk(ctx, "langganan off", "🔕 Pengingat dimatikan untuk chat ini.")
      : "🔕 Pengingat dimatikan untuk chat ini.";
  }
  if (
    ["pagi", "malam", "tugas", "kelas"].includes(toks[0]) &&
    ["on", "off"].includes(toks[1])
  ) {
    if (!cur) return "⚠️ Aktifkan dulu dengan *langganan on*.";
    cur[toks[0]] = toks[1] === "on";
    ctx.store.save();
    return `✅ Pengingat *${toks[0]}* ${toks[1] === "on" ? "dinyalakan" : "dimatikan"}.`;
  }
  return "❓ Pilihan: *langganan on/off/status*, atau *langganan pagi|malam|tugas|kelas on/off*.";
});

// --- Pengumuman (broadcast ke semua chat berlangganan) ---
def(["pengumuman", "broadcast", "bc"], async (ctx, args) => {
  const deny = denyAdmin(ctx);
  if (deny) return deny;
  if (!args) return "Format: *pengumuman <teks>*";
  if (!ctx.broadcast) return "⚠️ Fitur ini belum tersedia.";
  const n = await ctx.broadcast(
    `📢 *PENGUMUMAN ${kelas(ctx)}*\n${HR}\n${args}`
  );
  return adminOk(
    ctx,
    "pengumuman",
    `✅ Pengumuman dikirim ke ${n} chat berlangganan.`
  );
});

// --- Seru-seruan ---
def(["acak", "pilih", "random"], (ctx, args) => {
  const usage =
    "🎯 *Contoh:*\n• *acak Budi, Sari, Andi* → pilih satu\n• *acak 1-36* → angka acak";
  if (!args) return usage;
  const r = args.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (r) {
    let lo = +r[1],
      hi = +r[2];
    if (lo > hi) [lo, hi] = [hi, lo];
    if (hi > 1e6) return "🎲 Batas maksimal 1.000.000.";
    return `🎲 Angka acak (${lo}–${hi}): *${lo + Math.floor(Math.random() * (hi - lo + 1))}*`;
  }
  const items = splitList(args);
  if (items.length < 2) return usage;
  return `🎯 Yang terpilih: *${pick(items)}*`;
});

def(["kelompok", "tim", "group"], (ctx, args) => {
  const usage =
    "👥 *Format:* kelompok <jumlah kelompok> | nama1, nama2, nama3, ...\n*Contoh:* kelompok 3 | Budi, Sari, Andi, Dewi, Rian, Tia";
  const m = args.match(/^(\d+)\s*[|:]?\s*([\s\S]+)$/);
  if (!m) return usage;
  const n = +m[1];
  const names = splitList(m[2]);
  if (n < 2 || names.length < n)
    return `❌ Butuh minimal 2 kelompok dan jumlah nama ≥ jumlah kelompok.\n\n${usage}`;
  if (names.length > 100) return "❌ Maksimal 100 nama.";
  const groups = Array.from({ length: n }, () => []);
  shuffle(names).forEach((nm, i) => groups[i % n].push(nm));
  let t = `👥 *PEMBAGIAN ${n} KELOMPOK* (${names.length} orang)\n${HR}\n`;
  groups.forEach((g, i) => {
    t += `\n*Kelompok ${i + 1}* (${g.length})\n${g.map((x, j) => `  ${j + 1}. ${x}`).join("\n")}\n`;
  });
  return t.trimEnd();
});

def(["koin", "coin", "flip"], () => `🪙 *${pick(["Angka", "Gambar"])}*`);
def(["dadu", "dice"], (ctx, args) => {
  const n = Math.min(6, Math.max(1, parseInt(args, 10) || 1));
  const d = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
  return `🎲 ${d.join(" + ")}${n > 1 ? ` = *${d.reduce((a, b) => a + b, 0)}*` : ""}`;
});
def(["quote", "motivasi", "semangat"], () => `💬 ${pick(QUOTES)}`);

// --- Download media (TikTok / Instagram / YouTube) ---
const mediaLast = new Map(); // jeda antar unduhan per pengguna
function mediaWait(ctx) {
  const key = `${ctx.chatId}|${ctx.senderKeys[0] || ""}`;
  const gap = ctx.config.media.cooldownMs;
  const t = Date.now();
  const left = (mediaLast.get(key) || 0) + gap - t;
  if (left > 0) return Math.ceil(left / 1000);
  mediaLast.set(key, t);
  if (mediaLast.size > 500)
    for (const [k, v] of mediaLast) if (t - v > 60000) mediaLast.delete(k);
  return 0;
}

function mediaCommand(mode) {
  const isAudio = mode === "audio";
  const usage = isAudio
    ? "🎵 *Download MP3*\nKirim: *mp3 <link>* (TikTok / Instagram / YouTube)\nContoh: *mp3 https://youtu.be/xxxx*\n\n_Bisa juga balas pesan yang berisi link dengan *mp3*._"
    : "🎬 *Download Video*\nKirim: *dl <link>* (TikTok / Instagram / YouTube)\nContoh: *dl https://vt.tiktok.com/xxxx*\n\n_Hanya audionya? Pakai *mp3 <link>*. Bisa juga balas pesan berisi link._";

  return async (ctx, args) => {
    const url = M.extractUrl(args) || M.extractUrl(ctx.quotedText);
    if (!url) return usage;
    const plat = M.platformOf(url);
    if (!plat)
      return "❓ Link belum didukung. Yang bisa: *TikTok*, *Instagram*, *YouTube*.";
    const wait = mediaWait(ctx);
    if (wait) return `⏳ Sabar ya, tunggu ${wait} detik sebelum unduh lagi.`;

    if (ctx.notify)
      await ctx.notify(
        `⏳ Mengunduh ${isAudio ? "audio" : "video"} dari *${plat.nama}*...`
      );
    try {
      const r = await M.download(url, mode, ctx.config.media);
      const mb = (r.size / 1048576).toFixed(1);
      if (isAudio) {
        return [
          `🎵 *${r.title}*\n📥 ${plat.nama} · ${mb} MB`,
          {
            audio: r.buffer,
            mimetype: "audio/mpeg",
            fileName: `${r.title.replace(/[\\/:*?"<>|]+/g, "").slice(0, 60) || "audio"}.mp3`
          }
        ];
      }
      return [
        {
          video: r.buffer,
          mimetype: "video/mp4",
          caption: `🎬 *${r.title}*\n📥 ${plat.nama} · ${mb} MB`
        }
      ];
    } catch (e) {
      if (e instanceof M.MediaError) return e.message;
      console.error("❌ download error:", e);
      return "❌ Terjadi kesalahan saat mengunduh. Coba lagi nanti.";
    }
  };
}
def(
  [
    "dl",
    "download",
    "unduh",
    "video",
    "tt",
    "tiktok",
    "ig",
    "insta",
    "instagram",
    "reel",
    "yt",
    "youtube",
    "ytmp4",
    "mp4"
  ],
  mediaCommand("video")
);
def(["mp3", "audio", "ytmp3", "tomp3", "musik", "lagu"], mediaCommand("audio"));

// --- Stiker WhatsApp ---
def(["s", "stiker", "sticker", "stikerin", "sgif"], async (ctx, args) => {
  const usage =
    "🖼️ *BUAT STIKER*\n• Kirim gambar / video (maks 6 detik) / GIF dengan caption *.s*\n• Atau *balas* gambar/video dengan *.s*\n\nOpsi:\n• *.s crop* — penuhi kotak (gambar terpotong)\n• *.s nama pack | author* — ganti nama pack";
  if (!ctx.getMedia) return usage;
  let media;
  try {
    media = await ctx.getMedia();
  } catch (e) {
    return e instanceof M.MediaError
      ? e.message
      : "❌ Gagal mengambil media itu.";
  }
  if (!media) return usage;

  let crop = false;
  let rest = args;
  rest = rest
    .replace(/(^|\s)(crop|penuh|full)(?=\s|\||$)/i, () => {
      crop = true;
      return " ";
    })
    .trim();
  let pack, author;
  if (rest) {
    const [a, b] = rest.split("|").map((x) => x.trim());
    pack = (a || "").slice(0, 40) || undefined;
    author = (b || "").slice(0, 40) || undefined;
  }

  try {
    const webp = await M.makeSticker(
      media.buffer,
      { video: media.isVideo, crop, mime: media.mime, pack, author },
      ctx.config.media
    );
    return [{ sticker: webp }];
  } catch (e) {
    if (e instanceof M.MediaError) return e.message;
    console.error("❌ stiker error:", e);
    return "❌ Gagal membuat stiker. Coba media lain.";
  }
});

// --- Brat Generator ---
// Tema opsional ditulis setelah tanda "|", mis: ".brat begadang lagi | dark"
function bratArgs(args) {
  const [teks, tema] = String(args)
    .split("|")
    .map((s) => s.trim());
  return { text: teks || "", theme: tema || "" };
}

def(["brat"], async (ctx, args) => {
  const usage =
    "🍏 *BRAT GENERATOR*\nKetik: *.brat <teks>*\nContoh: *.brat ngerjain tugas jam 2 pagi*\n\n_Mau tema lain? Tambahkan ' | <tema>', mis: *.brat capek | dark*_";
  if (!args.trim()) return usage;
  const { text, theme } = bratArgs(args);
  try {
    const webp = await Brat.buatBratSticker(text, theme);
    return [{ sticker: webp }];
  } catch (e) {
    if (e instanceof Brat.BratError) return e.message;
    console.error("❌ brat error:", e);
    return "❌ Gagal membuat stiker brat. Coba lagi nanti.";
  }
});

def(["brathd"], async (ctx, args) => {
  const usage =
    "🍏 *BRAT GENERATOR (HD)*\nKetik: *.brathd <teks>*\nContoh: *.brathd rapat mendadak | dark*";
  if (!args.trim()) return usage;
  const { text, theme } = bratArgs(args);
  try {
    const gambar = await Brat.buatBratHD(text, theme);
    const webp = await Brat.convertToWebP(gambar, {
      video: false,
      mime: "image/png"
    });
    return [{ sticker: webp }];
  } catch (e) {
    if (e instanceof Brat.BratError) return e.message;
    console.error("❌ brathd error:", e);
    return "❌ Gagal membuat stiker brat HD. Coba lagi nanti.";
  }
});

def(["bratvid", "bratvideo"], async (ctx, args) => {
  const usage =
    "🎬 *BRAT VIDEO*\nKetik: *.bratvid <teks>*\nContoh: *.bratvid liburan udah deket | dark*";
  if (!args.trim()) return usage;
  const { text, theme } = bratArgs(args);
  if (ctx.notify) await ctx.notify("⏳ Membuat video brat...");
  try {
    const video = await Brat.buatBratVideo(text, theme);
    return [{ video, mimetype: "video/mp4", caption: `🍏 *brat:* ${text}` }];
  } catch (e) {
    if (e instanceof Brat.BratError) return e.message;
    console.error("❌ bratvid error:", e);
    return "❌ Gagal membuat video brat. Coba lagi nanti.";
  }
});

def(["bratsticker", "bratstiker"], async (ctx, args) => {
  const usage =
    "🎞️ *BRAT STIKER VIDEO*\nKetik: *.bratsticker <teks>*\nContoh: *.bratsticker senin lagi | dark*";
  if (!args.trim()) return usage;
  const { text, theme } = bratArgs(args);
  if (ctx.notify) await ctx.notify("⏳ Membuat stiker video brat...");
  try {
    const webp = await Brat.buatBratVideoSticker(text, theme);
    return [{ sticker: webp }];
  } catch (e) {
    if (e instanceof Brat.BratError) return e.message;
    console.error("❌ bratsticker error:", e);
    return "❌ Gagal membuat stiker video brat. Coba lagi nanti.";
  }
});

// --- Panel & manajemen admin ---
def(["admin", "panel", "admins"], (ctx, args) => {
  const m = args.match(/^(\S+)\s*([\s\S]*)$/);
  const sub = m ? norm(m[1]) : "";
  const rest = m ? m[2].trim() : "";
  const envIds = ctx.config.admins;
  const botIds = ctx.store.state.admins || [];
  const open = !envIds.length && !botIds.length;

  const deny = denyAdmin(ctx);
  if (deny) return deny;

  if (!sub || ["panel", "status", "cek"].includes(sub)) {
    adminLog(ctx, "panel");
    const why = adminReason(ctx);
    const st = ctx.store.state;
    const tools = ctx.tools
      ? `yt-dlp ${ctx.tools.ytdlp ? "✅" : "❌"} · ffmpeg ${ctx.tools.ffmpeg ? "✅" : "❌"}`
      : "belum dicek";
    return `👑 *PANEL ADMIN ${kelas(ctx)}*\n${HR}\n✅ Kamu *admin* — ${why}\n🪪 ID kamu: ${ctx.senderKeys.join(", ") || "(bot)"}\n👥 Admin terdaftar: ${envIds.length + botIds.length} (.env: ${envIds.length} · lewat bot: ${botIds.length})${open ? "\n⚠️ _Mode terbuka: siapa pun dianggap admin. Ketik *admin tambah* untuk mengunci._" : ""}\n\n📊 *Status*\n• Chat berlangganan: ${Object.keys(st.subscribers).length}\n• Tugas aktif: ${A.aktif(ctx.store, "tugas", ctx.now).length} · Agenda: ${A.aktif(ctx.store, "agenda", ctx.now).length}\n• Semester: ${semester(ctx).toUpperCase()} (${st.semesterMode === "manual" ? "manual" : "auto"})\n• Media: ${tools}\n\n🛠️ *Perintah admin*\n• *admin list* · *admin tambah <id|@mention>* · *admin hapus <id>*\n• *tugas tambah | selesai | hapus | bersih*\n• *agenda tambah | selesai | hapus | bersih*\n• *semester ganjil|genap|auto*\n• *langganan on|off* (di grup)\n• *pengumuman <teks>*`;
  }

  if (["list", "daftar"].includes(sub)) {
    adminLog(ctx, "admin list");
    const f = (arr, tag) => arr.map((x) => `• ${x} _(${tag})_`).join("\n");
    const body = [f(envIds, ".env"), f(botIds, "lewat bot")]
      .filter(Boolean)
      .join("\n");
    return `👑 *DAFTAR ADMIN*\n${HR}\n${body || "_(kosong — mode terbuka)_"}`;
  }

  if (["tambah", "add", "baru"].includes(sub)) {
    let targets = [
      ...rest
        .split(/[\s,;]+/)
        .map((x) => x.replace(/\D/g, ""))
        .filter((x) => x.length >= 5)
        .map(ctx.config.normNum),
      ...(ctx.targetKeys || [])
    ];
    // Mode terbuka & tanpa target: jadikan diri sendiri admin pertama (sekaligus mengunci)
    if (!targets.length && open) targets = [...ctx.senderKeys];
    targets = [...new Set(targets)].filter(
      (x) => x && !envIds.includes(x) && !botIds.includes(x)
    );
    if (!targets.length) {
      return "➕ *Format:* admin tambah <nomor|id>  atau balas/mention orangnya.\n*Contoh:* admin tambah 6281234567890\n_Nomor berawalan 0 otomatis jadi 62. Lihat ID seseorang dengan *id* (atau balas pesannya dengan *id*)._\n\n_Atau semua target sudah admin._";
    }
    ctx.store.state.admins = [...botIds, ...targets];
    ctx.store.save();
    return adminOk(
      ctx,
      `admin tambah ${targets.join(", ")}`,
      `✅ ${targets.length} admin ditambahkan:\n${targets.map((x) => `• ${x}`).join("\n")}`
    );
  }

  if (["hapus", "del", "rm", "delete", "cabut"].includes(sub)) {
    const ids = rest
      .split(/[\s,;]+/)
      .map((x) => x.replace(/\D/g, ""))
      .filter(Boolean)
      .map(ctx.config.normNum);
    const targets = [...ids, ...(ctx.targetKeys || [])];
    if (!targets.length) return "Format: *admin hapus <nomor|id>*";
    const fixed = targets.filter((x) => envIds.includes(x));
    const gone = targets.filter((x) => botIds.includes(x));
    if (!gone.length) {
      return fixed.length
        ? `⚠️ ${fixed.join(", ")} terdaftar di *BOT_ADMINS (.env)* — hapus lewat file .env.`
        : "❌ ID itu bukan admin yang ditambahkan lewat bot. Cek: *admin list*.";
    }
    ctx.store.state.admins = botIds.filter((x) => !gone.includes(x));
    ctx.store.save();
    return adminOk(
      ctx,
      `admin hapus ${gone.join(", ")}`,
      `🗑️ Admin dicabut: ${gone.join(", ")}${fixed.length ? `\n⚠️ ${fixed.join(", ")} ada di .env, tidak bisa dicabut dari sini.` : ""}`
    );
  }

  return "❓ Pilihan: *admin* (panel), *admin list*, *admin tambah <id>*, *admin hapus <id>*.";
});
// --- AI Assistant ---
def(["ai", "tanya", "ask"], async (ctx, args) => {
  if (!args || args.length < 2) {
    return "❌ Format: *ai [pertanyaan]*\n\n*Contoh:*\n• ai jelasin apa itu OOP\n• ai bikin contoh kode Python\n• ai apa beda array dan object?";
  }
  const userId = `${ctx.chatId}|${ctx.senderKeys[0] || "anon"}`;
  const jawaban = await tanyaAI(args, userId);
  return `🤖 *AI Assistant*\n━━━━━━━━━━━━━━━━━━━━\n\n${jawaban}`;
});

def(["resetai", "lupakan", "reset"], (ctx) => {
  const userId = `${ctx.chatId}|${ctx.senderKeys[0] || "anon"}`;
  resetHistory(userId);
  return "✅ Riwayat percakapan AI direset.";
});
// --- Info bot ---
def(["ping", "status", "uptime"], (ctx) => {
  const up = ctx.startedAt
    ? T.fmtDur((Date.now() - ctx.startedAt) / 60000)
    : "-";
  const mem = Math.round(process.memoryUsage().rss / 1048576);
  const lat = ctx.latencyMs != null ? ` · respon ~${ctx.latencyMs} ms` : "";
  const subs = Object.keys(ctx.store.state.subscribers).length;
  return `🏓 *Pong!*${lat}\n⏱️ Aktif ${up}\n🧠 ${mem} MB · Node ${process.version}\n🔔 ${subs} chat berlangganan\n🕐 ${ctx.now.hhmm} WIB · semester ${semester(ctx).toUpperCase()}`;
});

def(["id", "whoami", "myid"], (ctx) => {
  const why = adminReason(ctx);
  const target =
    ctx.targetKeys && ctx.targetKeys.length
      ? `\nID orang yang dibalas/di-mention: ${ctx.targetKeys.join(", ")}`
      : "";
  return `🪪 *INFO ID*\n${HR}\nChat: ${ctx.chatId}\nTipe: ${ctx.isGroup ? "grup" : "pribadi"}\nID kamu: ${ctx.senderKeys.join(", ") || "-"}${target}\nStatus: ${why ? `admin ✅ (${why})` : "anggota"}\n\n_Jadi admin: minta admin mengetik *admin tambah ${ctx.senderKeys[0] || "<id>"}*, atau isi BOT_ADMINS di .env._`;
});

def(
  ["tentang", "about", "info", "8"],
  (ctx) =>
    `ℹ️ *TENTANG BOT*\n\nBot kelas *${kelas(ctx)}*\nversi ${ctx.config.versi}\nMADE from feyy\n${ctx.config.sekolah} • T.A. ${ctx.config.tahunAjaran}`
);

// ---------- indeks & router ----------
const INDEX = new Map();
for (const c of COMMANDS) for (const n of c.names) INDEX.set(n, c);
const SUGGESTABLE = [...INDEX.keys()].filter(
  (n) => n.length >= 3 && !/^\d+$/.test(n)
);

function suggest(name) {
  if (name.length < 3) return null;
  let best = null,
    bestD = Infinity;
  for (const n of SUGGESTABLE) {
    const d = levenshtein(name, n);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  const limit = name.length <= 4 ? 1 : 2;
  return bestD <= limit ? best : null;
}

const toArray = (r) => (r == null ? [] : Array.isArray(r) ? r : [r]);

// Mengembalikan array teks balasan (kosong = abaikan pesan)
async function handle(ctx) {
  const cfg = ctx.config;
  let t = String(ctx.text || "").trim();
  if (!t) return [];

  const used = cfg.prefixes.find((p) => t.startsWith(p));
  if (ctx.isGroup && !used) return []; // di grup wajib pakai prefix
  if (used) t = t.slice(used.length).trim();
  if (!t) return [];

  // Kompatibel dengan kebiasaan lama: "set semester ganjil", "hari ini"
  t = t
    .replace(/^set\s+semester\b/i, "semester")
    .replace(/^(hari\s*ini|hr\s*ini)\b/i, "hariini");

  const m = t.match(/^(\S+)\s*([\s\S]*)$/);
  const name = norm(m[1]).replace(/[?!.,]+$/, "");
  const args = m[2].trim();

  ctx.isAdmin = adminReason(ctx) !== null;

  const cmd = INDEX.get(name);
  if (!cmd) {
    const s = suggest(name);
    if (s) return [`🤔 Maksud kamu *${ctx.isGroup ? used : ""}${s}*?`];
    if (ctx.isGroup) return []; // jangan spam grup
    return [
      "❓ Perintah tidak dikenali. Ketik *menu* untuk melihat daftar perintah."
    ];
  }
  // Cooldown dicek SEBELUM perintah dijalankan (dulu perintah tetap jalan walau balasannya diblokir)
  if (ctx.limited && ctx.limited()) return [];
  const out = toArray(await cmd.run(ctx, args, name));
  // INTERACTIVE_MENU=off → semua balasan tombol/list diganti versi teksnya
  return cfg.interactive === false ? out.map(I.downgrade) : out;
}

module.exports = { handle, menuText, COMMANDS, QUOTES };
