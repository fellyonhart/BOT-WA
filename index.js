"use strict";
// ============================================
// BOT WHATSAPP PPLG X-3 v2
// Login: QR code (qr.png + terminal) atau pairing code
// ============================================
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const cron = require("node-cron");

const config = require("./config");
const { Store } = require("./lib/store");
const T = require("./lib/time");
const { handle } = require("./lib/commands");
const reminders = require("./lib/reminders");
const { chunkText, sleep } = require("./lib/util");
const I = require("./lib/interactive");
const hub = require("./hub");
const dashboard = require("./server");

const store = new Store(config.dataFile);
const startedAt = Date.now();

hub.setTestRunner(async (testSock, msg) => {
  const chatId = msg?.key?.remoteJid || "0@s.whatsapp.net";
  const isGroup = chatId.endsWith("@g.us");
  const senderKeys = [
    ...new Set(
      [
        msg?.key?.participant,
        msg?.key?.participantPn,
        msg?.key?.participantLid,
        msg?.key?.senderPn,
        msg?.key?.senderLid,
        isGroup ? null : chatId
      ]
        .map(digits)
        .filter(Boolean)
    )
  ];

  const ctx = {
    text: getText(msg),
    chatId,
    isGroup,
    senderKeys,
    pushName: msg?.pushName || "",
    now: T.nowWIB(),
    store,
    config: { ...config, interactive: false }, // dashboard hanya bisa menampilkan teks
    startedAt,
    broadcast,
    latencyMs: msg?.messageTimestamp
      ? Math.max(0, Date.now() - tsToMs(msg.messageTimestamp))
      : null
  };

  const replies = await handle(ctx);
  for (const reply of replies) {
    await sendText(chatId, reply, undefined, testSock); // sock palsu → hasil tampil di dashboard, tidak dikirim ke WA
  }
});

let sock = null;
let connected = false;
let retry = 0;
let stopping = false;

const log = (...a) => console.log(`[${T.nowWIB().hhmm}]`, ...a);

// ---------- Antrean kirim (jeda antar pesan supaya tidak terlihat seperti spam) ----------
let outbox = Promise.resolve();
const enqueue = (fn) =>
  (outbox = outbox.then(fn).catch((e) => log("❌ kirim gagal:", e.message)));

async function sendText(jid, text, quoted, s = sock) {
  if (text == null) return;
  if (Array.isArray(text)) {
    for (const part of text) await sendText(jid, part, quoted, s);
    return;
  }

  if (I.isInteractive(text)) {
    try {
      if (typeof s?.relayMessage === "function") {
        await I.send(s, jid, text.interactive, { quoted });
        return;
      }
    } catch (e) {
      log("⚠️ gagal kirim menu interaktif, pakai fallback:", e.message);
    }
    text = text.fallback || I.toText(text.interactive) || "Menu";
  }

  if (typeof text === "object") {
    if (text && typeof text === "object" && Object.keys(text).length) {
      try {
        await s.sendMessage(jid, text, quoted ? { quoted } : undefined);
        return;
      } catch (e) {
        log("⚠️ gagal kirim payload object:", e.message);
      }
    }
    text = JSON.stringify(text);
  }

  for (const part of chunkText(String(text))) {
    await s.sendMessage(jid, { text: part }, quoted ? { quoted } : undefined);
    quoted = undefined;
    await sleep(250);
  }
}

// Kirim ke semua chat yang berlangganan; mengembalikan jumlah yang berhasil
async function broadcast(text) {
  const targets = Object.keys(store.state.subscribers);
  let ok = 0;
  for (const jid of targets) {
    try {
      await sendText(jid, text);
      ok++;
    } catch (e) {
      log("❌ broadcast ke", jid, "gagal:", e.message);
    }
    await sleep(1200);
  }
  return ok;
}

