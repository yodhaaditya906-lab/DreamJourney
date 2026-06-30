import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
    try {
        const { userId } = locals.auth();
        if (!userId) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
        }

        const body = await request.json();
        
        // Ensure user exists in users table first
        const { data: userRecord } = await supabase.from('users').select('id').eq('id', userId).single();
        if (!userRecord) {
            await supabase.from('users').insert({ id: userId });
        }

        const clerkUser = await locals.currentUser();
        const inviterUsername = clerkUser?.username || 'Seseorang';

        // Insert Goal
        const { data, error } = await supabase.from('goals').insert({
            user_id: userId,
            title: body.title,
            target_amount: body.target_amount,
            auto_debit_amount: body.auto_debit_amount,
            frequency: body.frequency,
            payment_method: body.payment_method,
            payment_detail: body.payment_detail,
            trip_type: body.trip_type,
            saving_type: body.saving_type || 'Custom Planner',
            group_members: body.group_members || [],
            saved_amount: 0
        }).select().single();

        if (error) {
            console.error("Goals API Insert Error:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        // Handle Invitations
        if (body.group_members && body.group_members.length > 0) {
            const invitations = body.group_members.map((member: string) => ({
                goal_id: data.id,
                inviter_id: userId,
                inviter_username: inviterUsername,
                invitee_username: member.toLowerCase(),
                goal_title: body.title,
                target_amount: body.target_amount,
                auto_debit_amount: body.auto_debit_amount || 50000,
                frequency: body.frequency || 1,
                saving_type: body.saving_type || 'Custom Planner',
                payment_method: body.payment_method || 'Cashless',
                payment_detail: body.payment_detail || '',
                trip_type: body.trip_type || 'Group'
            }));

            const { error: invError } = await supabase.from('group_invitations').insert(invitations);
            if (invError) {
                console.error("Failed to insert invitations in /api/goals:", invError);
            }
        }

        return new Response(JSON.stringify({ success: true, goal: data }), { status: 200 });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};

export const GET: APIRoute = async () => {
    try {
        const { data } = await supabase.from('goals').select('*').limit(1);
        const cols = data && data.length > 0 ? Object.keys(data[0]) : [];
        return new Response(JSON.stringify({ columns: cols }), { status: 200 });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
