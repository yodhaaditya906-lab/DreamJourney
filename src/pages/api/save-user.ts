import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { userId, username, domisili, dob } = data;

    if (!userId || !username) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Upsert data pengguna ke Supabase
    // Catatan: Pastikan kolom username, domisili, dan dob sudah dibuat di Supabase
    const { error } = await supabase
      .from('users')
      .upsert({ 
        id: userId, 
        username: username,
        // domisili dan dob opsional jika ingin disimpan di Supabase juga
        // Jika belum ada kolomnya di database, Anda bisa menghapusnya dari sini 
        // atau menyimpannya di JSONB. Sementara kita hanya fokus username yang wajib.
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
