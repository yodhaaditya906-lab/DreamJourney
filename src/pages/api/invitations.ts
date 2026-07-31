import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async (context) => {
    try {
        const auth = context.locals.auth();
        const userId = auth.userId;
        
        if (!userId) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const body = await context.request.json();
        const action = body.action;
        const invitationId = body.invitationId;

        if (!invitationId || !action) {
            return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400 });
        }

        // Fetch invitation
        const { data: inv, error: invError } = await supabase
            .from('group_invitations')
            .select('*')
            .eq('id', invitationId)
            .single();

        if (invError || !inv) {
            return new Response(JSON.stringify({ error: 'Invitation not found' }), { status: 404 });
        }

        if (inv.status !== 'PENDING') {
            return new Response(JSON.stringify({ error: 'Invitation already processed' }), { status: 400 });
        }

        if (action === 'ACCEPT') {
            // Fetch original goal to get group_members
            let newGroupMembers: string[] = [inv.inviter_username];
            if (inv.goal_id) {
                const { data: originalGoal } = await supabase.from('goals').select('group_members').eq('id', inv.goal_id).single();
                if (originalGoal && originalGoal.group_members) {
                    const others = originalGoal.group_members.filter((m: string) => m.toLowerCase() !== inv.invitee_username.toLowerCase());
                    newGroupMembers = [...newGroupMembers, ...others];
                }
            }

            // Update status
            await supabase.from('group_invitations').update({ status: 'ACCEPTED' }).eq('id', invitationId);

            // Create goal for invitee
            const { data: goal, error: goalError } = await supabase.from('goals').insert({
                user_id: userId,
                title: inv.goal_title,
                target_amount: inv.target_amount,
                auto_debit_amount: inv.auto_debit_amount,
                frequency: inv.frequency,
                saving_type: inv.saving_type,
                payment_method: inv.payment_method,
                payment_detail: inv.payment_detail,
                trip_type: inv.trip_type,
                group_members: newGroupMembers,
                saved_amount: 0
            }).select().single();

            if (goalError) throw goalError;

            // Link the new goal back to the invitation
            await supabase.from('group_invitations').update({ invitee_goal_id: goal.id }).eq('id', invitationId);

            // Create initial transaction
            await supabase.from('transactions').insert({
                user_id: userId,
                goal_id: goal.id,
                type: 'GOAL_CREATED',
                amount: 0,
                description: `Bergabung ke grup tabungan ${inv.goal_title} (Undangan dari @${inv.inviter_username})`
            });

        } else if (action === 'REJECT') {
            // Update status (might be deleted by cascade, but just in case)
            await supabase.from('group_invitations').update({ status: 'REJECTED' }).eq('id', invitationId);

            // Fetch and delete the original goal
            if (inv.goal_id) {
                const { data: deletedGoal, error: delError } = await supabase
                    .from('goals')
                    .delete()
                    .eq('id', inv.goal_id)
                    .select()
                    .single();

                if (deletedGoal) {
                    // Refund to inviter if they already saved anything
                    if (deletedGoal.saved_amount > 0) {
                        const { data: inviterUser } = await supabase
                            .from('users')
                            .select('balance')
                            .eq('id', inv.inviter_id)
                            .single();
                        
                        if (inviterUser) {
                            await supabase
                                .from('users')
                                .update({ balance: (inviterUser.balance || 0) + deletedGoal.saved_amount })
                                .eq('id', inv.inviter_id);
                        }
                    }

                    // Insert transaction for inviter
                    await supabase.from('transactions').insert({
                        user_id: inv.inviter_id,
                        type: 'SYSTEM',
                        amount: deletedGoal.saved_amount || 0,
                        description: `Rencana ${deletedGoal.title} dibatalkan otomatis karena ajakan ditolak oleh @${inv.invitee_username}.`
                    });
                }
            }
        } else {
            return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
    } catch (e: any) {
        console.error("Invitations API Error:", e);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};

export const GET: APIRoute = async (context) => {
    try {
        const auth = context.locals.auth();
        if (!auth.userId) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const clerkUser = await context.locals.currentUser();
        if (!clerkUser?.username) {
            return new Response(JSON.stringify({ error: 'No username' }), { status: 400 });
        }

        const { data, error } = await supabase
            .from('group_invitations')
            .select('*')
            .eq('invitee_username', clerkUser.username.toLowerCase())
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify({ invitations: data }), { status: 200 });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
