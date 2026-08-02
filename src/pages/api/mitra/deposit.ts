import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';
import { fetchCachedCSV } from '../../../lib/fetchCache';

function parseCSVRow(r: string) {
    const result = [];
    let curVal = '';
    let inQuotes = false;
    for (let i = 0; i < r.length; i++) {
        if (r[i] === '"') {
            inQuotes = !inQuotes;
        } else if (r[i] === ',' && !inQuotes) {
            result.push(curVal.trim());
            curVal = '';
        } else {
            curVal += r[i];
        }
    }
    result.push(curVal.trim());
    return result;
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { goalId, amount, mitraId, mitraPin } = body;

        if (!goalId || !amount || !mitraId) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Data tidak lengkap. Mohon isi ID Target, Nominal, dan ID Mitra.' 
            }), { status: 400 });
        }

        const depositAmount = parseInt(amount, 10);
        if (isNaN(depositAmount) || depositAmount <= 0) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: 'Nominal setoran harus berupa angka positif yang valid.' 
            }), { status: 400 });
        }

        // 1. Verifikasi ID & PIN Mitra dari Spreadsheet Google Sheet
        try {
            const mitraCsvText = await fetchCachedCSV('https://docs.google.com/spreadsheets/d/1iF_gSErDUz9kMnDiSSgySE1gePeoFRmTdRffdQ4A9ys/export?format=csv');
            const mitraRows = mitraCsvText.split('\n');
            if (mitraRows.length > 0) {
                const headers = parseCSVRow(mitraRows[0]);
                const idxId = headers.findIndex(h => h.toLowerCase().includes('id'));
                const idxPin = headers.findIndex(h => h.toLowerCase().includes('pin') || h.toLowerCase().includes('sandi') || h.toLowerCase().includes('pass'));
                
                let foundMitraRow: any = null;
                mitraRows.slice(1).forEach(row => {
                    if (!row.trim()) return;
                    const cols = parseCSVRow(row);
                    const mId = (cols[idxId !== -1 ? idxId : 1] || '').trim();
                    if (mId.toLowerCase() === mitraId.trim().toLowerCase()) {
                        foundMitraRow = {
                            id: mId,
                            pin: (cols[idxPin !== -1 ? idxPin : 8] || '').trim()
                        };
                    }
                });

                if (!foundMitraRow) {
                    return new Response(JSON.stringify({
                        success: false,
                        error: `ID Mitra "${mitraId}" tidak terdaftar di database spreadsheet Mitra.`
                    }), { status: 404 });
                }

                if (foundMitraRow && foundMitraRow.pin) {
                    if (!mitraPin || mitraPin.trim() !== foundMitraRow.pin) {
                        return new Response(JSON.stringify({
                            success: false,
                            error: `PIN Keamanan untuk ID Mitra "${mitraId}" salah. Mohon masukkan PIN yang sesuai.`
                        }), { status: 401 });
                    }
                }
            }
        } catch (e) {
            console.warn("Mitra PIN verification sheet check:", e);
        }

        // 1. Cari Target di Database Supabase
        const { data: goal, error: goalError } = await supabase
            .from('goals')
            .select('*')
            .eq('id', goalId)
            .single();

        if (goalError || !goal) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: `ID Target "${goalId}" tidak ditemukan di database Supabase.` 
            }), { status: 404 });
        }

        // 2. Hitung saved_amount baru
        const currentSaved = goal.saved_amount || 0;
        const newSavedAmount = currentSaved + depositAmount;

        // 3. Update saved_amount di tabel goals
        const { error: updateError } = await supabase
            .from('goals')
            .update({ 
                saved_amount: newSavedAmount
            })
            .eq('id', goalId);

        if (updateError) {
            console.error("Gagal mengupdate saved_amount:", updateError);
            throw updateError;
        }

        // 4. Tambahkan catatan transaksi baru di Supabase
        const formattedNominal = `Rp ${new Intl.NumberFormat('id-ID').format(depositAmount)}`;
        const { error: txError } = await supabase
            .from('transactions')
            .insert({
                user_id: goal.user_id,
                username: goal.username || 'MitraUser',
                goal_id: goal.id,
                type: 'SETORAN_MITRA',
                payment_method: 'Cash',
                amount: depositAmount,
                description: `Setoran Tunai via Mitra (${mitraId}) sebesar ${formattedNominal} untuk ${goal.title}`
            });

        if (txError) {
            console.error("Gagal mencatat transaksi mitra:", txError);
        }

        return new Response(JSON.stringify({
            success: true,
            message: `Setoran Tunai ${formattedNominal} berhasil dicatat ke Supabase!`,
            goalId: goal.id,
            goalTitle: goal.title,
            newSavedAmount,
            depositAmount
        }), { status: 200 });

    } catch (err: any) {
        console.error("Mitra Deposit API Error:", err);
        return new Response(JSON.stringify({ 
            success: false, 
            error: err.message || 'Terjadi kesalahan server saat mengonfirmasi setoran.' 
        }), { status: 500 });
    }
};
