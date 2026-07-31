# 🚀 Panduan Lengkap Push Kode ke GitHub & Auto-Deploy Vercel

Panduan ini berisi langkah-langkah untuk menghubungkan project **DreamJourney** dari laptop ini ke **GitHub**, lalu otomatis meng-update website di **Vercel**.

---

## 📌 Status Persiapan (Sudah Di-set)
- [x] Git sudah ter-install (`git version 2.55.0`)
- [x] Repository local sudah di-inisialisasi (`git init`)
- [x] Branch utama diatur ke `main` (`git branch -M main`)
- [x] File `.env` & `node_modules` sudah teramankan di `.gitignore`

---

## 🛠️ Langkah-Langkah Lengkap

### Langkah 1: Atur Identitas Git (Hanya Perlu Sekali)
Buka terminal dan jalankan 2 perintah ini dengan memasukkan Nama dan Email akun GitHub Anda:

```powershell
git config --global user.name "Nama GitHub Anda"
git config --global user.email "email@anda.com"
```

---

### Langkah 2: Simpan Perubahan Kode (Commit)
Jalankan perintah ini untuk menyimpan kondisi project saat ini:

```powershell
git add .
git commit -m "Initial commit - DreamJourney"
```

---

### Langkah 3: Hubungkan ke Repository GitHub
1. Buka [GitHub New Repository](https://github.com/new).
2. Isi nama repository (misal: `DreamJourney`), lalu klik **Create repository**.
3. Salin/copy URL repository GitHub Anda (contoh: `https://github.com/username/DreamJourney.git`).
4. Jalankan perintah ini di terminal:

```powershell
git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO.git
```

---

### Langkah 4: Push Kode ke GitHub
Jalankan perintah berikut untuk mengunggah kode pertama kali:

```powershell
git push -u origin main
```
*Catatan: Jika ada jendela login GitHub yang muncul, silakan izinkan (Authorize).*

---

### Langkah 5: Hubungkan ke Vercel (Auto-Update Website)
1. Buka [Vercel Dashboard](https://vercel.com/dashboard).
2. Klik **Add New...** -> **Project**.
3. Pilih repository `DreamJourney` dari daftar GitHub Anda.
4. Pada bagian **Environment Variables**, tambahkan isi file `.env` Anda (seperti `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, dll).
5. Klik **Deploy**.

---

## 🔄 Rutinitas Update Selanjutnya (Harian)
Setelah langkah-langkah di atas selesai, setiap kali Anda mengedit kode di laptop ini dan ingin websitenya ter-update otomatis di Vercel, cukup jalankan **3 langkah** ini di terminal:

```powershell
git add .
git commit -m "Update fitur atau perbaikan kode"
git push
```
⚡ **Vercel akan otomatis mendeteksi `git push` dan meng-update website secara publik dalam 1-2 menit!**
