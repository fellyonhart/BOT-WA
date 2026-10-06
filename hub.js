// lib/dashboard/hub.js
// Pusat state + hook dashboard. Aman di-require dari index.js dan commands.js.
const fs = require("fs");
const path = require("path");
const EventEmitter = require("events");

const ROOT = __dirname; // hub.js ada di root proyek (bukan lib/dashboard)
const DB_FILE = path.join(ROOT, "database.json");
const SETTINGS_FILE = path.join(ROOT, "dashboard-data.json"); // pengaturan dashboard (blokir, grup, statistik) — terpisah dari database.json

const bus = new EventEmitter();
bus.setMaxListeners(50);

const digits = (j) =>
  String(j || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
const hourWIB = () => (new Date().getUTCHours() + 7) % 24;

function writeJSON(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

/* ───────── database.json ─────────
   Satu-satunya tempat dashboard menyentuh database.json.
   Kalau store.js menyimpan data di memori, ganti dua fungsi ini agar memakai fungsi store.js. */
const emptyDB = () => ({
  tugas: [],
  catatan: [],
  pengumuman: [],
  state: {
    subscribers: {},
    admins: [],
    semester: "ganjil",
    semesterMode: "auto",
    hits: {}
  }
});
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return emptyDB();
    throw e;
  }
}
function writeDB(db) {
  writeJSON(DB_FILE, db);
}

/* ───────── pengaturan dashboard ───────── */
let data = { blocked: [], defaultGroupEnabled: true, groups: {}, stats: {} };
try {
  Object.assign(data, JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")));
} catch {
  /* file belum ada */
}
data.stats = { commands: {}, hours: Array(24).fill(0), ...(data.stats || {}) };

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      writeJSON(SETTINGS_FILE, data);
    } catch (e) {
      console.error("Gagal simpan dashboard-data.json:", e.message);
    }
  }, 2000);
}
process.on("exit", () => {
  try {
    writeJSON(SETTINGS_FILE, data);
  } catch {
    /* abaikan */
  }
});

/* ───────── log aktivitas ───────── */
const logs = [];
let logId = 0;
function log(type, text, from) {
  const e = {
    id: ++logId,
    t: Date.now(),
    type,
    text: String(text).slice(0, 500),
    from: from || ""
  };
  logs.push(e);
  if (logs.length > 500) logs.shift();
  bus.emit("log", e);
}
// Tangkap error/warning yang sudah ada di kode bot tanpa mengubahnya
for (const level of ["error", "warn"]) {
  const orig = console[level].bind(console);
  console[level] = (...a) => {
    orig(...a);
    try {
      log(
        level === "error" ? "err" : "warn",
        a
          .map((x) =>
            x instanceof Error
              ? x.message
              : typeof x === "string"
                ? x
                : JSON.stringify(x)
          )
          .join(" ")
      );
    } catch {
      /* abaikan */
    }
  };
}

/* ───────── koneksi WhatsApp ───────── */
const conn = { status: "starting", qr: null, user: null, since: null };
let sockRef = null;
function setSock(sock) {
  sockRef = sock;
}
function getSock() {
  return sockRef;
}

function setConnection(update, sock) {
  if (sock) sockRef = sock;
  const { connection, qr, lastDisconnect } = update || {};
  if (qr) {
    conn.qr = qr;
    conn.status = "qr";
  }
  if (connection === "connecting" && !conn.qr) conn.status = "connecting";
  if (connection === "open") {
    conn.status = "connected";
    conn.qr = null;
    conn.since = Date.now();
    conn.user = sockRef?.user?.id || null;
    log("sys", "WhatsApp terhubung");
  }
  if (connection === "close") {
    conn.status = "disconnected";
    conn.qr = null;
    const code = lastDisconnect?.error?.output?.statusCode;
    log("sys", `Koneksi terputus (kode ${code ?? "?"})`);
  }
}

/* ───────── gate: blokir user & grup ON/OFF ───────── */
function gate(msg) {
  if (msg._dashTest) return { ok: true };
  const chat = msg.key.remoteJid || "";
  const isGroup = chat.endsWith("@g.us");
  // Baileys baru bisa memakai @lid; cek semua kandidat nomor yang tersedia
  const cands = [
    msg.key.participant,
    msg.key.participantPn,
    msg.key.participantAlt,
    msg.key.senderPn,
    msg.key.remoteJidAlt,
    isGroup ? null : chat
  ]
    .filter(Boolean)
    .map(digits);
  if (cands.some((n) => n && data.blocked.includes(n)))
    return { ok: false, reason: "pengirim diblokir" };
  if (isGroup) {
    if (!data.groups[chat]) {
      data.groups[chat] = { name: "", enabled: data.defaultGroupEnabled };
      save();
    }
    if (!data.groups[chat].enabled)
      return { ok: false, reason: "grup dinonaktifkan" };
  }
  return { ok: true };
}

