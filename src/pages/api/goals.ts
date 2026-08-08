import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async (context) => {
    try {
        const auth = context.locals.auth();
        const userId = auth.userId;
        if (!userId) {
            return new Response(JSON.stringify({ goals: [] }), { status: 200 });
        }

        const clerkUser = await context.locals.currentUser();
        const username = (clerkUser?.username || '').toLowerCase();

        // 1. Fetch goals created by this user
        const { data: myGoals, error: myGoalsErr } = await supabase
            .from('goals')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (myGoalsErr) {
            console.warn("Fetch my goals warning:", myGoalsErr.message);
        }

        // 2. Fetch goals where user is in group_members
        let invitedGoals: any[] = [];
        if (username) {
            const { data: invGoals } = await supabase
                .from('goals')
                .select('*')
                .contains('group_members', [username])
                .order('created_at', { ascending: false });
            
            if (invGoals) invitedGoals = invGoals;
        }

        const goalMap = new Map();
        (myGoals || []).forEach(g => goalMap.set(g.id, g));
        (invitedGoals || []).forEach(g => goalMap.set(g.id, g));

        const allGoals = Array.from(goalMap.values());

        // Process payment_detail JSON if present
        const processedGoals = allGoals.map(g => {
            let detailsObj: any = {};
            if (g.payment_detail) {
                try {
                    if (typeof g.payment_detail === 'string' && g.payment_detail.trim().startsWith('{')) {
                        detailsObj = JSON.parse(g.payment_detail);
                    }
                } catch (e) {}
            }

            return {
                id: g.id,
                title: g.title,
                target_amount: g.target_amount,
                saved_amount: g.saved_amount || 0,
                auto_debit_amount: g.auto_debit_amount,
                frequency: g.frequency,
                trip_type: g.trip_type,
                saving_type: g.saving_type,
                group_members: g.group_members || [],
                created_at: g.created_at,
                status: detailsObj.status || (g.saved_amount > 0 ? 'active' : 'draft'),
                departure_date: detailsObj.departure_date || '',
                saving_end_date: detailsObj.saving_end_date || '',
                hotels: detailsObj.hotels || [],
                transports: detailsObj.transports || [],
                activities: detailsObj.activities || [],
                others: detailsObj.others || [],
                buffer_amount: detailsObj.buffer_amount || '',
                buffer_split: detailsObj.buffer_split || 'split',
                saving_freq: detailsObj.saving_freq || '1',
                group_members_data: detailsObj.group_members_data || [],
                payment_method: g.payment_method,
                raw_details: detailsObj
            };
        });

        return new Response(JSON.stringify({ goals: processedGoals }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (e: any) {
        console.error("GET /api/goals error:", e);
        return new Response(JSON.stringify({ goals: [], error: e.message }), { status: 200 });
    }
};

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const { userId } = locals.auth();
        if (!userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        
        // Ensure user exists in users table first
        const { data: userRecord } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
        if (!userRecord) {
            await supabase.from('users').insert({ id: userId });
        }

        const clerkUser = await locals.currentUser();
        const inviterUsername = (
            userRecord?.username ||
            clerkUser?.username ||
            userRecord?.full_name ||
            clerkUser?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
            'user'
        ).toLowerCase();

        const fullDetails = {
            status: body.status || 'draft',
            departure_date: body.departure_date || '',
            saving_end_date: body.saving_end_date || '',
            hotels: body.hotels || [],
            transports: body.transports || [],
            activities: body.activities || [],
            others: body.others || [],
            buffer_amount: body.buffer_amount || '',
            buffer_split: body.buffer_split || 'split',
            saving_freq: body.saving_freq || '1',
            group_members_data: body.group_members_data || []
        };

        const paymentDetailStr = JSON.stringify(fullDetails);

        const goalPayload: any = {
            user_id: userId,
            username: inviterUsername,
            title: body.title || 'Perjalanan Impian',
            target_amount: body.target_amount || 0,
            auto_debit_amount: body.auto_debit_amount || 0,
            frequency: body.frequency || '/hari',
            payment_method: body.payment_method || 'QRIS',
            payment_detail: paymentDetailStr,
            trip_type: body.trip_type || 'Solo',
            saving_type: body.saving_type || 'Konvensional',
            group_members: body.group_members || []
        };

        let resultData = null;

        // Check if updating existing goal or inserting new
        if (body.id && typeof body.id === 'string' && !body.id.startsWith('goal_17')) {
            const { data: existingGoal } = await supabase.from('goals').select('id').eq('id', body.id).maybeSingle();
            if (existingGoal) {
                const { data: updatedData, error: updateErr } = await supabase
                    .from('goals')
                    .update(goalPayload)
                    .eq('id', body.id)
                    .select()
                    .single();
                
                if (!updateErr) {
                    resultData = updatedData;
                }
            }
        }

        if (!resultData) {
            if (body.id && typeof body.id === 'string') {
                goalPayload.id = body.id;
            }
            const { data: insertedData, error: insertErr } = await supabase
                .from('goals')
                .insert(goalPayload)
                .select()
                .single();

            if (insertErr) {
                console.warn("Goals API Insert warning (retrying without id):", insertErr.message);
                delete goalPayload.id;
                const { data: retryData, error: retryErr } = await supabase
                    .from('goals')
                    .insert(goalPayload)
                    .select()
                    .single();

                if (retryErr) {
                    return new Response(JSON.stringify({ error: retryErr.message }), { status: 500 });
                }
                resultData = retryData;
            } else {
                resultData = insertedData;
            }
        }

        // Handle Invitations if Group Trip
        if (body.group_members && body.group_members.length > 0 && resultData) {
            const invitations = body.group_members.map((member: string) => ({
                goal_id: resultData.id,
                inviter_id: userId,
                inviter_username: inviterUsername,
                invitee_username: member.toLowerCase(),
                goal_title: body.title,
                target_amount: body.target_amount,
                auto_debit_amount: body.auto_debit_amount || 50000,
                frequency: body.frequency || 1,
                saving_type: body.saving_type || 'Konvensional',
                payment_method: body.payment_method || 'Cashless',
                payment_detail: paymentDetailStr,
                trip_type: body.trip_type || 'Group'
            }));

            await supabase.from('group_invitations').insert(invitations).catch(() => {});
        }

        return new Response(JSON.stringify({ success: true, goal: resultData }), { status: 200 });

    } catch (e: any) {
        console.error("POST /api/goals error:", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
