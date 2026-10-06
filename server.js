// lib/dashboard/server.js
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const hub = require("./hub");

const PORT = parseInt(process.env.DASHBOARD_PORT) || 3000;
const HOST = process.env.DASHBOARD_HOST || "127.0.0.1";
const PASSWORD = process.env.DASHBOARD_PASSWORD || "";
const SESSION_TTL = 12 * 3600 * 1000;
const LISTS = ["tugas", "catatan", "pengumuman"];

const wib = () => new Date(Date.now() + 7 * 3600e3);
const digits = hub.digits;
const normNumber = (v) => {
    let n = digits(v);
    if (n.startsWith("0")) n = "62" + n.slice(1);
    if (n.length < 8 || n.length > 16) throw new Error("Nomor tidak valid (contoh: 08123456789)");
    return n;
};

function mutate(fn) {
    const db = hub.readDB();
    for (const k of LISTS) if (!Array.isArray(db[k])) db[k] = [];
    db.state = db.state || {};
    const r = fn(db);
    hub.writeDB(db);
    return r;
}

function cleanItem(b) {
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Item harus berupa objek");
    if (Object.keys(b).length > 30) throw new Error("Terlalu banyak field");
    return b;
}

function newId(arr) {
    const ids = arr.map((x) => x && x.id).filter((v) => v !== undefined && v !== null && v !== "");
    if (!ids.length) return undefined;
    return ids.every((v) => typeof v === "number") ? Math.max(...ids) + 1 : crypto.randomBytes(4).toString("hex");
}

