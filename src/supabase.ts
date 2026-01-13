import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dncyxqcxmmwzfujbpjtq.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuY3l4cWN4bW13emZ1amJwanRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzUxODA5MywiZXhwIjoyMDgzMDk0MDkzfQ.z72mgtwsN9zD-Qc5mhcGoZ2VL6SmRSZSU01ogOlBa_s' // service_role key

export const supabase = createClient(supabaseUrl, supabaseKey, {
    db: { schema: 'public' }
})
