import type { APIRoute } from 'astro';
import { mockTransactions } from '../payment/qris';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        
        // This is a simplified webhook handler.
        // In production, we should verify Xendit's Callback Token (x-callback-token header)
        
        console.log("Received Webhook from Xendit:", body);

        // QRIS callback payload usually contains:
        // event: "qr.payment", data: { reference_id, amount, status }
        
        // Handling both real xendit format and a simplified mock format
        const event = body.event;
        let data = body.data || body;
        
        const referenceId = data.reference_id;
        const status = data.status || 'COMPLETED'; // If we receive it, we assume it's paid

        if (referenceId) {
            const tx = mockTransactions.get(referenceId);
            if (tx) {
                // Update transaction status in memory
                tx.status = status === 'COMPLETED' || status === 'SUCCEEDED' || status === 'PAID' ? 'PAID' : tx.status;
                mockTransactions.set(referenceId, tx);
                console.log(`Transaction ${referenceId} updated to PAID`);
            }
        }

        return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error("Webhook processing error:", error);
        return new Response(JSON.stringify({ error: 'Failed to process webhook' }), { status: 500 });
    }
}
