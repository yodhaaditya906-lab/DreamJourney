import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const { message } = await request.json();
        const query = (message || '').toLowerCase().trim();

        let reply = "";

        if (!query) {
            return new Response(JSON.stringify({ 
                reply: "Halo Kak! 👋 Saya DreamAI Assistant. Ada yang bisa saya bantu seputar liburan impianmu hari ini?" 
            }), { status: 200 });
        }

        // 1. Greetings & Salam
        if (/^(halo|hai|hi|pagi|siang|sore|malam|permisi|min|admin|bro|sis|tes|test)/i.test(query)) {
            reply = "Halo juga Kak! 👋 Selamat datang di DreamJourney. Ada yang bisa DreamAI bantu seputar rencana liburan atau cara menabung hari ini?";
        }
        // 2. Ucapan Terima Kasih & Penutup
        else if (/^(terima kasih|makasih|thanks|thx|ok|oke|siap|mantap|paham|baik)/i.test(query)) {
            reply = "Sama-sama Kak! 😊 Senang bisa membantu. Jika ada pertanyaan lain seputar destinasi atau tabungan, jangan ragu untuk bertanya ya!";
        }
        // 3. Cara Kerja & Fitur DreamJourney
        else if (query.includes('apa itu') || query.includes('cara kerja') || query.includes('gimana cara') || query.includes('sistem') || query.includes('aplikasi')) {
            reply = "✨ **Cara Kerja DreamJourney:**\n1. Pilih paket liburan impian Anda di menu **Cari Paket**.\n2. Atur target tabungan (harian, mingguan, bulanan, atau acak).\n3. Lakukan setoran via QRIS atau Mitra Tunai.\n4. Seluruh dana aman tersimpan di sistem **Escrow 100%** hingga siap berangkat! ✈️";
        }
        // 4. Setoran QRIS & Cashless
        else if (query.includes('qris') || query.includes('cashless') || query.includes('transfer') || query.includes('auto debit') || query.includes('autodebit')) {
            reply = "💳 **Setoran via QRIS (Cashless):**\nSetoran dilakukan secara manual melalui kode QRIS yang tersedia pada platform. Anda bisa scan menggunakan M-Banking (BCA, Mandiri, BRI, BNI) atau E-Wallet (GoPay, OVO, Dana, ShopeePay). Transaksi terverifikasi otomatis!";
        } 
        // 5. Setoran Tunai via Mitra
        else if (query.includes('mitra') || query.includes('cash') || query.includes('tunai') || query.includes('warung') || query.includes('loket')) {
            reply = "🏪 **Setoran Tunai via Mitra:**\nAnda cukup menyerahkan uang fisik ke Loket/Mitra Lentera terdaftar (masukkan ID Mitra seperti `2907261`). Mitra akan mengonfirmasi via portal `/mitra/setor` dan saldo Anda langsung bertambah!";
        }
        // 6. Kebijakan Pembatalan, Denda & Refund
        else if (query.includes('batal') || query.includes('cancel') || query.includes('denda') || query.includes('refund') || query.includes('potongan') || query.includes('pasal')) {
            reply = "📜 **Kebijakan Pembatalan & Refund (Pasal 5 & 6):**\n• **Non-High Season:** Batal sebelum H-14 = denda 10%. Batal H-14 s.d H-0 = denda 10% + denda riil pihak ke-3 (hotel/maskapai).\n• **High Season:** Batal sebelum H-30 = denda 10%. Batal H-30 s.d H-0 = denda 10% + denda riil pihak ke-3.\n• **Refund:** Diproses 7–14 hari kerja ke rekening/e-wallet Anda.";
        }
        // 7. Group Trip / Tabungan Kelompok
        else if (query.includes('grup') || query.includes('group') || query.includes('teman') || query.includes('anggota') || query.includes('bersama')) {
            reply = "👥 **Tabungan Kelompok (Group Trip):**\nAnda bisa mengajak teman menabung bersama dengan menambahkan username/email mereka saat setup tabungan. Setiap anggota akan menabung secara terpisah melalui akun masing-masing!";
        }
        // 8. Paket Wisata & Destinasi
        else if (query.includes('paket') || query.includes('destinasi') || query.includes('bali') || query.includes('bandung') || query.includes('jogja') || query.includes('labuan') || query.includes('wisata')) {
            reply = "🗺️ **Destinasi Liburan Impian:**\nDreamJourney memiliki paket wisata menarik mulai dari Bandung, Bali, Yogyakarta, Labuan Bajo, hingga Internasional. Rincian biaya transportasi, penginapan, dan wahana sudah terbreakdown transparan!";
        }
        // 9. Reksadana & Investasi
        else if (query.includes('reksadana') || query.includes('investasi') || query.includes('bunga') || query.includes('untung')) {
            reply = "📈 **Tipe Tabungan Investasi:**\nPilihan Investasi Reksadana saat ini sedang dalam pengkajian regulasi (*Segera Hadir*). Tabungan yang berjalan saat ini adalah tipe **Konvensional** yang 100% aman tersimpan di Escrow.";
        }
        // 10. Flexible Conversational Fallback
        else {
            reply = `Pertanyaan yang bagus Kak! 😊 Mengenai "${message}", DreamAI dapat membantu menjelaskan topik seputar **Cara Menabung**, **Setoran QRIS/Mitra**, **Group Trip**, **Kebijakan Refund**, atau **Paket Wisata**. Jika Kakak butuh bantuan khusus, klik tab **Admin WA** di atas ya!`;
        }

        return new Response(JSON.stringify({ reply }), { status: 200 });

    } catch (err: any) {
        return new Response(JSON.stringify({ 
            reply: "Maaf Kak, ada sedikit kendala jaringan pada AI. Kakak bisa berpindah ke tab 'Admin WA' di atas untuk mengobrol langsung dengan Customer Service kami ya!" 
        }), { status: 500 });
    }
};