// ---------- Helper pesan ----------
function getText(msg) {
  const c = normalizeMessageContent(msg.message) || {};
  return (
    c.conversation ||
    c.extendedTextMessage?.text ||
    c.imageMessage?.caption ||
    c.videoMessage?.caption ||
    c.buttonsResponseMessage?.selectedButtonId ||
    c.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

// "628123:12@s.whatsapp.net" -> "628123"
const digits = (jid) =>
  String(jid || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");

function tsToMs(ts) {
  if (ts == null) return 0;
  const n =
    typeof ts === "object"
      ? ts.toNumber
        ? ts.toNumber()
        : ts.low
      : Number(ts);
  return n * 1000;
}

// Anti-spam: jeda minimal antar perintah per pengirim
const lastCmd = new Map();
function limited(key) {
  const t = Date.now();
  if (t - (lastCmd.get(key) || 0) < config.cooldownMs) return true;
  lastCmd.set(key, t);
  if (lastCmd.size > 500)
    for (const [k, v] of lastCmd) if (t - v > 60000) lastCmd.delete(k);
  return false;
}

async function onMessage(msg) {
  if (!msg.message || msg.key.fromMe) return;
  const chatId = msg.key.remoteJid;
  if (
    !chatId ||
    chatId === "status@broadcast" ||
    chatId.endsWith("@broadcast") ||
    chatId.endsWith("@newsletter")
  )
    return;

  // Abaikan pesan lama (backlog saat reconnect)
  const ms = tsToMs(msg.messageTimestamp);
  if (ms && ms < startedAt - 60000) return;

  const text = getText(msg);
  if (!text) return;

  const isGroup = chatId.endsWith("@g.us");
  // Pengirim bisa berupa nomor (PN) atau LID; kumpulkan semua kandidatnya
  const k = msg.key;
  const senderKeys = [
    ...new Set(
      [
        k.participant,
        k.participantPn,
        k.participantLid,
        k.senderPn,
        k.senderLid,
        isGroup ? null : chatId
      ]
        .map(digits)
        .filter(Boolean)
    )
  ];

  const now = T.nowWIB();
  log(
    `📩 ${now.hari} ${isGroup ? "[grup]" : "[pribadi]"} ${senderKeys[0] || "?"}: "${text.slice(0, 80)}"`
  );

  const ctx = {
    text,
    chatId,
    isGroup,
    senderKeys,
    pushName: msg.pushName || "",
    now,
    store,
    config,
    startedAt,
    broadcast,
    latencyMs: ms ? Math.max(0, Date.now() - ms) : null
  };

  const replies = await handle(ctx);
  if (!replies.length) return;
  if (limited(`${chatId}|${senderKeys[0]}`)) return;

  try {
    await sock.readMessages([msg.key]);
  } catch {}
  try {
    await sock.sendPresenceUpdate("composing", chatId);
  } catch {}
  await sleep(400);
  for (let i = 0; i < replies.length; i++)
    await sendText(chatId, replies[i], i === 0 ? msg : undefined);
  try {
    await sock.sendPresenceUpdate("paused", chatId);
  } catch {}
}

// ---------- Koneksi ----------
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();
  log(`📦 Baileys WA v${version.join(".")} — menghubungkan...`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: ["Chrome", "Windows", "10.0.0"],
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect: false
  });
  hub.setSock(sock);

  // Login dengan pairing code (alternatif QR)
  if (!sock.authState.creds.registered && config.pairNumber) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(config.pairNumber);
        console.log(
          `\n🔑 PAIRING CODE: ${code}\nWhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon.\n`
        );
      } catch (e) {
        log("❌ Gagal meminta pairing code:", e.message);
      }
    }, 3000);
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on(
    "connection.update",
    async ({ connection, lastDisconnect, qr }) => {
      hub.setConnection({ connection, lastDisconnect, qr }, sock);

      if (qr) {
        qrcodeTerminal.generate(qr, { small: true });
        try {
          await QRCode.toFile("qr.png", qr, { width: 400, margin: 2 });
          log(
            "📱 QR tampil di terminal dan tersimpan di qr.png. Scan lewat WhatsApp → Perangkat tertaut (kedaluwarsa ±20 detik)."
          );
        } catch (e) {
          log("⚠️ Gagal menyimpan qr.png:", e.message);
        }
      }

      if (connection === "open") {
        connected = true;
        retry = 0;
        console.log("\n╔════════════════════════════════════════════╗");
        console.log(
          `║  ✅ BOT ${config.kelas} v${config.versi} TERHUBUNG!`.padEnd(45) +
            "║"
        );
        console.log("╚════════════════════════════════════════════╝");
        console.log(
          `💡 Test: kirim "menu" ke nomor bot. Admin: ${config.admins.length ? config.admins.join(", ") : "(kosong → semua orang admin; isi BOT_ADMINS di .env)"}`
        );
        console.log(
          `🔔 ${Object.keys(store.state.subscribers).length} chat berlangganan pengingat.\n`
        );
      }

      if (connection === "close") {
        connected = false;
        if (stopping) return;
        const code = lastDisconnect?.error?.output?.statusCode;
        log("❌ Koneksi terputus. Kode:", code);

        const fatal = {
          [DisconnectReason.loggedOut]:
            '🚫 LOGGED OUT — hapus folder "auth_info_baileys" lalu jalankan ulang untuk scan QR baru.',
          [DisconnectReason.connectionReplaced]:
            "🚫 Sesi digantikan perangkat/proses lain. Pastikan hanya satu bot yang berjalan, lalu jalankan ulang.",
          [DisconnectReason.forbidden]:
            "🚫 403 — Akses ditolak WhatsApp. Coba lagi nanti atau pakai nomor lain.",
          [DisconnectReason.badSession]:
            '🚫 Sesi rusak — hapus folder "auth_info_baileys" lalu login ulang.'
        };
        if (fatal[code]) {
          console.log(`\n${fatal[code]}\n⛔ Bot berhenti.\n`);
          store.flush();
          process.exit(1);
        }

        // 515 = restart wajib setelah pairing (normal) → langsung sambung lagi
        const wait =
          code === DisconnectReason.restartRequired
            ? 500
            : Math.min(2000 * 2 ** retry, 60000);
        retry++;
        log(
          `🔄 Menyambung ulang dalam ${Math.round(wait / 1000) || 1} detik (percobaan ${retry})...`
        );
        setTimeout(
          () =>
            connectToWhatsApp().catch((e) =>
              log("❌ reconnect error:", e.message)
            ),
          wait
        );
      }
    }
  );

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return; // lewati sinkronisasi riwayat
    for (const msg of messages) {
      try {
        await onMessage(msg);
      } catch (e) {
        console.error("❌ Error handler:", e);
      }
    }
  });
}

