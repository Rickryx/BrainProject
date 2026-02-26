import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';

export function useCompany() {
    const router = useRouter();
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [companyName, setCompanyName] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) { router.push('/login'); return; }

            const { data } = await supabase
                .from('company_members')
                .select('company_id, companies(name)')
                .eq('auth_user_id', user.id)
                .single();

            if (data) {
                setCompanyId(data.company_id);
                setCompanyName((data.companies as any)?.name || '');
            } else {
                // No company yet → redirect to setup
                router.push('/setup');
            }
            setLoading(false);
        }
        load();
    }, [router]);

    return { companyId, companyName, loading };
}

/** Genera y descarga un CSV desde un array de objetos */
export function exportToCsv(filename: string, rows: Record<string, any>[]) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csvContent = [
        headers.join(','),
        ...rows.map(row =>
            headers.map(h => {
                const val = row[h] ?? '';
                const str = String(val).replace(/"/g, '""');
                return /[,"\n]/.test(str) ? `"${str}"` : str;
            }).join(',')
        )
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}
