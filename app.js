"use strict";

/* ───────── util ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const idShort = (id) => (String(id).endsWith("@g.us") ? "Grup " : "") + String(id).split("@")[0];
const hhmmss = (t) => new Date(t).toLocaleTimeString("id-ID", { hour12: false });

async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && path !== "/login") { showLogin(); throw new Error("Sesi berakhir, silakan masuk lagi"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

function toast(msg, bad) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (bad ? " bad" : "");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.className = "toast"), 3200);
}
const act = async (fn) => { try { await fn(); } catch (e) { toast(e.message, true); } };

function fmtUptime(s) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return (d ? d + " hari " : "") + (h ? h + " jam " : "") + m + " menit";
}

/* ───────── modal & form dinamis ───────── */
function openModal(title, bodyHTML, onSave) {
  const d = $("#modal");
  $("#mTitle").textContent = title;
  $("#mBody").innerHTML = bodyHTML;
  $("#mForm").onsubmit = (e) => {
    e.preventDefault();
    act(async () => { await onSave($("#mBody")); d.close(); });
  };
  $("#mCancel").onclick = () => d.close();
  d.showModal();
}

function fieldHTML(k, v) {
  const key = esc(k);
  if (typeof v === "boolean") return `<label class="chk"><input type="checkbox" data-k="${key}" data-t="b" ${v ? "checked" : ""}>${key}</label>`;
  if (typeof v === "number") return `<label>${key}<input type="number" step="any" data-k="${key}" data-t="n" value="${esc(v)}"></label>`;
  if (typeof v === "string") {
    const long = v.length > 50 || /ket|desk|isi|teks|catat/i.test(k);
    return long
      ? `<label>${key}<textarea rows="3" data-k="${key}" data-t="s">${esc(v)}</textarea></label>`
      : `<label>${key}<input type="text" data-k="${key}" data-t="s" value="${esc(v)}"></label>`;
  }
  return `<label>${key} (format JSON)<textarea rows="3" data-k="${key}" data-t="j">${esc(JSON.stringify(v))}</textarea></label>`;
}
function readFields(root) {
  const o = {};
  $$("[data-k]", root).forEach((el) => {
    const t = el.dataset.t;
    o[el.dataset.k] = t === "b" ? el.checked : t === "n" ? Number(el.value || 0) : t === "j" ? JSON.parse(el.value || "null") : el.value;
  });
  return o;
}
const blank = (v) => (typeof v === "string" ? "" : typeof v === "number" ? 0 : typeof v === "boolean" ? false : Array.isArray(v) ? [] : v && typeof v === "object" ? {} : "");

/* ───────── navigasi ───────── */
const TABS = [
  ["status", "Status"], ["broadcast", "Broadcast"], ["tugas", "Tugas & agenda"], ["pengguna", "Pengguna"],
  ["akses", "Akses & grup"], ["test", "Test command"], ["log", "Log"], ["statistik", "Statistik"], ["backup", "Backup"]
];
let current = null, timer = null;
const views = {};

