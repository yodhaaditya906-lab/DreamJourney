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

            // Delete goal and get its title
            const { data: deletedGoal } = await supabase
                .from('goals')
                .delete()
                .eq('id', goalId)
                .select()
                .single();

            // Insert transaction record for the refund
            await supabase.from('transactions').insert({
                user_id: userId,
                type: 'SYSTEM',
                amount: refundAmount || 0,
                description: `Refund batal ${deletedGoal?.title || 'perjalanan'} (${reason})`
            });

            // Optional: log complaint if it exists
            if (complaint) {
                await supabase.from('transactions').insert({
                    user_id: userId,
                    type: 'SYSTEM',
                    amount: 0,
                    description: `Keluhan Batal: ${complaint}`
                });
            }

            // Update user balance with refund
            if (refundAmount > 0) {
                const { data: currentUser } = await supabase.from('users').select('balance').eq('id', userId).single();
                if (currentUser) {
                    await supabase.from('users').update({ balance: (currentUser.balance || 0) + refundAmount }).eq('id', userId);
                }
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
