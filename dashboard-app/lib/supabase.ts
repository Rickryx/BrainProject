import { createBrowserClient } from '@supabase/ssr'

// El cliente de Supabase para el navegador. 
// Las variables NEXT_PUBLIC_ deben estar disponibles tanto en build como en runtime.
export const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);
