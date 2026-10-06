// ============================================
// DATA JADWAL PPLG X-3
// SMK Wikrama • T.A. 2026-2027
// ============================================

const jadwalSeragam = {
  Senin: "Seragam Jas abu",
  Selasa: "Seragam Pramuka (Coklat)",
  Rabu: "Seragam Putih hijau",
  Kamis: "Seragam Jas abu",
  Jumat: "Muslim/jas abu(non islam)",
  Sabtu: "Libur",
  Minggu: "Libur"
};

const jadwalPPLG3 = {
  // ========== SEMESTER GANJIL ==========
  ganjil: {
    Senin: [
      { jam: "06.50-07.15", mapel: "Ibadah Pagi" },
      { jam: "07.15-08.15", mapel: "Upacara" },
      { jam: "08.15-08.55", mapel: "B. Inggris", guru: "Endang", ruang: "223" },
      { jam: "08.55-09.35", mapel: "B. Inggris", guru: "Endang", ruang: "223" },
      { jam: "09.35-09.55", mapel: "Istirahat" },
      { jam: "09.55-10.35", mapel: "PP", guru: "Nadya", ruang: "220" },
      { jam: "10.35-11.15", mapel: "PP", guru: "Nadya", ruang: "220" },
      { jam: "11.15-11.55", mapel: "B. Sunda", guru: "Ridwan", ruang: "219" },
      { jam: "11.55-12.35", mapel: "Istirahat" },
      { jam: "12.35-13.15", mapel: "B. Sunda", guru: "Ridwan", ruang: "219" },
      { jam: "13.15-13.55", mapel: "PABP", guru: "Hapid", ruang: "130" },
      { jam: "13.55-14.35", mapel: "PABP", guru: "Hapid", ruang: "130" },
      { jam: "14.35-15.15", mapel: "B. Indo", guru: "Lia", ruang: "222" },
      { jam: "15.15-15.55", mapel: "B. Indo", guru: "Lia", ruang: "222" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Selasa: [
      { jam: "06.50-07.15", mapel: "Ibadah Pagi" },
      { jam: "07.15-07.30", mapel: "Tausyiah" },
      { jam: "07.30-08.10", mapel: "Sejarah", guru: "Yessy", ruang: "402" },
      { jam: "08.10-08.50", mapel: "Sejarah", guru: "Yessy", ruang: "402" },
      { jam: "08.50-09.30", mapel: "B. Indo", guru: "Lia", ruang: "222" },
      { jam: "09.30-10.10", mapel: "B. Indo", guru: "Lia", ruang: "222" },
      { jam: "10.10-10.30", mapel: "Istirahat" },
      { jam: "10.30-11.10", mapel: "PABP", guru: "Hapid", ruang: "130" },
      { jam: "11.10-11.50", mapel: "PABP", guru: "Hapid", ruang: "130" },
      { jam: "11.50-12.30", mapel: "Istirahat" },
      { jam: "12.30-13.10", mapel: "MTK", guru: "Dede H", ruang: "318" },
      { jam: "13.10-13.50", mapel: "MTK", guru: "Dede H", ruang: "318" },
      { jam: "13.50-14.30", mapel: "B. Indo", guru: "Lia", ruang: "210" },
      { jam: "14.30-15.10", mapel: "B. Indo", guru: "Lia", ruang: "210" },
      { jam: "15.10-15.55", mapel: "Self Upgrading" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Rabu: [
      { jam: "06.50-07.15", mapel: "Ibadah Pagi" },
      { jam: "07.15-07.30", mapel: "Tausyiah" },
      {
        jam: "07.30-08.10",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      {
        jam: "08.10-08.50",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      {
        jam: "08.50-09.30",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      {
        jam: "09.30-10.10",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      { jam: "10.10-10.30", mapel: "Istirahat" },
      {
        jam: "10.30-11.10",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      {
        jam: "11.10-11.50",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      { jam: "11.50-12.30", mapel: "Istirahat" },
      {
        jam: "12.30-13.10",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      {
        jam: "13.10-13.50",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      {
        jam: "13.50-14.30",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      {
        jam: "14.30-15.10",
        mapel: "Kokurikuler",
        guru: "Nurdin",
        ruang: "310"
      },
      { jam: "15.10-15.55", mapel: "Self Upgrading" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Kamis: [
      { jam: "06.50-07.20", mapel: "Ibadah Pagi" },
      { jam: "07.20-08.10", mapel: "Pendidikan Karakter" },
      { jam: "08.10-08.50", mapel: "MTK", guru: "Dede H", ruang: "318" },
      { jam: "08.50-09.30", mapel: "MTK", guru: "Dede H", ruang: "318" },
      { jam: "09.30-10.10", mapel: "PP", guru: "Nadya", ruang: "224" },
      { jam: "10.10-10.30", mapel: "Istirahat" },
      { jam: "10.30-11.10", mapel: "PP", guru: "Nadya", ruang: "224" },
      { jam: "11.10-11.50", mapel: "B. Inggris", guru: "Endang", ruang: "223" },
      { jam: "11.50-12.30", mapel: "Istirahat" },
      { jam: "12.30-13.10", mapel: "B. Inggris", guru: "Endang", ruang: "223" },
      { jam: "13.10-13.50", mapel: "B. Sunda", guru: "Ridwan", ruang: "219" },
      { jam: "13.50-14.30", mapel: "B. Sunda", guru: "Ridwan", ruang: "219" },
      { jam: "14.30-15.10", mapel: "Sejarah", guru: "Yessy", ruang: "402" },
      { jam: "15.10-15.50", mapel: "Sejarah", guru: "Yessy", ruang: "402" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Jumat: [
      { jam: "06.50-07.20", mapel: "Ibadah Pagi" },
      { jam: "07.20-08.00", mapel: "Pendidikan Karakter" },
      { jam: "08.00-08.40", mapel: "B. Inggris", guru: "Endang", ruang: "223" },
      { jam: "08.40-09.20", mapel: "B. Inggris", guru: "Endang", ruang: "223" },
      { jam: "09.20-10.00", mapel: "KKA", guru: "JM", ruang: "206" },
      { jam: "10.00-10.40", mapel: "KKA", guru: "JM", ruang: "206" },
      { jam: "10.40-11.20", mapel: "KKA", guru: "JM", ruang: "206" },
      { jam: "11.20-13.00", mapel: "Istirahat" },
      { jam: "13.00-13.40", mapel: "KKA", guru: "JM", ruang: "206" },
      { jam: "13.40-14.20", mapel: "MTK", guru: "Dede H", ruang: "318" },
      { jam: "14.20-15.00", mapel: "MTK", guru: "Dede H", ruang: "318" },
      { jam: "15.00-16.00", mapel: "Kumpul Rayon" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ]
  },

  // ========== SEMESTER GENAP ==========
  genap: {
    Senin: [
      { jam: "06.50-07.15", mapel: "Ibadah Pagi" },
      { jam: "07.15-08.15", mapel: "Upacara" },
      {
        jam: "08.15-08.55",
        mapel: "Informatika",
        guru: "Nurdin",
        ruang: "320"
      },
      {
        jam: "08.55-09.35",
        mapel: "Informatika",
        guru: "Nurdin",
        ruang: "320"
      },
      { jam: "09.35-09.55", mapel: "Istirahat" },
      {
        jam: "09.55-10.35",
        mapel: "Informatika",
        guru: "Nurdin",
        ruang: "320"
      },
      {
        jam: "10.35-11.15",
        mapel: "Informatika",
        guru: "Nurdin",
        ruang: "320"
      },
      { jam: "11.15-11.55", mapel: "P. IPAS", guru: "Nurul", ruang: "125" },
      { jam: "11.55-12.35", mapel: "Istirahat" },
      { jam: "12.35-13.15", mapel: "P. IPAS", guru: "Nurul", ruang: "125" },
      { jam: "13.15-13.55", mapel: "P. IPAS", guru: "Nurul", ruang: "125" },
      { jam: "13.55-14.35", mapel: "P. IPAS", guru: "Nurul", ruang: "125" },
      { jam: "14.35-15.15", mapel: "P. IPAS", guru: "Nurul", ruang: "125" },
      { jam: "15.15-15.55", mapel: "P. IPAS", guru: "Nurul", ruang: "125" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Selasa: [
      { jam: "06.50-07.15", mapel: "Ibadah Pagi" },
      { jam: "07.15-07.30", mapel: "Tausyiah" },
      { jam: "07.30-08.10", mapel: "PJOK", guru: "Sandy", ruang: "Lap" },
      { jam: "08.10-08.50", mapel: "PJOK", guru: "Sandy", ruang: "Lap" },
      { jam: "08.50-09.30", mapel: "PJOK", guru: "Sandy", ruang: "Lap" },
      { jam: "09.30-10.10", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "10.10-10.30", mapel: "Istirahat" },
      { jam: "10.30-11.10", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "11.10-11.50", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "11.50-12.30", mapel: "Istirahat" },
      { jam: "12.30-13.10", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "13.10-13.50", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "13.50-14.30", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "14.30-15.10", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "15.10-15.55", mapel: "Self Upgrading" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Rabu: [
      { jam: "06.50-07.15", mapel: "Ibadah Pagi" },
      { jam: "07.15-07.30", mapel: "Tausyiah" },
      { jam: "07.30-08.10", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "08.10-08.50", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "08.50-09.30", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "09.30-10.10", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "10.10-10.30", mapel: "Istirahat" },
      { jam: "10.30-11.10", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "11.10-11.50", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "11.50-12.30", mapel: "Istirahat" },
      { jam: "12.30-13.10", mapel: "P. IPAS", guru: "Nurul", ruang: "207" },
      { jam: "13.10-13.50", mapel: "P. IPAS", guru: "Nurul", ruang: "207" },
      { jam: "13.50-14.30", mapel: "P. IPAS", guru: "Nurul", ruang: "207" },
      { jam: "14.30-15.10", mapel: "P. IPAS", guru: "Nurul", ruang: "207" },
      { jam: "15.10-15.55", mapel: "Self Upgrading" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Kamis: [
      { jam: "06.50-07.20", mapel: "Ibadah Pagi" },
      { jam: "07.20-08.10", mapel: "Pendidikan Karakter" },
      { jam: "08.10-08.50", mapel: "PJOK", guru: "Sandy", ruang: "Lap" },
      { jam: "08.50-09.30", mapel: "PJOK", guru: "Sandy", ruang: "Lap" },
      { jam: "09.30-10.10", mapel: "PJOK", guru: "Sandy", ruang: "Lap" },
      { jam: "10.10-10.30", mapel: "Istirahat" },
      { jam: "10.30-11.10", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "11.10-11.50", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "11.50-12.30", mapel: "Istirahat" },
      { jam: "12.30-13.10", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "13.10-13.50", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "13.50-14.30", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "14.30-15.10", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "15.10-15.50", mapel: "PROD (Produktif)", ruang: "203" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ],
    Jumat: [
      { jam: "06.50-07.20", mapel: "Ibadah Pagi" },
      { jam: "07.20-08.00", mapel: "Pendidikan Karakter" },
      { jam: "08.00-08.40", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "08.40-09.20", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "09.20-10.00", mapel: "PROD (Produktif)", ruang: "207" },
      {
        jam: "10.00-10.40",
        mapel: "Informatika",
        guru: "Nurdin",
        ruang: "320"
      },
      {
        jam: "10.40-11.20",
        mapel: "Informatika",
        guru: "Nurdin",
        ruang: "320"
      },
      { jam: "11.20-13.00", mapel: "Istirahat" },
      { jam: "13.00-13.40", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "13.40-14.20", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "14.20-15.00", mapel: "PROD (Produktif)", ruang: "207" },
      { jam: "15.00-16.00", mapel: "Kumpul Rayon" },
      { jam: "16.00-17.30", mapel: "Ekstrakurikuler" }
    ]
  }
};

module.exports = { jadwalSeragam, jadwalPPLG3 };
