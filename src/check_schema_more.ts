import { supabase } from './supabase.js';

async function checkMoreSchema() {
    const { data: cat, error: catError } = await supabase.from('MenuCategory').select('*').limit(1);
    console.log('MenuCategory columns:', Object.keys(cat[0] || {}));

    const { data: tables, error: tableError } = await supabase.from('Table').select('*').limit(1);
    console.log('Table columns:', Object.keys(tables[0] || {}));

    const { data: tableSessions, error: sessionError } = await supabase.from('TableSession').select('*').limit(1);
    console.log('TableSession columns:', Object.keys(tableSessions[0] || {}));
}

checkMoreSchema();