function buildNav() {
  $("#nav").innerHTML =
    `<div class="brand">Bot PPLG X-3<small>Dashboard admin</small></div>` +
    TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join("") +
    `<button class="out" id="logout">Keluar</button>`;
}
async function show(tab) {
  clearInterval(timer); timer = null;
  current = tab;
  $$("#nav [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  history.replaceState(null, "", "#" + tab);
  const v = $("#view");
  v.innerHTML = "";
  v.onclick = v.onchange = null;
  await act(() => views[tab]());
}

/* ───────── status ───────── */
views.status = async () => {
  $("#view").innerHTML = `<h2>Status bot</h2><div id="st"></div>`;
  let last = "";
  const tick = async () => {
    const s = await api("/status");
    if (current !== "status") return;
    const key = JSON.stringify({ ...s, uptime: 0 });
    if (key !== last) {
      last = key;
      const [label, cls] = {
        connected: ["Terhubung", "ok"], qr: ["Menunggu scan QR", "warn"], connecting: ["Menghubungkan", "warn"],
        disconnected: ["Terputus", "err"], starting: ["Memulai", "warn"]
      }[s.status] || [s.status, "warn"];
      const tile = (l, n) => `<div class="tile"><b>${esc(n)}</b><span>${l}</span></div>`;
      $("#st").innerHTML = `
        <div class="card">
          <div class="row"><span class="badge ${cls}">${label}</span>
            ${s.user ? `<span class="muted">Nomor bot +${esc(s.user)}</span>` : ""}
            <span class="muted">Aktif <b id="up"></b></span></div>
          ${s.qr ? `<div class="qr"><img src="${s.qr}" alt="Kode QR untuk menautkan WhatsApp"><p class="muted">Buka WhatsApp, pilih Perangkat tertaut, lalu Tautkan perangkat dan scan kode ini. Kode diperbarui otomatis.</p></div>` : ""}
          ${s.status === "disconnected" ? `<p class="muted" style="margin-top:12px">Penyebabnya biasanya ada di tab Log.</p>` : ""}
        </div>
        <div class="tiles">
          ${tile("Hits hari ini", s.tiles.hitsToday)}${tile("Subscriber", s.tiles.subscribers)}
          ${tile("Admin", s.tiles.admins)}${tile("Tugas tersimpan", s.tiles.tugas)}
          ${tile("Semester", s.semester || "-")}
        </div>
        ${s.testReady ? "" : `<p class="muted" style="margin-top:14px">Test command belum aktif: pasang hub.setTestRunner di index.js.</p>`}`;
    }
    const up = $("#up"); if (up) up.textContent = fmtUptime(s.uptime);
  };
  timer = setInterval(() => act(tick), 2000);
  await tick();
};

/* ───────── broadcast ───────── */
views.broadcast = async () => {
  const st = await api("/state");
  const subs = Object.values(st.subscribers);
  const flags = [...new Set(subs.flatMap((s) => (s && typeof s === "object" ? Object.keys(s).filter((k) => typeof s[k] === "boolean") : [])))];
  const count = (f) => (f ? subs.filter((s) => s && s[f]).length : subs.length);
  $("#view").innerHTML = `<h2>Broadcast pengumuman</h2>
    <div class="card">
      <label>Kirim ke
        <select id="bcFlag"><option value="">Semua subscriber (${subs.length})</option>
        ${flags.map((f) => `<option value="${esc(f)}">Subscriber ${esc(f)} aktif (${count(f)})</option>`).join("")}</select></label>
      <label>Pesan<textarea id="bcText" rows="7" maxlength="3000" placeholder="Tulis pengumuman untuk kelas"></textarea></label>
      <div class="row"><button class="btn primary" id="bcSend">Kirim broadcast</button>
        <span class="muted">Ada jeda 1,5 sampai 3 detik per chat agar tidak kena pembatasan WhatsApp.</span></div>
      <div id="bcProg"></div>
    </div>`;
  const prog = async () => {
    const j = await api("/broadcast");
    if (current !== "broadcast") return;
    $("#bcSend").disabled = j.running;
    $("#bcProg").innerHTML = j.total
      ? `<div class="prog"><i data-w="${Math.round(((j.sent + j.failed) / j.total) * 100)}"></i></div>
         <span class="muted">${j.running ? "Mengirim" : "Selesai"}: ${j.sent} terkirim, ${j.failed} gagal dari ${j.total} chat</span>` : "";
    $$("[data-w]").forEach((el) => (el.style.width = el.dataset.w + "%"));
  };
  $("#bcSend").onclick = () => act(async () => {
    const flag = $("#bcFlag").value, text = $("#bcText").value.trim();
    if (!text) throw new Error("Tulis pesannya dulu");
    if (!confirm(`Kirim pesan ini ke ${count(flag)} chat?`)) return;
    await api("/broadcast", "POST", { text, flag });
    toast("Broadcast dimulai");
    await prog();
  });
  timer = setInterval(() => act(prog), 1000);
  await prog();
};

/* ───────── tugas, catatan, pengumuman ───────── */
let listName = "tugas", listCache = [];
const fmt = (v) => (v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

views.tugas = async () => {
  $("#view").innerHTML = `<h2>Tugas & agenda</h2>
    <div class="seg" id="seg">${["tugas", "catatan", "pengumuman"].map((n) => `<button data-l="${n}" class="${n === listName ? "on" : ""}">${n}</button>`).join("")}</div>
    <div id="listBox"></div>`;
  $("#view").onclick = (e) => {
    const b = e.target.closest("[data-l],[data-add],[data-edit],[data-del]");
    if (!b) return;
    act(async () => {
      if (b.dataset.l) { listName = b.dataset.l; return views.tugas(); }
      if (b.dataset.add !== undefined) {
        const last = listCache[listCache.length - 1];
        const tpl = last && typeof last === "object" ? Object.fromEntries(Object.entries(last).map(([k, v]) => [k, blank(v)])) : {};
        return itemModal("Tambah item", tpl, (o) => api(`/list/${listName}`, "POST", o));
      }
      const i = Number(b.dataset.edit ?? b.dataset.del);
      if (b.dataset.del !== undefined) {
        if (!confirm("Hapus item ini?")) return;
        await api(`/list/${listName}/${i}`, "DELETE");
        toast("Dihapus");
        return renderList();
      }
      itemModal("Edit item", listCache[i], (o) => api(`/list/${listName}/${i}`, "PUT", o));
    });
  };
  await renderList();
};

function itemModal(title, tpl, send) {
  const keys = Object.keys(tpl);
  const body = keys.length
    ? keys.map((k) => fieldHTML(k, tpl[k])).join("")
    : `<p class="muted">Belum ada contoh data. Isi item dalam format JSON.</p><label>Item<textarea rows="8" id="rawItem">{}</textarea></label>`;
  openModal(title, body, async (box) => {
    await send(keys.length ? readFields(box) : JSON.parse($("#rawItem", box).value));
    toast("Tersimpan");
    await renderList();
  });
}

async function renderList() {
  const items = await api("/list/" + listName);
  if (current !== "tugas") return;
  listCache = items;
  const keys = [...new Set(items.flatMap((i) => (i && typeof i === "object" ? Object.keys(i) : [])))];
  $("#listBox").innerHTML =
    `<div class="row between"><span class="muted">${items.length} item</span><button class="btn primary" data-add>Tambah</button></div>` +
    (items.length
      ? `<div class="card scroll"><table><thead><tr><th>No</th>${keys.map((k) => `<th>${esc(k)}</th>`).join("")}<th></th></tr></thead><tbody>` +
        items.map((it, i) => `<tr><td>${i + 1}</td>${keys.map((k) => `<td>${esc(fmt(it?.[k]))}</td>`).join("")}<td class="nowrap"><button class="btn sm" data-edit="${i}">Edit</button> <button class="btn sm danger" data-del="${i}">Hapus</button></td></tr>`).join("") +
        `</tbody></table></div>`
      : `<div class="card muted">Belum ada data di daftar ${listName}. Klik Tambah untuk membuat yang pertama.</div>`);
}

/* ───────── pengguna: semester, admin, subscriber ───────── */
views.pengguna = async () => {
  const st = await api("/state");
  const subs = Object.entries(st.subscribers);
  const found = [...new Set(subs.flatMap(([, s]) => (s && typeof s === "object" ? Object.keys(s).filter((k) => typeof s[k] === "boolean") : [])))];
  const cols = found.length ? found : ["pagi", "malam", "tugas", "kelas"];
  $("#view").innerHTML = `<h2>Pengguna</h2>
    <div class="grid2" style="margin-bottom:16px">
      <div class="card"><h3>Semester</h3>
        <label>Mode<select id="smMode"><option value="auto">auto</option><option value="manual">manual</option></select></label>
        <label>Semester (dipakai saat mode manual)<select id="smSem"><option value="ganjil">ganjil</option><option value="genap">genap</option></select></label>
        <button class="btn primary" id="smSave">Simpan semester</button></div>
      <div class="card"><h3>Admin bot</h3>
        <ul class="list">${st.admins.map((a) => `<li><span>${esc(String(a).split("@")[0])}</span><button class="btn sm danger" data-deladm="${esc(a)}">Hapus</button></li>`).join("") || `<li class="muted">Belum ada admin</li>`}</ul>
        <div class="row"><input id="admNum" placeholder="08123456789" inputmode="tel" aria-label="Nomor admin baru"><button class="btn" id="admAdd">Tambah admin</button></div></div>
    </div>
    <div class="card scroll"><h3>Subscriber (${subs.length})</h3>
      ${subs.length ? `<table><thead><tr><th>Chat</th>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}<th></th></tr></thead><tbody>
      ${subs.map(([id, s]) => `<tr><td>${esc(idShort(id))}</td>${cols.map((c) => `<td><label class="sw"><input type="checkbox" aria-label="${esc(c)} untuk ${esc(idShort(id))}" data-sub="${esc(id)}" data-flag="${esc(c)}" ${s && s[c] ? "checked" : ""}><span></span></label></td>`).join("")}<td><button class="btn sm danger" data-delsub="${esc(id)}">Hapus</button></td></tr>`).join("")}
      </tbody></table>` : `<p class="muted">Belum ada subscriber. Mereka muncul di sini setelah memakai perintah langganan di WhatsApp.</p>`}</div>`;
  $("#smMode").value = st.semesterMode || "auto";
  $("#smSem").value = st.semester || "ganjil";
  const v = $("#view");
  v.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    act(async () => {
      if (b.id === "smSave") { await api("/semester", "POST", { mode: $("#smMode").value, semester: $("#smSem").value }); toast("Semester disimpan"); }
      else if (b.id === "admAdd") { await api("/admins", "POST", { number: $("#admNum").value }); toast("Admin ditambahkan"); await views.pengguna(); }
      else if (b.dataset.deladm) { if (!confirm("Hapus admin ini?")) return; await api("/admins/" + encodeURIComponent(b.dataset.deladm), "DELETE"); await views.pengguna(); }
      else if (b.dataset.delsub) { if (!confirm("Hapus subscriber ini?")) return; await api("/subscribers/" + encodeURIComponent(b.dataset.delsub), "DELETE"); await views.pengguna(); }
    });
  };
  v.onchange = (e) => {
    const c = e.target.closest("[data-sub]");
    if (c) act(() => api("/subscribers/" + encodeURIComponent(c.dataset.sub), "PATCH", { flag: c.dataset.flag, value: c.checked }));
  };
};

