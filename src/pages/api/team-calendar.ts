import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async (context) => {
    try {
        const auth = context.locals.auth();
        const userId = auth.userId;
        
        if (!userId) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const url = new URL(context.request.url);
        const username = (url.searchParams.get('username') || '').toLowerCase();
        const teamId = url.searchParams.get('teamId') || '';

        // 1. Fetch Teams
        const { data: teamsData, error: teamsError } = await supabase
            .from('teams')
            .select('*')
            .order('created_at', { ascending: false });

        // 2. Fetch Events
        const { data: eventsData, error: eventsError } = await supabase
            .from('team_events')
            .select('*')
            .order('event_date', { ascending: true });

        // 3. Fetch Notifications for current user
        let notifsData: any[] = [];
        if (username) {
            const { data: nData, error: nError } = await supabase
                .from('team_notifications')
                .select('*')
                .eq('recipient_username', username)
                .order('created_at', { ascending: false });

            if (!nError && nData) {
                notifsData = nData;
            }
        }

        if (teamsError || eventsError) {
            console.warn("Supabase query notice:", teamsError?.message || eventsError?.message);
        }

        return new Response(JSON.stringify({ 
            teams: teamsData || [], 
            events: eventsData || [],
            notifications: notifsData || []
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        console.error("GET team-calendar error:", err);
        return new Response(JSON.stringify({ teams: [], events: [], notifications: [], error: err.message }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};

export const POST: APIRoute = async (context) => {
    try {
        const auth = context.locals.auth();
        const userId = auth.userId;
        
        if (!userId) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const body = await context.request.json();
        const action = body.action || 'ADD_EVENT';

        // --- ACTION: CREATE_TEAM ---
        if (action === 'CREATE_TEAM') {
            const { name, category, members, owner_username, owner_user_obj } = body;

            // Enforce profile verification on server side
            const { data: dbUser } = await supabase.from('users').select('username').eq('id', userId).maybeSingle();
            if (!dbUser || !dbUser.username) {
                return new Response(JSON.stringify({ error: 'Anda harus memverifikasi profil terlebih dahulu sebelum membuat tim.' }), { status: 403 });
            }

            if (!name) {
                return new Response(JSON.stringify({ error: 'Nama tim harus diisi.' }), { status: 400 });
            }

            const teamId = 'team_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
            const ownerObj = owner_user_obj || { username: owner_username, fullName: owner_username, avatarUrl: '' };

            const newTeam = {
                id: teamId,
                user_id: userId,
                owner_username: owner_username || 'user',
                name: name.trim(),
                category: category || 'Lainnya',
                members: [ownerObj],
                created_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from('teams')
                .insert(newTeam)
                .select()
                .single();

            if (error) {
                console.warn("Insert teams warning:", error.message);
            }

            const invitedMembers = (members || []).filter((m: any) => m.username.toLowerCase() !== owner_username.toLowerCase());
            const createdNotifs: any[] = [];

            if (invitedMembers.length > 0) {
                for (const m of invitedMembers) {
                    const notifObj = {
                        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        recipient_username: m.username.toLowerCase(),
                        sender_username: owner_username.toLowerCase(),
                        sender_fullname: ownerObj.fullName || owner_username,
                        type: 'TEAM_INVITE',
                        team_id: teamId,
                        team_name: name,
                        team_category: category || 'Lainnya',
                        title: `Undangan Tim: ${name}`,
                        message: `@${owner_username} mengundang Anda bergabung ke tim "${name}" (${category}).`,
                        status: 'PENDING',
                        created_at: new Date().toISOString()
                    };
                    createdNotifs.push(notifObj);
                }

                await supabase.from('team_notifications').insert(createdNotifs);
            }

            return new Response(JSON.stringify({ success: true, team: data || newTeam, notifications: createdNotifs }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: SEND_INVITE_NOTIF ---
        if (action === 'SEND_INVITE_NOTIF') {
            const { recipient_username, sender_username, sender_fullname, team_id, team_name, team_category } = body;
            if (!recipient_username || !team_id) {
                return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
            }

            const notif = {
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                recipient_username: recipient_username.toLowerCase(),
                sender_username: sender_username.toLowerCase(),
                sender_fullname: sender_fullname || sender_username,
                type: 'TEAM_INVITE',
                team_id: team_id,
                team_name: team_name || 'Tim Liburan',
                team_category: team_category || 'Lainnya',
                title: `Undangan Tim: ${team_name}`,
                message: `@${sender_username} mengundang Anda bergabung ke tim "${team_name}".`,
                status: 'PENDING',
                created_at: new Date().toISOString()
            };

            await supabase.from('team_notifications').insert(notif);

            return new Response(JSON.stringify({ success: true, notification: notif }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: PROCESS_TEAM_INVITATION ---
        if (action === 'PROCESS_TEAM_INVITATION') {
            const { notifId, teamId, accept, username, userObj } = body;

            if (!notifId || !teamId) {
                return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
            }

            if (accept) {
                await supabase.from('team_notifications').update({ status: 'ACCEPTED' }).eq('id', notifId);

                const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).single();
                if (teamData) {
                    const currentMembers = teamData.members || [];
                    if (!currentMembers.some((m: any) => m.username.toLowerCase() === username.toLowerCase())) {
                        currentMembers.push(userObj || { username, fullName: username, avatarUrl: '' });
                        await supabase.from('teams').update({ members: currentMembers }).eq('id', teamId);
                    }
                }
            } else {
                await supabase.from('team_notifications').update({ status: 'REJECTED' }).eq('id', notifId);
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: NOTIFY_REMOVED ---
        if (action === 'NOTIFY_REMOVED') {
            const { recipient_username, sender_username, team_name } = body;
            const notif = {
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                recipient_username: recipient_username.toLowerCase(),
                sender_username: sender_username.toLowerCase(),
                type: 'REMOVED_FROM_TEAM',
                team_name: team_name || 'Tim Liburan',
                title: `Status Keanggotaan Tim: ${team_name}`,
                message: `@${sender_username} telah mengeluarkan Anda dari tim "${team_name}".`,
                status: 'UNREAD',
                created_at: new Date().toISOString()
            };

            await supabase.from('team_notifications').insert(notif);

            return new Response(JSON.stringify({ success: true, notification: notif }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: MARK_NOTIF_READ ---
        if (action === 'MARK_NOTIF_READ') {
            const { username } = body;
            if (username) {
                const u = username.toLowerCase();
                await supabase
                    .from('team_notifications')
                    .update({ status: 'READ' })
                    .eq('recipient_username', u)
                    .in('status', ['UNREAD', 'PENDING']);
            }
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: DELETE_TEAM ---
        if (action === 'DELETE_TEAM') {
            const { teamId } = body;
            if (!teamId) {
                return new Response(JSON.stringify({ error: 'Missing teamId' }), { status: 400 });
            }

            await supabase.from('teams').delete().eq('id', teamId);
            await supabase.from('team_events').delete().eq('team_id', teamId);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: UPDATE_MEMBERS ---
        if (action === 'UPDATE_MEMBERS') {
            const { teamId, members } = body;
            if (!teamId || !members) {
                return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
            }

            await supabase.from('teams').update({ members }).eq('id', teamId);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: DELETE_EVENT ---
        if (action === 'DELETE_EVENT') {
            const { eventId, username, teamOwnerUsername } = body;
            if (!eventId) {
                return new Response(JSON.stringify({ error: 'Missing eventId' }), { status: 400 });
            }

            const { data: existingEvt } = await supabase.from('team_events').select('*').eq('id', eventId).maybeSingle();
            if (existingEvt) {
                const ownerUname = (existingEvt.member_username || existingEvt.owner_username || '').toLowerCase();
                const isCreator = username && ownerUname && ownerUname === username.toLowerCase();
                const isTeamOwner = teamOwnerUsername && username && teamOwnerUsername.toLowerCase() === username.toLowerCase();

                if (!isCreator && !isTeamOwner && !existingEvt.is_group_event) {
                    return new Response(JSON.stringify({ error: 'Anda tidak memiliki hak untuk menghapus jadwal ini.' }), { status: 403 });
                }
            }

            await supabase.from('team_events').delete().eq('id', eventId);

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: ADD_EVENT / ADD_GROUP_EVENT ---
        const {
            team_id,
            title,
            event_date,
            start_time,
            end_time,
            owner_username,
            description,
            is_group_event,
            group_category
        } = body;

        if (!title || !event_date || !start_time || !end_time || !team_id) {
            return new Response(JSON.stringify({ error: 'Lengkapi judul, tanggal, jam mulai, dan jam selesai.' }), { status: 400 });
        }

        const myUsername = (owner_username || 'user').toLowerCase();

        const newEvent = {
            id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            team_id: team_id,
            user_id: userId,
            owner_username: myUsername,
            member_username: is_group_event ? 'ALL' : myUsername,
            title: title.trim(),
            event_date: event_date,
            start_time: start_time,
            end_time: end_time,
            description: description || '',
            is_group_event: !!is_group_event,
            group_category: group_category || 'Diskusi',
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('team_events')
            .insert(newEvent)
            .select()
            .single();

        if (error) {
            console.warn("Insert team_events warning:", error.message);
        }

        return new Response(JSON.stringify({ success: true, event: data || newEvent }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err: any) {
        console.error("POST team-calendar error:", err);
        return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
