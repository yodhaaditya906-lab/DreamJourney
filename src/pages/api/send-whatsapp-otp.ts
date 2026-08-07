import type { APIRoute } from 'astro';
import { generateOTP } from '../../lib/otpStore';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { whatsappNumber } = await request.json();

    if (!whatsappNumber || typeof whatsappNumber !== 'string') {
      return new Response(JSON.stringify({ error: 'Nomor WhatsApp wajib diisi' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanPhone = whatsappNumber.replace(/\D/g, '');
    if (cleanPhone.length < 9 || cleanPhone.length > 15) {
      return new Response(JSON.stringify({ error: 'Format nomor WhatsApp tidak valid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const otpCode = generateOTP(whatsappNumber);

    const FONNTE_TOKEN = (process.env.FONNTE_TOKEN || import.meta.env.FONNTE_TOKEN || 'zRESTdPQrKVtTQ7YzPc9').trim();
    let sentRealMsg = false;
    let errorMessage = '';

    let targetPhone = cleanPhone;
    if (targetPhone.startsWith('0')) {
      targetPhone = '62' + targetPhone.slice(1);
    }

    if (FONNTE_TOKEN) {
      try {
        const formData = new FormData();
        formData.append('target', targetPhone);
        formData.append('message', `[DreamJourney] Kode OTP verifikasi WhatsApp Anda adalah: ${otpCode}. Berlaku selama 5 menit. JANGAN BERIKAN KODE INI KEPADA SIAPAPUN.`);

        const res = await fetch('https://api.fonnte.com/send', {
          method: 'POST',
          headers: {
            'Authorization': FONNTE_TOKEN,
          },
          body: formData,
        });
        const fonnteRes = await res.json();
        console.log("Fonnte API Response:", fonnteRes);

        if (fonnteRes && (fonnteRes.status === true || fonnteRes.status === "true")) {
          sentRealMsg = true;
        } else {
          console.warn("Fonnte API error response:", fonnteRes);
          errorMessage = fonnteRes?.detail || fonnteRes?.reason || 'Respon Fonnte gagal';
        }
      } catch (err: any) {
        console.error("Gagal mengirim via Fonnte WA Gateway:", err);
        errorMessage = err.message || 'Gagal terhubung ke Fonnte';
      }
    } else {
      errorMessage = "FONNTE_TOKEN tidak ditemukan";
    }

    if (!sentRealMsg) {
      return new Response(JSON.stringify({
        success: false,
        error: `Gagal mengirim OTP via Fonnte: ${errorMessage}. Pastikan nomor WhatsApp aktif.`
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Kode OTP asli telah dikirimkan ke nomor WhatsApp Anda via Fonnte.',
      isSimulated: false
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("Error sending WA OTP:", error);
    return new Response(JSON.stringify({ error: 'Gagal mengirim OTP. Silakan coba lagi.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
