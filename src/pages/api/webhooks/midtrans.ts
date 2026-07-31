import type { APIRoute } from 'astro';
import crypto from 'node:crypto';
import { supabase } from '../../../lib/supabase';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { order_id, status_code, gross_amount, signature_key, transaction_status, fraud_status } = body;

        const serverKey = import.meta.env.MIDTRANS_SERVER_KEY;
        const sheetWebhookUrl = import.meta.env.GOOGLE_SHEET_WEBHOOK_URL;

        // Signature Validation if Server Key is configured
        if (serverKey && signature_key) {
            const payloadToHash = order_id + status_code + gross_amount + serverKey;
            const expectedSignature = crypto.createHash('sha512').update(payloadToHash).digest('hex');

            if (signature_key !== expectedSignature) {
                console.error("Invalid Midtrans Webhook Signature!");
                return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 403 });
            }
        }

        const isSuccess = transaction_status === 'settlement' || 
                          (transaction_status === 'capture' && fraud_status === 'accept');

        if (isSuccess) {
            // Extract goalId from order_id (Format: DJ-{goalId}-{timestamp})
            let goalId = '';
            if (order_id.startsWith('DJ-')) {
                const parts = order_id.split('-');
                if (parts.length >= 2) goalId = parts[1];
            }

            const amount = parseFloat(gross_amount) || 0;

            console.log(`Payment SUCCESS for Goal ID: ${goalId}, Amount: ${amount}`);

            // 1. Update Supabase Goal & Add Transaction
            if (goalId && amount > 0) {
                try {
                    const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single();
                    if (goal) {
                        const newSaved = (goal.saved_amount || 0) + amount;
                        await supabase.from('goals').update({ saved_amount: newSaved }).eq('id', goalId);
                        
                        await supabase.from('transactions').insert({
                            user_id: goal.user_id,
                            goal_id: goalId,
                            amount: amount,
                            type: 'SETORAN',
                            description: `Setoran Midtrans QRIS (${order_id})`
                        });
                    }
                } catch (dbErr) {
                    console.error("Supabase Sync Error:", dbErr);
                }
            }

            // 2. Trigger Google Sheet Webhook Sync
            if (sheetWebhookUrl && goalId && amount > 0) {
                try {
                    const sheetRes = await fetch(sheetWebhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            goal_id: goalId,
                            amount: amount,
                            order_id: order_id,
                            timestamp: new Date().toISOString()
                        })
                    });
                    console.log("Google Sheet Sync Response Status:", sheetRes.status);
                } catch (sheetErr) {
                    console.error("Google Sheet Webhook Sync Error:", sheetErr);
                }
            }
        }

        return new Response(JSON.stringify({ status: 'OK', message: 'Webhook received' }), { status: 200 });
    } catch (error: any) {
        console.error("Midtrans Webhook Error:", error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
};