/* ───────── akses: blokir & grup ───────── */
views.akses = async () => {
  const a = await api("/access");
  const groups = Object.entries(a.groups).sort((x, y) => (x[1].name || x[0]).localeCompare(y[1].name || y[0]));
  $("#view").innerHTML = `<h2>Akses & grup</h2>
    <div class="grid2">
      <div class="card"><h3>Nomor diblokir</h3>
        <ul class="list">${a.blocked.map((n) => `<li><span>${esc(n)}</span><button class="btn sm" data-unblock="${esc(n)}">Buka blokir</button></li>`).join("") || `<li class="muted">Belum ada nomor yang diblokir</li>`}</ul>
        <div class="row"><input id="blkNum" placeholder="08123456789" inputmode="tel" aria-label="Nomor yang diblokir"><button class="btn danger" id="blkAdd">Blokir</button></div>
        <p class="muted" style="margin-top:10px">Pesan dari nomor ini diabaikan di chat pribadi maupun grup.</p></div>
      <div class="card"><h3>Grup</h3>
        <label class="chk"><span class="sw"><input type="checkbox" id="grpDef" ${a.defaultGroupEnabled ? "checked" : ""}><span></span></span>&nbsp;&nbsp;Bot aktif otomatis di grup baru</label>
        <button class="btn" id="grpRefresh">Muat daftar grup dari WhatsApp</button>
        <ul class="list" style="margin-top:12px">${groups.map(([jid, g]) => `<li><span>${esc(g.name || jid.split("@")[0])}</span><label class="sw"><input type="checkbox" aria-label="Bot aktif di ${esc(g.name || jid)}" data-grp="${esc(jid)}" ${g.enabled ? "checked" : ""}><span></span></label></li>`).join("") || `<li class="muted">Belum ada grup. Klik tombol di atas, atau tunggu ada pesan masuk dari grup.</li>`}</ul></div>
    </div>`;
  const v = $("#view");
  v.onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    act(async () => {
      if (b.id === "blkAdd") { await api("/access/block", "POST", { number: $("#blkNum").value }); await views.akses(); }
      else if (b.dataset.unblock) { await api("/access/block/" + b.dataset.unblock, "DELETE"); await views.akses(); }
      else if (b.id === "grpRefresh") { const r = await api("/access/groups/refresh", "POST", {}); toast(`${r.count} grup dimuat`); await views.akses(); }
    });
  };
  v.onchange = (e) => {
    const t = e.target;
    if (t.id === "grpDef") act(() => api("/access/default", "POST", { enabled: t.checked }));
    else if (t.dataset.grp) act(() => api("/access/group", "POST", { jid: t.dataset.grp, enabled: t.checked }));
  };
};

