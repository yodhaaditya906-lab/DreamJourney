import type { APIRoute } from 'astro';
import { verifyOTP } from '../../lib/otpStore';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { whatsappNumber, otpCode } = await request.json();

    if (!whatsappNumber || !otpCode) {
      return new Response(JSON.stringify({ error: 'Nomor WhatsApp dan Kode OTP wajib diisi' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isValid = verifyOTP(whatsappNumber, otpCode);

    if (isValid) {
      return new Response(JSON.stringify({
        success: true,
        message: 'Nomor WhatsApp berhasil diverifikasi!'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({
        error: 'Kode OTP tidak sesuai atau sudah kadaluwarsa. Silakan minta kode baru.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error: any) {
    console.error("Error verifying WA OTP:", error);
    return new Response(JSON.stringify({ error: 'Gagal memproses verifikasi OTP.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
