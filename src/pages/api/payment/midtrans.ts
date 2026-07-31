import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { amount, goalId, title, customerName, customerEmail } = body;

        if (!amount || !goalId) {
            return new Response(JSON.stringify({ error: 'Missing amount or goalId' }), { status: 400 });
        }

        const serverKey = (process.env.MIDTRANS_SERVER_KEY || import.meta.env.MIDTRANS_SERVER_KEY || '').trim();
        const isExplicitProd = (process.env.MIDTRANS_IS_PRODUCTION || import.meta.env.MIDTRANS_IS_PRODUCTION) === 'true';

        const orderId = `DJ-${goalId}-${Date.now().toString().slice(-6)}`;

        if (serverKey) {
            const authHeader = 'Basic ' + Buffer.from(serverKey + ':').toString('base64');
            
            const payload = {
                transaction_details: {
                    order_id: orderId,
                    gross_amount: Math.round(amount)
                },
                item_details: [{
                    id: goalId.toString().slice(0, 50),
                    price: Math.round(amount),
                    quantity: 1,
                    name: (title || 'Setoran Tabungan').slice(0, 50)
                }],
                customer_details: {
                    first_name: customerName || 'User DreamJourney',
                    email: customerEmail || 'user@dreamjourney.id'
                },
                callbacks: {
                    finish: `${request.headers.get('origin') || 'http://localhost:4321'}/dashboard`
                }
            };

            let targetUrl = isExplicitProd 
                ? 'https://app.midtrans.com/snap/v1/transactions'
                : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

            let res = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': authHeader
                },
                body: JSON.stringify(payload)
            });

            // If Production returned 401 unauthorized, fallback to Sandbox
            if (!res.ok && isExplicitProd) {
                targetUrl = 'https://app.sandbox.midtrans.com/snap/v1/transactions';
                res = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': authHeader
                    },
                    body: JSON.stringify(payload)
                });
            }

            if (!res.ok) {
                const errorData = await res.json();
                console.error("Midtrans Snap API Error:", errorData);
                return new Response(JSON.stringify({ error: 'Failed to generate Snap token', details: errorData }), { status: 500 });
            }

            const data = await res.json();
            return new Response(JSON.stringify({
                success: true,
                token: data.token,
                redirect_url: data.redirect_url,
                order_id: orderId,
                is_sandbox: targetUrl.includes('sandbox')
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } else {
            // Mock Mode Fallback when MIDTRANS_SERVER_KEY is not configured yet
            console.log("MIDTRANS_SERVER_KEY not found in .env. Returning mock response.");
            return new Response(JSON.stringify({
                success: true,
                is_mock: true,
                token: `mock_snap_token_${Date.now()}`,
                order_id: orderId,
                message: "MIDTRANS_SERVER_KEY belum diatur di .env. Menggunakan mode simulasi."
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
    } catch (error: any) {
        console.error("Midtrans API Error:", error);
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error?.message }), { status: 500 });
    }
};