/* ───────── test command ───────── */
const chatLog = [];
views.test = async () => {
  $("#view").innerHTML = `<h2>Test command</h2><div class="card">
    <div id="chat" class="chat" aria-live="polite"></div>
    <form id="tForm" class="row">
      <input id="tText" placeholder="Contoh: menu, hariini, ai halo" autocomplete="off" aria-label="Command yang dites" required>
      <input id="tNum" class="narrow" placeholder="Sebagai nomor (opsional)" inputmode="tel" aria-label="Nomor pengirim">
      <button class="btn primary">Kirim</button></form>
    <p class="muted" style="margin:12px 0 0">Tanpa nomor, tes berjalan sebagai admin pertama. Balasan bot ditangkap di sini dan tidak dikirim ke WhatsApp.</p></div>`;
  const draw = () => {
    const c = $("#chat");
    c.innerHTML = chatLog.length ? chatLog.map((m) => `<div class="msg ${m.k}">${esc(m.t)}</div>`).join("") : `<span class="muted">Ketik command di bawah untuk mulai.</span>`;
    c.scrollTop = c.scrollHeight;
  };
  draw();
  $("#tForm").onsubmit = (e) => {
    e.preventDefault();
    const text = $("#tText").value.trim();
    if (!text) return;
    $("#tText").value = "";
    chatLog.push({ k: "me", t: text }); draw();
    act(async () => {
      try {
        const r = await api("/test", "POST", { text, number: $("#tNum").value });
        if (!r.out.length) chatLog.push({ k: "bot", t: "(bot tidak membalas)" });
        r.out.forEach((t) => chatLog.push({ k: "bot", t }));
      } catch (err) { chatLog.push({ k: "bad", t: err.message }); }
      if (current === "test") draw();
    });
  };
  $("#tText").focus();
};

