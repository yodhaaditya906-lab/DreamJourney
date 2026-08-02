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
    // 1. Periksa apakah username sudah ada di tabel users Supabase (case-insensitive)
    const { data, error } = await supabase
      .from('users')
      .select('id, username, full_name')
      .ilike('username', username)
      .maybeSingle();

    if (error) {
      throw error;
    }

    let avatarUrl: string | null = null;
    let fullName = data?.full_name || data?.username || null;

    // 2. Ambil foto profil asli user dari Clerk Backend API
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY;
    
    if (data && data.id && clerkSecretKey) {
      try {
        const clerkRes = await fetch(`https://api.clerk.com/v1/users/${data.id}`, {
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json'
          }
        });
        if (clerkRes.ok) {
          const clerkUserData = await clerkRes.json();
          avatarUrl = clerkUserData.image_url || clerkUserData.profile_image_url || null;
          if (!fullName || fullName === data.username) {
            const firstName = clerkUserData.first_name || '';
            const lastName = clerkUserData.last_name || '';
            const combinedName = `${firstName} ${lastName}`.trim();
            if (combinedName) fullName = combinedName;
          }
        }
      } catch (clerkErr) {
        console.warn("Could not fetch user avatar from Clerk API:", clerkErr);
      }
    }

    // Jika data ada, berarti username sudah dipakai (isAvailable = false) -> user ditemukan!
    const isAvailable = !data;

    return new Response(JSON.stringify({
      isAvailable,
      user: data ? {
        username: data.username,
        fullName: fullName || data.username,
        avatarUrl: avatarUrl
      } : null
    }), {
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
