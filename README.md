# Bot WhatsApp PPLG X-3 (v2)

Bot kelas: jadwal, seragam, tugas, pengingat otomatis, dan beberapa fitur seru.
Dibuat dengan [Baileys](https://github.com/WhiskeySockets/Baileys).

## Jalankan

```bash
npm install
cp .env.example .env     # isi BOT_ADMINS (nomor kamu)
npm start
```

Scan QR yang muncul di terminal (atau buka `qr.png`) lewat WhatsApp → Perangkat tertaut.
Kalau QR sulit, isi `PAIR_NUMBER` di `.env` untuk login pakai pairing code.

Menu WhatsApp memakai tombol/list native-flow secara default. Jika WhatsApp tidak menampilkannya,
ubah `INTERACTIVE_MENU=off` di `.env` untuk kembali ke menu teks.

Tes otomatis: `npm test`

## Perintah

Di chat pribadi cukup ketik perintahnya. Di **grup**, awali dengan `.` `!` atau `/` (mis. `.menu`).

| Kategori | Perintah |
|---|---|
| Jadwal | `sekarang` · `next` · `hariini` · `besok` · `seminggu` · `jadwal senin` (+ `ganjil`/`genap`) |
| Cari | `cari mtk` · `cari endang` · `cari 223` · `guru` |
| Seragam | `seragam` · `seragam besok` · `seragam minggu` |
| Tugas | `tugas` · `tugas semua` · `tugas detail 3` |
| Tugas (admin) | `tugas tambah MTK \| Bab 3 hal 20 \| jumat` · `tugas selesai 3` · `tugas hapus 3` · `tugas bersih` |
| Agenda | `agenda` · `agenda tambah Ulangan MTK \| 15/10 \| Bab 1-3` (admin) |
| Pengingat | `langganan on` · `langganan kelas on` · `langganan pagi off` · `langganan status` · `langganan off` |
| Seru | `acak a, b, c` · `acak 1-36` · `kelompok 4 \| nama1, nama2, ...` · `koin` · `dadu` · `quote` |
| Admin | `semester ganjil/genap/auto` · `pengumuman <teks>` |
| Info | `menu` · `ping` · `id` · `tentang` |

Angka lama (1–8) masih berfungsi di chat pribadi. Salah ketik? Bot menyarankan perintah yang mirip.

Deadline bisa ditulis: `besok`, `lusa`, `senin`–`jumat`, `25/10`, `25 okt`, `+3`.

## Pengingat otomatis

Aktifkan per chat (grup: admin) dengan `langganan on`:

- ☀️ **05:45 Senin–Jumat**: seragam, jadwal hari ini, tugas yang dekat deadline, quote
- 🌙 **20:00 Minggu–Kamis**: persiapan besok
- ⏰ **opsional** `langganan kelas on`: ping 10 menit sebelum tiap pelajaran

Jam bisa diubah di `config.js` (`reminders`).

## Yang berubah dari versi lama

- Semester **otomatis** mengikuti kalender (Jul–Des ganjil, Jan–Jun genap); admin bisa mengunci manual. Pilihan tersimpan, tidak reset saat bot restart.
- Perintah admin dibatasi lewat `BOT_ADMINS` (sebelumnya siapa pun bisa ganti semester).
- Di grup, bot tidak lagi membalas semua pesan "perintah tidak dikenali".
- Pesan ephemeral/caption terbaca; backlog saat reconnect diabaikan; semua pesan dalam satu batch diproses (dulu hanya yang pertama).
- Reconnect dengan backoff; tidak loop saat sesi digantikan (440); bisa login pairing code.
- Jadwal ditampilkan ringkas (JP berurutan digabung) dan akhir pekan menampilkan "libur", bukan "tidak ditemukan".

## Struktur

```
index.js            koneksi WhatsApp, penerima pesan, scheduler
config.js           pengaturan (+ loader .env)
data-jadwal.js      data jadwal & seragam (edit di sini)
lib/commands.js     router & semua perintah
lib/jadwal.js       mesin jadwal (sekarang/next/cari/format)
lib/agenda.js       tugas & agenda
lib/reminders.js    pengingat otomatis
lib/store.js        penyimpanan data/state.json
lib/time.js         waktu WIB & parser tanggal
test/               tes otomatis
```

MADE from feyy
