import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const username = url.searchParams.get('username');

  if (!username) {
    return new Response(JSON.stringify({ error: 'Username is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Periksa apakah username sudah ada di tabel users
    const { data, error } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Jika data ada, berarti username sudah dipakai (isAvailable = false)
    const isAvailable = !data;

    return new Response(JSON.stringify({ isAvailable }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error checking username:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
