import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const auth = locals.auth();
    const userId = auth.userId;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { avatarUrl } = body;

    if (!avatarUrl) {
      return new Response(JSON.stringify({ error: 'URL foto profil tidak boleh kosong.' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update avatar_url & image_url di tabel users Supabase
    const { error } = await supabase
      .from('users')
      .update({ 
        avatar_url: avatarUrl,
        image_url: avatarUrl
      })
      .eq('id', userId);

    if (error) {
      console.warn("Supabase update avatar warning:", error.message);
      // Fallback: upsert jika baris belum ada
      await supabase.from('users').upsert({ 
        id: userId, 
        avatar_url: avatarUrl, 
        image_url: avatarUrl 
      });
    }

    return new Response(JSON.stringify({ success: true, avatarUrl }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating profile avatar:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
