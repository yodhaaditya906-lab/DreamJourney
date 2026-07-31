import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { userId, username, fullName, domisili, dob, whatsapp, whatsappVerified } = data;

    if (!userId || !username) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (dob) {
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 17) {
        return new Response(JSON.stringify({ error: 'Pengguna harus berusia minimal 17 tahun.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Upsert data pengguna ke Supabase
    const { error } = await supabase
      .from('users')
      .upsert({ 
        id: userId, 
        username: username,
        full_name: fullName || null,
        domisili: domisili || null,
        dob: dob || null,
        whatsapp: whatsapp || null,
        whatsapp_verified: !!whatsappVerified,
      }, { onConflict: 'id' });

    if (error) {
      console.error('Supabase Upsert Error:', error);
      throw error;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error saving user to Supabase:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
