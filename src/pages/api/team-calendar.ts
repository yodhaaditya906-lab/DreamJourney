// Helper to collect all relevant recipient usernames for a team
async function getTeamRecipients(teamId: string, senderUsername: string): Promise<{ recipients: string[]; teamName: string }> {
    const recipients = new Set<string>();
    const senderLower = (senderUsername || '').toLowerCase();
    let teamName = 'Tim Liburan';

    if (teamId) {
        const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle();
        if (teamData) {
            if (teamData.name) teamName = teamData.name;
            if (teamData.owner_username) {
                recipients.add(teamData.owner_username.toLowerCase());
            }
            if (Array.isArray(teamData.members)) {
                teamData.members.forEach((m: any) => {
                    const uname = (typeof m === 'string' ? m : (m.username || m.user_id || '')).toLowerCase();
                    if (uname) recipients.add(uname);
                });
            }
        }

        const { data: notifData } = await supabase
            .from('team_notifications')
            .select('recipient_username')
            .eq('team_id', teamId);
        
        if (notifData) {
            notifData.forEach((n: any) => {
                if (n.recipient_username) recipients.add(n.recipient_username.toLowerCase());
            });
        }
    }

    recipients.delete(senderLower);
    return { recipients: Array.from(recipients), teamName };
}

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

        // Enrich teams members with latest profile details (avatar_url / image_url / full_name) from users table
        if (teamsData && teamsData.length > 0) {
            const allUsernames = new Set<string>();
            teamsData.forEach((t: any) => {
                if (t.owner_username) allUsernames.add(t.owner_username.toLowerCase());
                if (Array.isArray(t.members)) {
                    t.members.forEach((m: any) => {
                        const uname = (typeof m === 'string' ? m : (m.username || m.user_id || '')).toLowerCase();
                        if (uname) allUsernames.add(uname);
                    });
                }
            });

            if (allUsernames.size > 0) {
                const { data: dbUsers } = await supabase
                    .from('users')
                    .select('username, full_name, avatar_url, image_url')
                    .in('username', Array.from(allUsernames));
                
                if (dbUsers) {
                    const userMap = new Map();
                    dbUsers.forEach((u: any) => {
                        if (u.username) {
                            userMap.set(u.username.toLowerCase(), {
                                fullName: u.full_name || u.username,
                                avatarUrl: u.avatar_url || u.image_url || ''
                            });
                        }
                    });

                    teamsData.forEach((t: any) => {
                        if (Array.isArray(t.members)) {
                            t.members = t.members.map((m: any) => {
                                const uname = (typeof m === 'string' ? m : (m.username || '')).toLowerCase();
                                const freshUser = userMap.get(uname);
                                const existingAvatar = (typeof m === 'object' && m.avatarUrl) ? m.avatarUrl : '';
                                if (freshUser) {
                                    return {
                                        username: uname,
                                        fullName: freshUser.fullName || (typeof m === 'object' ? m.fullName : uname),
                                        avatarUrl: freshUser.avatarUrl || existingAvatar || ''
                                    };
                                }
                                return typeof m === 'string' ? { username: m, fullName: m, avatarUrl: '' } : m;
                            });
                        }
                    });
                }
            }
        }

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
                .ilike('recipient_username', username)
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

            const notifId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));

            const notif = {
                id: notifId,
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

            const { data: insertedData, error: insertErr } = await supabase.from('team_notifications').insert(notif).select();

            if (insertErr) {
                console.error("SEND_INVITE_NOTIF insert error:", insertErr);
                return new Response(JSON.stringify({ error: insertErr.message || 'Gagal menyimpan undangan ke database.' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            return new Response(JSON.stringify({ success: true, notification: insertedData?.[0] || notif }), {
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
                    const isAlreadyMember = currentMembers.some((m: any) => m.username.toLowerCase() === username.toLowerCase());
                    if (!isAlreadyMember) {
                        const newMember = userObj || { username, fullName: username, avatarUrl: '' };
                        const updatedMembers = [...currentMembers, newMember];
                        await supabase.from('teams').update({ members: updatedMembers }).eq('id', teamId);
                    }
                }

                // Notify all recipients
                const { recipients, teamName } = await getTeamRecipients(teamId, username);
                const memberNotifs = recipients.map((r: string) => ({
                    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    recipient_username: r,
                    sender_username: username.toLowerCase(),
                    type: 'MEMBER_JOINED',
                    team_id: teamId,
                    team_name: teamName,
                    title: `Anggota Baru: ${teamName}`,
                    message: `@${username} telah menyetujui undangan dan bergabung ke tim "${teamName}".`,
                    status: 'UNREAD',
                    created_at: new Date().toISOString()
                }));

                if (memberNotifs.length > 0) {
                    await supabase.from('team_notifications').insert(memberNotifs);
                }
            } else {
                await supabase.from('team_notifications').update({ status: 'REJECTED' }).eq('id', notifId);
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: LEAVE_TEAM ---
        if (action === 'LEAVE_TEAM') {
            const { teamId, username } = body;
            if (!teamId || !username) {
                return new Response(JSON.stringify({ error: 'Missing teamId or username' }), { status: 400 });
            }

            const { recipients, teamName } = await getTeamRecipients(teamId, username);
            const { data: teamData } = await supabase.from('teams').select('*').eq('id', teamId).single();
            if (teamData) {
                const remainingMembers = (teamData.members || []).filter((m: any) => m.username.toLowerCase() !== username.toLowerCase());
                await supabase.from('teams').update({ members: remainingMembers }).eq('id', teamId);
            }

            const leaveNotifs = recipients.map((r: string) => ({
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                recipient_username: r,
                sender_username: username.toLowerCase(),
                type: 'MEMBER_LEFT',
                team_id: teamId,
                team_name: teamName,
                title: `Anggota Keluar: ${teamName}`,
                message: `@${username} telah keluar dari tim "${teamName}".`,
                status: 'UNREAD',
                created_at: new Date().toISOString()
            }));

            if (leaveNotifs.length > 0) {
                await supabase.from('team_notifications').insert(leaveNotifs);
            }

            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // --- ACTION: NOTIFY_REMOVED ---
        if (action === 'NOTIFY_REMOVED') {
            const { recipient_username, sender_username, team_id, team_name } = body;
            const notifs: any[] = [];

            // 1. Direct notification to removed member
            notifs.push({
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                recipient_username: recipient_username.toLowerCase(),
                sender_username: sender_username.toLowerCase(),
                type: 'REMOVED_FROM_TEAM',
                team_id: team_id || '',
                team_name: team_name || 'Tim Liburan',
                title: `Status Keanggotaan Tim: ${team_name}`,
                message: `@${sender_username} telah mengeluarkan Anda dari tim "${team_name}".`,
                status: 'UNREAD',
                created_at: new Date().toISOString()
            });

            // 2. Notify other remaining team recipients
            if (team_id) {
                const { recipients, teamName } = await getTeamRecipients(team_id, sender_username);
                recipients
                    .filter((r: string) => r.toLowerCase() !== recipient_username.toLowerCase())
                    .forEach((r: string) => {
                        notifs.push({
                            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                            recipient_username: r,
                            sender_username: sender_username.toLowerCase(),
                            type: 'MEMBER_LEFT',
                            team_id: team_id,
                            team_name: teamName,
                            title: `Anggota Dikeluarkan: ${teamName}`,
                            message: `@${sender_username} telah mengeluarkan @${recipient_username} dari tim "${teamName}".`,
                            status: 'UNREAD',
                            created_at: new Date().toISOString()
                        });
                    });
            }

            await supabase.from('team_notifications').insert(notifs);

            return new Response(JSON.stringify({ success: true }), {
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
            const { teamId, username } = body;
            if (!teamId) {
                return new Response(JSON.stringify({ error: 'Missing teamId' }), { status: 400 });
            }

            const deleter = username || 'owner';
            const { recipients, teamName } = await getTeamRecipients(teamId, deleter);

            const notifs = recipients.map((r: string) => ({
                id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                recipient_username: r,
                sender_username: deleter.toLowerCase(),
                type: 'TEAM_DELETED',
                team_id: teamId,
                team_name: teamName,
                title: `Tim Dihapus: ${teamName}`,
                message: `Tim "${teamName}" telah dihapus oleh @${deleter}.`,
                status: 'UNREAD',
                created_at: new Date().toISOString()
            }));

            if (notifs.length > 0) {
                await supabase.from('team_notifications').insert(notifs);
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
            let eventTitle = 'kegiatan';
            let teamId = '';

            if (existingEvt) {
                eventTitle = existingEvt.title || 'kegiatan';
                teamId = existingEvt.team_id || '';
                const ownerUname = (existingEvt.member_username || existingEvt.owner_username || '').toLowerCase();
                const isCreator = username && ownerUname && ownerUname === username.toLowerCase();
                const isTeamOwner = teamOwnerUsername && username && teamOwnerUsername.toLowerCase() === username.toLowerCase();

                if (!isCreator && !isTeamOwner && !existingEvt.is_group_event) {
                    return new Response(JSON.stringify({ error: 'Anda tidak memiliki hak untuk menghapus jadwal ini.' }), { status: 403 });
                }
            }

            // Create notification to all team recipients before deletion
            if (teamId && username) {
                const { recipients, teamName } = await getTeamRecipients(teamId, username);
                const notifs = recipients.map((r: string) => ({
                    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    recipient_username: r,
                    sender_username: username.toLowerCase(),
                    type: 'EVENT_DELETED',
                    team_id: teamId,
                    team_name: teamName,
                    title: `Jadwal Dihapus: ${eventTitle}`,
                    message: `@${username} menghapus kegiatan "${eventTitle}" dari tim "${teamName}".`,
                    status: 'UNREAD',
                    created_at: new Date().toISOString()
                }));

                if (notifs.length > 0) {
                    await supabase.from('team_notifications').insert(notifs);
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

        // Send notifications to all recipients of this team
        const { recipients, teamName } = await getTeamRecipients(team_id, myUsername);
        const notifs = recipients.map((r: string) => ({
            id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            recipient_username: r,
            sender_username: myUsername,
            type: 'EVENT_ADDED',
            team_id: team_id,
            team_name: teamName,
            title: `Jadwal Baru: ${title.trim()}`,
            message: `@${myUsername} menambahkan kegiatan baru "${title.trim()}" (${event_date}, ${start_time}-${end_time}) di tim "${teamName}".`,
            status: 'UNREAD',
            created_at: new Date().toISOString()
        }));

        if (notifs.length > 0) {
            await supabase.from('team_notifications').insert(notifs);
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
