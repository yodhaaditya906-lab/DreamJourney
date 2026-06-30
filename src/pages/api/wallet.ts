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

        // Ensure user exists in supabase
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (userError && userError.code === 'PGRST116') {
            // User not found, insert
            await supabase.from('users').insert({ id: userId });
        } else if (userError) {
             throw userError;
        }

        const clerkUser = await context.locals.currentUser();
        const inviterUsername = clerkUser?.username || 'Seseorang';

        if (action === 'ADD_GOAL_FULL') {
            const { data: goal, error: goalError } = await supabase.from('goals').insert({
                user_id: userId,
                title: body.title,
                target_amount: body.targetAmount,
                auto_debit_amount: body.autoDebitAmount || 50000,
                frequency: body.frequency || 'Mingguan',
                payment_method: body.paymentMethod || 'Cashless',
                payment_detail: body.paymentDetail || '',
                trip_type: body.tripType || 'Solo',
                saving_type: body.savingType || 'Konvensional',
                group_members: body.groupMembers || [],
                saved_amount: 0
            }).select().single();

            if (goalError) throw goalError;

            await supabase.from('transactions').insert({
                user_id: userId,
                goal_id: goal.id,
                type: 'GOAL_CREATED',
                amount: 0,
                description: `Memulai setup tabungan untuk ${body.title}`
            });

            // CREATE INVITATIONS FOR GROUP MEMBERS
            if (body.groupMembers && body.groupMembers.length > 0) {
                const invitations = body.groupMembers.map((member: string) => ({
                    goal_id: goal.id,
                    inviter_id: userId,
                    inviter_username: inviterUsername,
                    invitee_username: member.toLowerCase(),
                    goal_title: body.title,
                    target_amount: body.targetAmount,
                    auto_debit_amount: body.autoDebitAmount || 50000,
                    frequency: body.frequency || 1, // Store as number if it's days?
                    saving_type: body.savingType || 'Konvensional',
                    payment_method: body.paymentMethod || 'Cashless',
                    payment_detail: body.paymentDetail || '',
                    trip_type: body.tripType || 'Group'
                }));
                
                // Frequency is currently string or number depending on UI.
                // We'll just pass it directly. But wait, in ADD_GOAL_FULL body.frequency is expected.

                const { error: invError } = await supabase.from('group_invitations').insert(invitations);
                if (invError) {
                    console.error("Failed to insert invitations:", invError);
                }
            }
        }
        else if (action === 'SIMULATE_DEBIT') {
            const goalId = body.goalId;
            
            // Get goal
            const { data: goal, error: getError } = await supabase
                .from('goals')
                .select('*')
                .eq('id', goalId)
                .single();
                
            if (getError) throw getError;
            
            const amount = body.amount || goal.auto_debit_amount;
            
            // Update goal
            await supabase
                .from('goals')
                .update({ saved_amount: goal.saved_amount + amount })
                .eq('id', goalId);
                
            // Log transaction
            await supabase.from('transactions').insert({
                user_id: userId,
                goal_id: goalId,
                type: 'AUTO_DEBIT',
                amount: amount,
                description: `Auto debit berhasil untuk ${goal.title}`
            });
            
            // Also update total balance in users table
            const { data: currentUser } = await supabase.from('users').select('balance').eq('id', userId).single();
            if (currentUser) {
                await supabase.from('users').update({ balance: (currentUser.balance || 0) + amount }).eq('id', userId);
            }
        }
        else if (action === 'SET_LENTERA') {
            await supabase
                .from('users')
                .update({ lentera_id: body.lenteraId })
                .eq('id', userId);
                
            await supabase.from('transactions').insert({
                user_id: userId,
                type: 'SYSTEM',
                amount: 0,
                description: `Mengubah preferensi pendamping Lentera`
            });
        }
        else if (action === 'CANCEL_GOAL') {
            const { goalId, refundAmount, reason, complaint } = body;

            // Fetch all related goals to delete
            let allGoalIdsToDelete = [goalId];
            
            const { data: invsAsInviter } = await supabase.from('group_invitations').select('invitee_goal_id').eq('goal_id', goalId);
            const { data: invsAsInvitee } = await supabase.from('group_invitations').select('goal_id').eq('invitee_goal_id', goalId);
            
            if (invsAsInviter && invsAsInviter.length > 0) {
                allGoalIdsToDelete.push(...invsAsInviter.map((i: any) => i.invitee_goal_id).filter(Boolean));
            }
            if (invsAsInvitee && invsAsInvitee.length > 0) {
                const parentGoalId = invsAsInvitee[0].goal_id;
                if (parentGoalId) {
                    allGoalIdsToDelete.push(parentGoalId);
                    const { data: siblings } = await supabase.from('group_invitations').select('invitee_goal_id').eq('goal_id', parentGoalId);
                    if (siblings) {
                        allGoalIdsToDelete.push(...siblings.map((i: any) => i.invitee_goal_id).filter(Boolean));
                    }
                }
            }
            
            // Deduplicate
            allGoalIdsToDelete = [...new Set(allGoalIdsToDelete)];

            // Fetch goals data before deleting to get title and saved_amount
            const { data: goalsToDelete } = await supabase
                .from('goals')
                .select('*')
                .in('id', allGoalIdsToDelete);

            if (goalsToDelete && goalsToDelete.length > 0) {
                // Delete them all
                await supabase.from('goals').delete().in('id', allGoalIdsToDelete);

                for (const dg of goalsToDelete) {
                    const isCurrentUser = dg.id === goalId;
                    const refundAmt = isCurrentUser ? (refundAmount || 0) : (dg.saved_amount || 0);

                    // Insert transaction record for the refund
                    await supabase.from('transactions').insert({
                        user_id: dg.user_id,
                        type: 'SYSTEM',
                        amount: refundAmt,
                        description: isCurrentUser ? 
                            `Refund batal ${dg.title || 'perjalanan'} (${reason})` : 
                            `Refund batal otomatis: Rencana ${dg.title || 'perjalanan'} dibatalkan oleh teman satu grup.`
                    });

                    // Update user balance with refund
                    if (refundAmt > 0) {
                        const { data: currUser } = await supabase.from('users').select('balance').eq('id', dg.user_id).single();
                        if (currUser) {
                            await supabase.from('users').update({ balance: (currUser.balance || 0) + refundAmt }).eq('id', dg.user_id);
                        }
                    }
                }
            }

            // Optional: log complaint if it exists
            if (complaint) {
                await supabase.from('transactions').insert({
                    user_id: userId,
                    type: 'SYSTEM',
                    amount: 0,
                    description: `Keluhan Batal: ${complaint}`
                });
            }
        }
        else if (action === 'RESET_WALLET') {
             // Let's delete all transactions and goals for this user
             await supabase.from('transactions').delete().eq('user_id', userId);
             await supabase.from('goals').delete().eq('user_id', userId);
             await supabase.from('users').update({ balance: 0, lentera_id: null }).eq('id', userId);
        }
        else {
            return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400 });
        }

        return new Response(JSON.stringify({ success: true }), { status: 200 });
        
    } catch (error) {
        console.error('Wallet API Error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
