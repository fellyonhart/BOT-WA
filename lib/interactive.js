'use strict';
// ============================================
// PESAN INTERAKTIF (tombol + list) — WhatsApp "native flow"
//
// Cara pakai di command: kembalikan
//   { interactive: { title, body, footer, buttons: [{id,text}], list: {...} }, fallback: "teks" }
// - id = teks perintah lengkap dengan prefix (mis. ".hariini"). Saat tombol/baris
//   diketuk, WhatsApp mengirim id itu kembali, lalu diproses seperti orang mengetik perintah.
// - fallback = versi teks, dipakai bila INTERACTIVE_MENU=off atau pengiriman gagal.
//
// CATATAN: Baileys tidak punya API resmi untuk tombol/list. Modul ini membuat pesan
// `interactiveMessage` (nativeFlow) dan menambahkan node "biz" saat dikirim. Itu teknik
// tidak resmi; WhatsApp bisa mengubah perilakunya kapan saja. Karena itu selalu ada
// jalan mundur ke teks (lihat `menu teks` dan INTERACTIVE_MENU=off).
// ============================================

const LIM = {
  title: 60,
  body: 1000,
  footer: 60,
  button: 20, // teks tombol balasan cepat
  listButton: 20, // teks tombol pembuka list
  section: 24,
  rowTitle: 24,
  rowDesc: 72,
  id: 200,
  quick: 3, // maks tombol balasan cepat
  rows: 10 // maks total baris list (batas aman)
};

// Potong berdasarkan karakter (emoji tidak terbelah)
function clamp(s, n) {
  const a = Array.from(String(s ?? '').trim());
  return a.length > n ? a.slice(0, n - 1).join('').trimEnd() + '…' : a.join('');
}

const isInteractive = (r) => !!r && typeof r === 'object' && !!r.interactive && typeof r.interactive === 'object';

// ---------- Bentuk spesifikasi → daftar tombol native flow ----------
function nativeButtons(spec) {
  const out = [];

  const sections = (spec.list?.sections || [])
    .map((s) => ({
      title: clamp(s.title || '', LIM.section),
      rows: (s.rows || []).map((r) => ({
        header: '',
        title: clamp(r.title, LIM.rowTitle),
        description: clamp(r.description || '', LIM.rowDesc),
        id: String(r.id).slice(0, LIM.id)
      }))
    }))
    .filter((s) => s.rows.length);

  // batasi total baris
  let left = LIM.rows;
  for (const s of sections) {
    s.rows = s.rows.slice(0, Math.max(0, left));
    left -= s.rows.length;
  }

  const rowsOk = sections.filter((s) => s.rows.length);
  if (rowsOk.length) {
    out.push({
      name: 'single_select',
      buttonParamsJson: JSON.stringify({ title: clamp(spec.list.button || 'Pilih', LIM.listButton), sections: rowsOk })
    });
  }

  for (const b of (spec.buttons || []).slice(0, LIM.quick)) {
    out.push({
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: clamp(b.text, LIM.button), id: String(b.id).slice(0, LIM.id) })
    });
  }
  return out;
}

// Isi pesan (belum dibungkus proto) — dipisah supaya mudah dites
function buildContent(spec, proto) {
  const make = proto?.Message?.InteractiveMessage?.create
    ? (o) => proto.Message.InteractiveMessage.create(o)
    : (o) => o;
  const buttons = nativeButtons(spec);
  if (!buttons.length) throw new Error('pesan interaktif tanpa tombol');

  const msg = {
    body: { text: clamp(spec.body || ' ', LIM.body) },
    nativeFlowMessage: { buttons, messageParamsJson: '{}' }
  };
  if (spec.title) msg.header = { title: clamp(spec.title, LIM.title), hasMediaAttachment: false };
  if (spec.footer) msg.footer = { text: clamp(spec.footer, LIM.footer) };

  return {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: make(msg)
      }
    }
  };
}

// Node tambahan agar WhatsApp merender tombol (tanpa ini pesan tampil "tidak didukung")
function bizNodes(jid) {
  const nodes = [
    {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: { type: 'native_flow', v: '1' },
          content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
        }
      ]
    }
  ];
  if (!String(jid).endsWith('@g.us')) nodes.push({ tag: 'bot', attrs: { biz_bot: '1' } });
  return nodes;
}

// Kirim. `deps` hanya untuk tes; di produksi diambil dari Baileys.
async function send(sock, jid, spec, opts = {}) {
  const B = opts.deps || require('@whiskeysockets/baileys');
  const content = buildContent(spec, B.proto);
  const msg = B.generateWAMessageFromContent(jid, content, {
    userJid: sock.user?.id,
    quoted: opts.quoted
  });
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id, additionalNodes: bizNodes(jid) });
  return msg; // msg.key.id dipakai pemanggil untuk mengabaikan pesan buatan bot sendiri
}

// ---------- Versi teks (fallback otomatis bila command tidak menyediakan) ----------
function toText(spec) {
  const lines = [];
  if (spec.title) lines.push(`*${spec.title}*`);
  if (spec.body) lines.push(spec.body);
  const items = [];
  for (const s of spec.list?.sections || []) {
    if (s.title) items.push(`\n*${s.title}*`);
    for (const r of s.rows || []) items.push(`• *${r.id}* — ${r.title}`);
  }
  for (const b of spec.buttons || []) items.push(`• *${b.id}* — ${b.text}`);
  if (items.length) lines.push(items.join('\n').trim());
  return lines.join('\n\n');
}

// Dipakai saat pesan interaktif dimatikan: ganti objek interaktif dengan teksnya
const downgrade = (r) => (isInteractive(r) ? r.fallback || toText(r.interactive) : r);

// ---------- Membaca ketukan tombol/list yang masuk ----------
// Mengembalikan teks perintah (id) atau '' bila bukan respons tombol.
function replyIdOf(c) {
  if (!c) return '';
  const nf = c.interactiveResponseMessage?.nativeFlowResponseMessage;
  if (nf?.paramsJson) {
    try {
      const p = JSON.parse(nf.paramsJson);
      const id = p.id ?? p.selectedId ?? p.selected_id ?? p.selectedRowId ?? p.row_id;
      if (id != null && String(id).trim()) return String(id).trim();
    } catch {}
  }
  return (
    c.buttonsResponseMessage?.selectedButtonId ||
    c.listResponseMessage?.singleSelectReply?.selectedRowId ||
    c.templateButtonReplyMessage?.selectedId ||
    ''
  );
}

// Apakah pesan ini ketukan tombol/list (bukan teks yang diketik)?
const isReply = (c) =>
  !!(c && (c.interactiveResponseMessage || c.buttonsResponseMessage || c.listResponseMessage || c.templateButtonReplyMessage));

module.exports = { LIM, clamp, isInteractive, nativeButtons, buildContent, bizNodes, send, toText, downgrade, replyIdOf, isReply };
