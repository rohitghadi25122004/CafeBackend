import { supabase } from './supabase.js';

async function setupStorage() {
    const { data, error } = await supabase.storage.createBucket('menu-images', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
    });

    if (error) {
        if (error.message.includes('already exists')) {
            console.log('Bucket "menu-images" already exists.');
        } else {
            console.error('Error creating bucket:', error);
        }
    } else {
        console.log('Bucket "menu-images" created successfully.');
    }
}

setupStorage();