function logIncoming(msg, text) {
  if (!text) return;
  const chat = msg.key.remoteJid || "";
  const who = `${msg.pushName || "?"} (${digits(msg.key.participant || chat)})`;
  log(
    "in",
    `${msg._dashTest ? "[test] " : chat.endsWith("@g.us") ? "[grup] " : ""}${text}`,
    who
  );
}

function recordCommand(name) {
  name = String(name || "")
    .toLowerCase()
    .trim()
    .slice(0, 30);
  if (!name) return;
  data.stats.commands[name] = (data.stats.commands[name] || 0) + 1;
  data.stats.hours[hourWIB()]++;
  save();
  log("cmd", name);
}

async function refreshGroups() {
  if (!sockRef || conn.status !== "connected")
    throw new Error("Bot belum terhubung ke WhatsApp");
  const all = await sockRef.groupFetchAllParticipating();
  for (const [jid, g] of Object.entries(all)) {
    data.groups[jid] = {
      name: g.subject || "",
      enabled: data.groups[jid]?.enabled ?? data.defaultGroupEnabled
    };
  }
  save();
  return Object.keys(all).length;
}

/* ───────── test command ───────── */
let testRunner = null;
function setTestRunner(fn) {
  testRunner = fn;
}
function hasTestRunner() {
  return typeof testRunner === "function";
}

function describe(c) {
  if (!c || typeof c !== "object") return null;
  if (c.react || c.delete) return null;
  if (c.sections) {
    return [
      c.title,
      c.text,
      ...c.sections.flatMap((s) => [
        `▸ ${s.title || ""}`,
        ...(s.rows || []).map(
          (r) => `   • ${r.title}${r.rowId ? "  →  " + r.rowId : ""}`
        )
      ])
    ]
      .filter(Boolean)
      .join("\n");
  }
  const kind = ["image", "video", "audio", "sticker", "document"].find(
    (k) => c[k]
  );
  if (kind) return `[${kind}]${c.caption ? " " + c.caption : ""}`;
  if (c.text) return c.text;
  return "[pesan non-teks]";
}

// sock palsu: semua sendMessage ditangkap, tidak dikirim ke WhatsApp
function sandbox(real) {
  const out = [];
  const noop = async () => {};
  const sock = new Proxy(real || { user: { id: "" } }, {
    get(t, p) {
      if (p === "sendMessage")
        return async (_jid, content) => {
          const d = describe(content);
          if (d) out.push(d);
          return {
            key: { id: "TEST" + Date.now(), remoteJid: _jid, fromMe: true }
          };
        };
      if (
        [
          "sendPresenceUpdate",
          "readMessages",
          "presenceSubscribe",
          "relayMessage"
        ].includes(p)
      )
        return noop;
      const v = Reflect.get(t, p);
      return typeof v === "function" ? v.bind(t) : v;
    }
  });
  return { sock, out };
}

function fakeMsg(text, number) {
  return {
    key: {
      remoteJid: `${number}@s.whatsapp.net`,
      fromMe: false,
      id: "TEST" + Date.now()
    },
    pushName: "Dashboard",
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
    _dashTest: true
  };
}

async function runTest(text, number) {
  if (!hasTestRunner())
    throw new Error(
      "Test runner belum dipasang di index.js (hub.setTestRunner)"
    );
  const { sock, out } = sandbox(sockRef);
  const msg = fakeMsg(text, number);
  logIncoming(msg, text);
  await Promise.race([
    testRunner(sock, msg),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("Timeout 60 detik")), 60000)
    )
  ]);
  return out;
}

/* ───────── broadcast ───────── */
const job = { running: false, total: 0, sent: 0, failed: 0 };

function broadcast(text, flag) {
  if (job.running) throw new Error("Broadcast sebelumnya masih berjalan");
  if (!sockRef || conn.status !== "connected")
    throw new Error("Bot belum terhubung ke WhatsApp");
  const subs = readDB().state?.subscribers || {};
  const targets = Object.entries(subs)
    .filter(([, s]) => !flag || (s && s[flag]))
    .map(([id]) => (id.includes("@") ? id : `${id}@s.whatsapp.net`));
  if (!targets.length) throw new Error("Tidak ada subscriber yang cocok");
  Object.assign(job, {
    running: true,
    total: targets.length,
    sent: 0,
    failed: 0
  });
  log("sys", `Broadcast ke ${targets.length} chat dimulai`);
  (async () => {
    for (const id of targets) {
      try {
        await sockRef.sendMessage(id, { text });
        job.sent++;
      } catch (e) {
        job.failed++;
        log("err", `Broadcast gagal ke ${digits(id)}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    }
    job.running = false;
    log("sys", `Broadcast selesai: ${job.sent} terkirim, ${job.failed} gagal`);
  })();
  return job;
}

module.exports = {
  ROOT,
  DB_FILE,
  bus,
  data,
  conn,
  job,
  logs,
  digits,
  readDB,
  writeDB,
  writeJSON,
  save,
  log,
  setSock,
  getSock,
  setConnection,
  gate,
  logIncoming,
  recordCommand,
  refreshGroups,
  setTestRunner,
  hasTestRunner,
  runTest,
  broadcast
};
