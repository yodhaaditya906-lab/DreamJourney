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

    // Cek apakah ada konfigurasi WhatsApp Gateway (misal Fonnte / Wablas) di environment variable
    const FONNTE_TOKEN = import.meta.env.FONNTE_TOKEN;
    let sentRealMsg = false;

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
        if (fonnteRes.status) {
          sentRealMsg = true;
        } else {
          console.warn("Fonnte API response false:", fonnteRes);
        }
      } catch (err) {
        console.warn("Gagal mengirim via Fonnte WA Gateway, beralih ke simulasi:", err);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: sentRealMsg 
        ? 'Kode OTP telah dikirimkan ke nomor WhatsApp Anda.' 
        : 'Kode OTP simulasi telah dibuat (Mode Simulasi).',
      simulatedOtp: sentRealMsg ? undefined : otpCode, // Sertakan OTP simulasi jika gateway belum dikonfigurasi
      isSimulated: !sentRealMsg
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