function start() {
    if (PASSWORD.length < 8) {
        console.warn("⚠️ Dashboard TIDAK dijalankan: isi DASHBOARD_PASSWORD (minimal 8 karakter) di .env");
        return;
    }

    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "5mb" }));
    app.use((req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
        next();
    });

    const wrap = (fn) => (req, res) =>
        Promise.resolve().then(() => fn(req, res)).catch((e) => {
            hub.log("err", `Dashboard: ${e.message}`);
            res.status(400).json({ error: e.message });
        });

    /* ── auth ── */
    const sessions = new Map();
    const fails = new Map();
    const getCookie = (req, name) =>
        (req.headers.cookie || "").split(";").map((s) => s.trim().split("=")).find(([k]) => k === name)?.[1];
    const isAuthed = (req) => {
        const t = getCookie(req, "sid");
        const exp = t && sessions.get(t);
        if (exp && exp > Date.now()) return true;
        if (t) sessions.delete(t);
        return false;
    };

    app.post("/api/login", (req, res) => {
        const ip = req.ip;
        const f = fails.get(ip) || { n: 0, until: 0 };
        if (f.until > Date.now()) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi 5 menit lagi." });
        const h = (s) => crypto.createHash("sha256").update(String(s || "")).digest();
        if (!crypto.timingSafeEqual(h(req.body?.password), h(PASSWORD))) {
            f.n++;
            if (f.n >= 5) { f.until = Date.now() + 5 * 60000; f.n = 0; }
            fails.set(ip, f);
            hub.log("warn", `Login dashboard gagal dari ${ip}`);
            return res.status(401).json({ error: "Password salah" });
        }
        fails.delete(ip);
        const token = crypto.randomBytes(32).toString("hex");
        sessions.set(token, Date.now() + SESSION_TTL);
        res.setHeader("Set-Cookie", `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}`);
        hub.log("sys", `Login dashboard dari ${ip}`);
        res.json({ ok: true });
    });

    app.use(express.static(__dirname));
    app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
    app.use("/api", (req, res, next) => (isAuthed(req) ? next() : res.status(401).json({ error: "Belum login" })));

    app.get("/api/me", (req, res) => res.json({ ok: true }));
    app.post("/api/logout", (req, res) => {
        sessions.delete(getCookie(req, "sid"));
        res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0");
        res.json({ ok: true });
    });

    /* ── status ── */
    let qrCache = { raw: null, url: null };
    app.get("/api/status", wrap(async (req, res) => {
        const c = hub.conn;
        let qr = null;
        if (c.qr) {
            if (qrCache.raw !== c.qr) qrCache = { raw: c.qr, url: await QRCode.toDataURL(c.qr, { margin: 2, width: 320 }) };
            qr = qrCache.url;
        }
        const db = hub.readDB();
        const st = db.state || {};
        res.json({
            status: c.status,
            user: digits(String(c.user || "").split(":")[0]),
            uptime: Math.floor(process.uptime()),
            qr,
            testReady: hub.hasTestRunner(),
            semester: st.semester,
            tiles: {
                hitsToday: st.hits?.[wib().toISOString().slice(0, 10)] || 0,
                subscribers: Object.keys(st.subscribers || {}).length,
                admins: (st.admins || []).length,
                tugas: (db.tugas || []).length
            }
        });
    }));

    /* ── log ── */
    app.get("/api/logs", (req, res) => res.json(hub.logs));
    app.get("/api/logs/stream", (req, res) => {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": ok\n\n");
        const on = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
        hub.bus.on("log", on);
        const ping = setInterval(() => res.write(": ping\n\n"), 25000);
        req.on("close", () => { hub.bus.off("log", on); clearInterval(ping); });
    });

    /* ── broadcast ── */
    app.get("/api/broadcast", (req, res) => res.json(hub.job));
    app.post("/api/broadcast", wrap((req, res) => {
        const text = String(req.body?.text || "").trim();
        if (!text) throw new Error("Pesan tidak boleh kosong");
        if (text.length > 3000) throw new Error("Pesan maksimal 3000 karakter");
        const flag = req.body?.flag ? String(req.body.flag) : "";
        if (flag && !/^[a-z][a-z_]{0,19}$/.test(flag)) throw new Error("Filter tidak valid");
        res.json(hub.broadcast(text, flag));
    }));

    /* ── tugas / catatan / pengumuman ── */
    const listName = (req) => {
        if (!LISTS.includes(req.params.name)) throw new Error("Daftar tidak dikenal");
        return req.params.name;
    };
    app.get("/api/list/:name", wrap((req, res) => res.json(hub.readDB()[listName(req)] || [])));
    app.post("/api/list/:name", wrap((req, res) => {
        const n = listName(req);
        const item = cleanItem(req.body);
        mutate((db) => {
            if (item.id === undefined || item.id === "" || item.id === 0 || item.id === null) {
                const nid = newId(db[n]);
                if (nid !== undefined) item.id = nid; else delete item.id;
            }
            db[n].push(item);
        });
        res.json({ ok: true });
    }));
    app.put("/api/list/:name/:i", wrap((req, res) => {
        const n = listName(req);
        const i = parseInt(req.params.i);
        const item = cleanItem(req.body);
        mutate((db) => { if (!(i >= 0 && i < db[n].length)) throw new Error("Item tidak ditemukan"); db[n][i] = item; });
        res.json({ ok: true });
    }));
    app.delete("/api/list/:name/:i", wrap((req, res) => {
        const n = listName(req);
        const i = parseInt(req.params.i);
        mutate((db) => { if (!(i >= 0 && i < db[n].length)) throw new Error("Item tidak ditemukan"); db[n].splice(i, 1); });
        res.json({ ok: true });
    }));

    /* ── admin, subscriber, semester ── */
    app.get("/api/state", wrap((req, res) => {
        const s = hub.readDB().state || {};
        res.json({ subscribers: s.subscribers || {}, admins: s.admins || [], semester: s.semester, semesterMode: s.semesterMode });
    }));
    app.post("/api/admins", wrap((req, res) => {
        const num = normNumber(req.body?.number);
        mutate((db) => {
            const a = (db.state.admins = db.state.admins || []);
            if (a.some((x) => digits(x) === num)) throw new Error("Nomor itu sudah jadi admin");
            // ikuti format yang sudah dipakai bot: "628xx" atau "628xx@s.whatsapp.net"
            a.push(a.some((x) => String(x).includes("@")) ? `${num}@s.whatsapp.net` : num);
        });
        hub.log("sys", `Admin ditambah dari dashboard: ${num}`);
        res.json({ ok: true });
    }));
    app.delete("/api/admins/:value", wrap((req, res) => {
        const num = digits(req.params.value);
        mutate((db) => { db.state.admins = (db.state.admins || []).filter((x) => digits(x) !== num); });
        hub.log("sys", `Admin dihapus dari dashboard: ${num}`);
        res.json({ ok: true });
    }));
    app.patch("/api/subscribers/:id", wrap((req, res) => {
        const flag = String(req.body?.flag || "");
        if (!/^[a-z][a-z_]{0,19}$/.test(flag)) throw new Error("Flag tidak valid");
        mutate((db) => {
            const subs = (db.state.subscribers = db.state.subscribers || {});
            if (!(req.params.id in subs)) throw new Error("Subscriber tidak ditemukan");
            const cur = subs[req.params.id];
            subs[req.params.id] = { ...(cur && typeof cur === "object" ? cur : {}), [flag]: !!req.body.value };
        });
        res.json({ ok: true });
    }));
    app.delete("/api/subscribers/:id", wrap((req, res) => {
        mutate((db) => { if (db.state.subscribers) delete db.state.subscribers[req.params.id]; });
        res.json({ ok: true });
    }));
    app.post("/api/semester", wrap((req, res) => {
        const { semester, mode } = req.body || {};
        if (semester && !["ganjil", "genap"].includes(semester)) throw new Error("Semester tidak valid");
        if (mode && !["auto", "manual"].includes(mode)) throw new Error("Mode tidak valid");
        mutate((db) => { if (semester) db.state.semester = semester; if (mode) db.state.semesterMode = mode; });
        res.json({ ok: true });
    }));

    /* ── akses: blokir & grup ── */
    app.get("/api/access", (req, res) => res.json({
        blocked: hub.data.blocked, defaultGroupEnabled: hub.data.defaultGroupEnabled, groups: hub.data.groups
    }));
    app.post("/api/access/block", wrap((req, res) => {
        const n = normNumber(req.body?.number);
        if (!hub.data.blocked.includes(n)) hub.data.blocked.push(n);
        hub.save();
        hub.log("sys", `Nomor diblokir: ${n}`);
        res.json({ ok: true });
    }));
    app.delete("/api/access/block/:n", wrap((req, res) => {
        hub.data.blocked = hub.data.blocked.filter((x) => x !== digits(req.params.n));
        hub.save();
        res.json({ ok: true });
    }));
    app.post("/api/access/group", wrap((req, res) => {
        const jid = String(req.body?.jid || "");
        if (!jid.endsWith("@g.us")) throw new Error("ID grup tidak valid");
        hub.data.groups[jid] = { name: hub.data.groups[jid]?.name || "", enabled: !!req.body.enabled };
        hub.save();
        hub.log("sys", `Grup ${hub.data.groups[jid].name || jid} ${req.body.enabled ? "diaktifkan" : "dinonaktifkan"}`);
        res.json({ ok: true });
    }));
    app.post("/api/access/default", wrap((req, res) => {
        hub.data.defaultGroupEnabled = !!req.body?.enabled;
        hub.save();
        res.json({ ok: true });
    }));
    app.post("/api/access/groups/refresh", wrap(async (req, res) => res.json({ count: await hub.refreshGroups() })));

    /* ── test command ── */
    app.post("/api/test", wrap(async (req, res) => {
        const text = String(req.body?.text || "").trim().slice(0, 500);
        if (!text) throw new Error("Command kosong");
        let num = digits(req.body?.number);
        if (!num) num = digits(hub.readDB().state?.admins?.[0] ?? (process.env.BOT_ADMINS || "").split(",")[0]);
        if (!num) num = "6280000000000";
        res.json({ out: await hub.runTest(text, num) });
    }));

    /* ── backup & restore ── */
    app.get("/api/backup", wrap((req, res) => {
        res.setHeader("Content-Disposition", `attachment; filename="database-${wib().toISOString().slice(0, 10)}.json"`);
        res.type("application/json").send(fs.readFileSync(hub.DB_FILE));
    }));
    app.post("/api/restore", wrap((req, res) => {
        const d = req.body;
        const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
        if (!isObj(d) || !LISTS.every((k) => Array.isArray(d[k])) || !isObj(d.state)) throw new Error("Format database.json tidak valid");
        if (d.state.admins !== undefined && !Array.isArray(d.state.admins)) throw new Error("state.admins harus berupa array");
        if (d.state.subscribers !== undefined && !isObj(d.state.subscribers)) throw new Error("state.subscribers harus berupa objek");
        let backup = null;
        if (fs.existsSync(hub.DB_FILE)) {
            backup = `database.backup-${wib().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.json`;
            fs.copyFileSync(hub.DB_FILE, path.join(hub.ROOT, backup));
        }
        hub.writeDB(d);
        hub.log("sys", `Database direstore dari dashboard${backup ? ` (salinan lama: ${backup})` : ""}`);
        res.json({ ok: true, backup });
    }));

    /* ── statistik ── */
    app.get("/api/stats", wrap((req, res) => {
        const hits = hub.readDB().state?.hits || {};
        res.json({
            days: Object.keys(hits).sort().slice(-14).map((d) => ({ d, n: Number(hits[d]) || 0 })),
            total: Object.values(hits).reduce((a, b) => a + (Number(b) || 0), 0),
            cmds: Object.entries(hub.data.stats.commands).sort((a, b) => b[1] - a[1]).slice(0, 10),
            hours: hub.data.stats.hours
        });
    }));

    app.listen(PORT, HOST, () => console.log(`🖥️  Dashboard: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`))
        .on("error", (e) => console.error("Dashboard gagal start:", e.message));
}

if (require.main === module) {
    start();
}

module.exports = { start };