/* ───────── log real-time ───────── */
const logBuf = [];
let logFilter = "all", logEs = null, logRaf = 0;
function addLogs(arr) {
  const have = new Set(logBuf.map((l) => l.id));
  arr.forEach((l) => { if (!have.has(l.id)) logBuf.push(l); });
  logBuf.sort((a, b) => a.id - b.id);
  while (logBuf.length > 500) logBuf.shift();
  if (current === "log" && !logRaf) logRaf = requestAnimationFrame(() => { logRaf = 0; drawLogs(); });
}
function startLogStream() {
  if (logEs) return;
  api("/logs").then(addLogs).catch(() => {});
  logEs = new EventSource("/api/logs/stream");
  logEs.onmessage = (e) => addLogs([JSON.parse(e.data)]);
}
function drawLogs() {
  const box = $("#logBox");
  if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const rows = logBuf.filter((l) => logFilter === "all" || l.type === logFilter);
  box.innerHTML = rows.length
    ? rows.map((l) => `<div class="ln ${esc(l.type)}"><time>${hhmmss(l.t)}</time><b>${esc(l.type)}</b><span>${l.from ? `<em>${esc(l.from)}</em> ` : ""}${esc(l.text)}</span></div>`).join("")
    : `<div class="ln"><span class="muted">Belum ada aktivitas untuk filter ini.</span></div>`;
  if (near) box.scrollTop = box.scrollHeight;
}
views.log = async () => {
  $("#view").innerHTML = `<h2>Log aktivitas</h2>
    <div class="seg" id="logSeg">${[["all", "Semua"], ["in", "Pesan masuk"], ["cmd", "Command"], ["err", "Error"], ["sys", "Sistem"]].map(([k, l]) => `<button data-f="${k}" class="${k === logFilter ? "on" : ""}">${l}</button>`).join("")}</div>
    <div id="logBox" class="logbox" role="log"></div>`;
  $("#logSeg").onclick = (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    logFilter = b.dataset.f;
    $$("#logSeg button").forEach((x) => x.classList.toggle("on", x === b));
    drawLogs();
    const box = $("#logBox"); box.scrollTop = box.scrollHeight;
  };
  drawLogs();
  const box = $("#logBox"); box.scrollTop = box.scrollHeight;
};

