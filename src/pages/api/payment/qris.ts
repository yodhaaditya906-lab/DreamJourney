import type { APIRoute } from 'astro';

// In-memory mock database for transactions
export const mockTransactions = new Map<string, any>();

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { amount, reference_id, title } = body;

        if (!amount || !reference_id) {
            return new Response(JSON.stringify({ error: 'Missing amount or reference_id' }), { status: 400 });
        }

        const apiKey = import.meta.env.XENDIT_SECRET_KEY;

        let qrString = '';
        let xenditId = '';

        if (apiKey) {
            // Real Xendit Integration
            const base64Key = Buffer.from(apiKey + ':').toString('base64');
            const res = await fetch('https://api.xendit.co/qr_codes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${base64Key}`,
                    'api-version': '2022-07-31'
                },
                body: JSON.stringify({
                    reference_id: reference_id,
                    type: 'DYNAMIC',
                    currency: 'IDR',
                    amount: amount
                })
            });

            if (!res.ok) {
                const errorData = await res.json();
                console.error("Xendit API Error:", errorData);
                return new Response(JSON.stringify({ error: 'Failed to create QRIS from Xendit', details: errorData }), { status: 500 });
            }

            const data = await res.json();
            qrString = data.qr_string;
            xenditId = data.id;
        } else {
            // Mock Mode Fallback
            console.log("XENDIT_SECRET_KEY not found. Using Mock Mode.");
            xenditId = `mock_qr_${Date.now()}`;
            // A fake QR payload that can be parsed by scanners (just dummy text for now)
            qrString = `00020101021226680016COM.MOCKQR.ID011893600000000000000002150000000000000000303UMI51440014ID.CO.QRIS.WWW0215ID10230000000000303UMI520441115303360540${String(amount).length}${amount}5802ID5912DreamJourney6012Jakarta61051234562540114${reference_id}6304ABCD`;
        }

        // Save transaction to memory for mock webhook checking
        mockTransactions.set(reference_id, {
            id: xenditId,
            reference_id,
            title,
            amount,
            status: 'PENDING',
            created_at: new Date().toISOString()
        });

        return new Response(JSON.stringify({
            success: true,
            reference_id,
            xendit_id: xenditId,
            qr_string: qrString,
            amount,
            is_mock: !apiKey
        }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json'
            }
        });

    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}

export const GET: APIRoute = async ({ request }) => {
    const url = new URL(request.url);
    const refId = url.searchParams.get('reference_id');

    if (!refId) {
        return new Response(JSON.stringify({ error: 'Missing reference_id' }), { status: 400 });
    }

    const tx = mockTransactions.get(refId);
    if (!tx) {
        return new Response(JSON.stringify({ error: 'Transaction not found' }), { status: 404 });
    }

    return new Response(JSON.stringify({
        success: true,
        data: tx
    }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
