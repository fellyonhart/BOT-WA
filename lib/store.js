'use strict';
const fs = require('fs');
const path = require('path');

const defaults = () => ({
  version: 1,
  semesterMode: 'auto', // auto = ikut kalender, manual = ikut pilihan admin
  semester: 'ganjil',
  admins: [], // admin tambahan yang ditambahkan lewat perintah "admin tambah"
  subscribers: {}, // chatId -> { pagi, malam, tugas, kelas, since }
  tugas: [],
  agenda: [],
  counters: { tugas: 1, agenda: 1 },
  sent: {}, // kunci pengingat yang sudah terkirim (anti dobel)
  lastTick: 0
});

// Penyimpanan JSON sederhana: debounce + tulis atomik (tmp -> rename)
class Store {
  constructor(file) {
    this.file = file;
    this.timer = null;
    this.state = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      const d = defaults();
      return { ...d, ...parsed, counters: { ...d.counters, ...(parsed.counters || {}) } };
    } catch (e) {
      if (e.code !== 'ENOENT') {
        // File rusak: simpan salinannya, mulai dari awal
        try { fs.renameSync(this.file, `${this.file}.corrupt-${Date.now()}`); } catch {}
        console.warn('⚠️  state.json rusak, dibuat ulang (salinan lama disimpan).');
      }
      return defaults();
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, defaults };
