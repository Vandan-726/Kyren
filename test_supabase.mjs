import { createClient } from '@supabase/supabase-js';


const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function run() {
    const { data: convs, error: convErr } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', '2eb687e4-f14f-4de2-9a3f-d02e59c0d3c8')
        .eq('conversation_type', 'companion')
        .order('created_at', { ascending: false });

    if (convErr) {
        console.error("Conv Error:", convErr);
        return;
    }
    
    console.log("Total Conversations:", convs.length);
    for (let i = 0; i < Math.min(convs.length, 5); i++) {
        const { data: msgs, error: msgErr } = await supabase
            .from('conversation_messages')
            .select('*')
            .eq('conversation_id', convs[i].id)
            .order('created_at', { ascending: true });
        console.log(`Conv ${i} has ${msgs?.length || 0} messages.`);
    }
}

run();