/* ───────── statistik ───────── */
function colChart(items, label, every = 1) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return `<div class="cols">${items.map((i, x) => `<div class="col" title="${esc(label(i))}: ${i.n}"><span class="v">${i.n || ""}</span><i data-h="${Math.round((i.n / max) * 120)}"></i><small>${x % every === 0 ? esc(label(i)) : ""}</small></div>`).join("")}</div>`;
}
views.statistik = async () => {
  const s = await api("/stats");
  const hours = s.hours.map((n, h) => ({ n, h }));
  const peak = hours.reduce((a, b) => (b.n > a.n ? b : a), hours[0]);
  const maxCmd = Math.max(1, ...s.cmds.map((c) => c[1]));
  $("#view").innerHTML = `<h2>Statistik penggunaan</h2>
    <div class="card"><h3>Hits harian (14 hari terakhir) &middot; total ${s.total}</h3>
      ${s.days.length ? colChart(s.days.map((d) => ({ n: d.n, d: d.d })), (i) => i.d.slice(8) + "/" + i.d.slice(5, 7), 2) : `<p class="muted">Belum ada data hits.</p>`}</div>
    <div class="grid2">
      <div class="card"><h3>Command terpopuler</h3>
        ${s.cmds.length ? s.cmds.map(([name, n]) => `<div class="hb"><span>${esc(name)}</span><div class="track"><i data-w="${Math.round((n / maxCmd) * 100)}"></i></div><b>${n}</b></div>`).join("") : `<p class="muted">Belum ada command tercatat. Pasang hub.recordCommand di router commands.js.</p>`}</div>
      <div class="card"><h3>Jam paling ramai (WIB)</h3>
        ${peak.n ? `<p class="muted">Puncak di jam ${String(peak.h).padStart(2, "0")}.00, sebanyak ${peak.n} command.</p>` : ""}
        ${colChart(hours, (i) => String(i.h), 3)}</div>
    </div>`;
  $$("[data-h]").forEach((el) => (el.style.height = el.dataset.h + "px"));
  $$("[data-w]").forEach((el) => (el.style.width = el.dataset.w + "%"));
};

/* ───────── backup & restore ───────── */
views.backup = async () => {
  $("#view").innerHTML = `<h2>Backup & restore</h2><div class="grid2">
    <div class="card"><h3>Unduh backup</h3>
      <p class="muted">Salinan lengkap database.json: tugas, catatan, pengumuman, subscriber, admin, dan semester.</p>
      <a class="btn primary" href="/api/backup" download>Unduh database.json</a></div>
    <div class="card"><h3>Restore dari file</h3>
      <p class="muted">Menimpa seluruh isi database.json. Salinan lama otomatis disimpan di folder bot dengan nama database.backup-(tanggal).json.</p>
      <label>File database.json<input type="file" id="rFile" accept="application/json,.json"></label>
      <button class="btn danger" id="rGo">Restore</button></div></div>`;
  $("#rGo").onclick = () => act(async () => {
    const f = $("#rFile").files[0];
    if (!f) throw new Error("Pilih file database.json dulu");
    let obj;
    try { obj = JSON.parse(await f.text()); } catch { throw new Error("File bukan JSON yang valid"); }
    if (!confirm("Timpa database sekarang dengan isi file ini?")) return;
    const r = await api("/restore", "POST", obj);
    toast(r.backup ? `Restore berhasil. Salinan lama: ${r.backup}` : "Restore berhasil");
    $("#rFile").value = "";
  });
};

/* ───────── login & boot ───────── */
function showLogin() {
  $("#app").classList.add("hidden");
  $("#login").classList.remove("hidden");
  if (logEs) { logEs.close(); logEs = null; }
  clearInterval(timer);
  $("#pw").focus();
}
function enter() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  buildNav();
  startLogStream();
  const t = location.hash.slice(1);
  show(TABS.some(([k]) => k === t) ? t : "status");
}
$("#nav").onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "logout") act(async () => { await api("/logout", "POST", {}); showLogin(); });
  else if (b.dataset.tab) show(b.dataset.tab);
};
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#loginErr").textContent = "";
  try { await api("/login", "POST", { password: $("#pw").value }); $("#pw").value = ""; enter(); }
  catch (err) { $("#loginErr").textContent = err.message; }
};
api("/me").then(enter).catch(showLogin);