// ---------- Scheduler pengingat (cek tiap menit, zona WIB) ----------
const pending = new Set();
cron.schedule(
  "* * * * *",
  () => {
    if (!connected) return; // tick tidak dimajukan → akan dikejar (maks 5 menit) saat tersambung lagi
    try {
      for (const d of reminders.collect(store, config)) {
        if (pending.has(d.key)) continue;
        pending.add(d.key);
        enqueue(async () => {
          try {
            await sendText(d.jid, d.text);
            reminders.markSent(store, d.key);
            await sleep(1500);
          } finally {
            pending.delete(d.key);
          }
        });
      }
    } catch (e) {
      log("❌ scheduler error:", e.message);
    }
  },
  { timezone: config.timezone }
);

// ---------- Matikan dengan rapi ----------
function shutdown() {
  if (stopping) return;
  stopping = true;
  log("👋 Mematikan bot...");
  try {
    store.flush();
  } catch {}
  try {
    sock?.end(undefined);
  } catch {}
  setTimeout(() => process.exit(0), 300);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (e) =>
  console.error("⚠️ unhandledRejection:", e)
);

// ---------- Mulai ----------
console.log(`🚀 Memulai bot ${config.kelas} v${config.versi}...\n`);
if (!config.admins.length) {
  console.log(
    '⚠️  BOT_ADMINS kosong: semua orang bisa memakai perintah admin. Ketik ".id" ke bot untuk melihat ID-mu.\n'
  );
}
if (
  process.env.DASHBOARD_PASSWORD &&
  process.env.DASHBOARD_PASSWORD.length >= 8
) {
  try {
    dashboard.start();
  } catch (e) {
    console.error("❌ Gagal start dashboard:", e.message);
  }
} else {
  console.log(
    "ℹ️  Dashboard dinonaktifkan: isi DASHBOARD_PASSWORD minimal 8 karakter di .env untuk aktifkan admin panel."
  );
}
connectToWhatsApp().catch((e) => {
  console.error("❌ Gagal start:", e);
  process.exit(1);
});
