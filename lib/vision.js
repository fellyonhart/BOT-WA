// lib/vision.js
// Ambil gambar dari: (1) pesan gambar dengan caption command, atau (2) pesan teks yang membalas gambar.
const {
  downloadMediaMessage,
  normalizeMessageContent
} = require("@whiskeysockets/baileys");
// Kalau paket kamu bernama "baileys", ganti baris di atas jadi require("baileys").

// Logger kosong supaya tidak perlu import pino
const logger = {
  level: "silent",
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return this;
  }
};

async function unduh(sock, message, mimetype) {
  const buffer = await downloadMediaMessage(
    message,
    "buffer",
    {},
    { logger, reuploadRequest: sock.updateMediaMessage }
  );
  return { buffer, mimetype: mimetype || "image/jpeg" };
}

/**
 * @returns {Promise<{buffer: Buffer, mimetype: string} | null>}
 */
async function ambilGambar(sock, msg) {
  try {
    const content = normalizeMessageContent(msg.message);
    if (!content) return null;

    // 1. Gambar dikirim langsung (caption berisi command)
    if (content.imageMessage) {
      return await unduh(sock, msg, content.imageMessage.mimetype);
    }

    // 2. Membalas (reply) sebuah gambar
    const ctx = content.extendedTextMessage?.contextInfo;
    if (ctx?.quotedMessage) {
      const quoted = normalizeMessageContent(ctx.quotedMessage);
      if (quoted?.imageMessage) {
        const fake = {
          key: {
            remoteJid: msg.key.remoteJid,
            id: ctx.stanzaId,
            participant: ctx.participant,
            fromMe: false
          },
          message: ctx.quotedMessage
        };
        return await unduh(sock, fake, quoted.imageMessage.mimetype);
      }
    }
    return null;
  } catch (err) {
    console.error("❌ Gagal ambil gambar:", err.message);
    return null;
  }
}

module.exports = { ambilGambar };
