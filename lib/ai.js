// ============================================
// AI INTEGRATION — Groq / Gemini / OpenRouter
// ============================================
const axios = require("axios");

const AI_PROVIDER = process.env.AI_PROVIDER || "groq";
const AI_MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";
const AI_MAX_TOKENS = parseInt(process.env.AI_MAX_TOKENS) || 500;
const AI_SYSTEM_PROMPT =
  process.env.AI_SYSTEM_PROMPT ||
  "Kamu adalah asisten kelas PPLG X-3. Jawab ramah, singkat, bahasa Indonesia santai.";

// History per user (biar bot inget konteks percakapan)
const chatHistory = new Map();
const MAX_HISTORY = 10;

async function tanyaAI(pesan, userId = "default") {
  // Ambil history user
  const history = chatHistory.get(userId) || [];

  // Tambah pesan user
  history.push({ role: "user", content: pesan });

  // Batasi history
  while (history.length > MAX_HISTORY * 2) history.shift();

  let jawaban = "";

  try {
    if (AI_PROVIDER === "groq") {
      jawaban = await callGroq(history);
    } else if (AI_PROVIDER === "gemini") {
      jawaban = await callGemini(pesan, history);
    } else if (AI_PROVIDER === "openrouter") {
      jawaban = await callOpenRouter(history);
    } else {
      return "❌ Provider AI tidak dikenal.";
    }

    // Simpan jawaban ke history
    history.push({ role: "assistant", content: jawaban });
    chatHistory.set(userId, history);

    return jawaban;
  } catch (err) {
    console.error("❌ AI Error:", err.message);
    if (err.response?.status === 429) {
      return "⚠️ AI sedang sibuk (limit tercapai). Coba lagi sebentar.";
    }
    return "❌ Gagal menghubungi AI. Coba lagi nanti.";
  }
}

// ============================================
// PROVIDER: GROQ
// ============================================
async function callGroq(history) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: AI_MODEL,
      messages: [{ role: "system", content: AI_SYSTEM_PROMPT }, ...history],
      max_tokens: AI_MAX_TOKENS,
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );
  return res.data.choices[0].message.content.trim();
}

// ============================================
// PROVIDER: GEMINI
// ============================================
async function callGemini(pesan, history) {
  const contents = history.map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }]
  }));

  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      system_instruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
      contents,
      generationConfig: { maxOutputTokens: AI_MAX_TOKENS, temperature: 0.7 }
    },
    { headers: { "Content-Type": "application/json" }, timeout: 30000 }
  );
  return res.data.candidates[0].content.parts[0].text.trim();
}

// ============================================
// PROVIDER: OPENROUTER
// ============================================
async function callOpenRouter(history) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: AI_MODEL,
      messages: [{ role: "system", content: AI_SYSTEM_PROMPT }, ...history],
      max_tokens: AI_MAX_TOKENS
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );
  return res.data.choices[0].message.content.trim();
}

// Reset history user (buat command "reset")
function resetHistory(userId) {
  chatHistory.delete(userId);
}

// ============================================
// AI VISION — tanya soal gambar (groq / openrouter)
// Butuh gambar dalam bentuk Buffer; lihat lib/vision.js (ambilGambar).
// ============================================

const AI_VISION_MODEL = process.env.AI_VISION_MODEL || "qwen/qwen3.8-27b";
const AI_VISION_MAX_TOKENS = parseInt(process.env.AI_VISION_MAX_TOKENS) || 800;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // batas aman untuk base64

async function callVision(messages) {
    let url, key;
    if (AI_PROVIDER === "groq") {
        url = "https://api.groq.com/openai/v1/chat/completions";
        key = process.env.GROQ_API_KEY;
    } else if (AI_PROVIDER === "openrouter") {
        url = "https://openrouter.ai/api/v1/chat/completions";
        key = process.env.OPENROUTER_API_KEY;
    } else {
        throw new Error("PROVIDER_NO_VISION");
    }

    const res = await axios.post(
        url,
        {
            model: AI_VISION_MODEL,
            messages: [{ role: "system", content: AI_SYSTEM_PROMPT }, ...messages],
            max_tokens: AI_VISION_MAX_TOKENS,
            temperature: 0.5
        },
        {
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            timeout: 60000
        }
    );

    return res.data.choices[0].message.content
        .replace(/<think>[\s\S]*?<\/think>/g, "") // buang blok reasoning kalau ada
        .trim();
}

async function tanyaAIGambar(pesan, imageBuffer, mimetype = "image/jpeg", userId = "default") {
    if (imageBuffer.length > MAX_IMAGE_BYTES) {
        return "⚠️ Gambar terlalu besar (maks 4 MB). Kirim sebagai foto biasa, bukan dokumen.";
    }

    const prompt = (pesan || "").trim() || "Jelaskan isi gambar ini dengan singkat.";
    const history = chatHistory.get(userId) || [];
    const dataUrl = `data:${mimetype};base64,${imageBuffer.toString("base64")}`;

    // Gambar hanya dikirim di giliran ini; history hanya menyimpan teks supaya memori tidak bengkak
    const pesanUser = {
        role: "user",
        content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } }
        ]
    };

    try {
        const jawaban = await callVision([...history, pesanUser]);
        history.push({ role: "user", content: `[Pengguna mengirim gambar] ${prompt}` });
        history.push({ role: "assistant", content: jawaban });
        while (history.length > MAX_HISTORY * 2) history.shift();
        chatHistory.set(userId, history);
        return jawaban || "🤔 AI tidak memberi jawaban. Coba kirim ulang gambarnya.";
    } catch (err) {
        if (err.message === "PROVIDER_NO_VISION") {
            return "⚠️ Provider AI saat ini belum mendukung gambar. Gunakan groq atau openrouter.";
        }
        console.error("❌ Vision Error:", err.response?.data?.error?.message || err.message);
        if (err.response?.status === 429) return "⚠️ AI sedang sibuk, coba lagi sebentar.";
        if (err.response?.status === 400) return "❌ Model vision tidak menerima permintaan ini. Cek AI_VISION_MODEL di .env.";
        return "❌ Gagal menganalisis gambar. Coba lagi nanti.";
    }
}

module.exports = { tanyaAI, tanyaAIGambar, resetHistory };
