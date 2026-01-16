import { supabase } from './supabase.js';

async function checkSchema() {
    const { data, error } = await supabase.from('MenuItem').select('*').limit(1);
    if (error) {
        console.error('Error fetching MenuItem:', error);
    } else {
        console.log('MenuItem columns:', Object.keys(data[0] || {}));
    }

    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
        console.error('Error fetching buckets:', bucketError);
    } else {
        console.log('Buckets:', buckets.map(b => b.name));
    }
}

checkSchema();
