import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.79.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify JWT and get user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check banned status
    const { data: banCheck } = await supabase
      .from('profiles').select('is_banned').eq('id', user.id).single();
    if (banCheck?.is_banned) {
      return new Response(
        JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { recipientId, notificationType } = await req.json();

    if (!recipientId) {
      return new Response(
        JSON.stringify({ error: 'Missing recipientId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[notify-gift-ready] Sender: ${user.id}, Recipient: ${recipientId}, Type: ${notificationType}`);

    // Get sender profile
    const { data: senderProfile, error: senderError } = await supabase
      .from('profiles')
      .select('username, full_name')
      .eq('id', user.id)
      .single();

    if (senderError || !senderProfile) {
      console.error('[notify-gift-ready] Failed to get sender profile:', senderError);
      return new Response(
        JSON.stringify({ error: 'Failed to get sender profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const senderName = senderProfile.full_name || senderProfile.username;

    // Build message based on notification type
    let messageContent: string;
    if (notificationType === 'wallet_linked_other') {
      messageContent = `🎁 ${senderName} muốn tặng quà cho bạn.\nVí hiện tại của bạn đã kết nối với một tài khoản khác, bạn hãy kết nối với một địa chỉ ví khác để sẵn sàng nhận quà nhé!`;
    } else {
      // Default: no wallet
      messageContent = `🎁 ${senderName} muốn tặng quà cho bạn!\nBạn hãy kết nối ví Web3 để sẵn sàng nhận quà nhé!`;
    }

    // Find or create direct conversation between sender and recipient
    // First, check if conversation already exists
    const { data: existingConversations } = await supabase
      .from('conversations')
      .select(`
        id,
        conversation_participants!inner (user_id)
      `)
      .eq('type', 'direct');

    let conversationId: string | null = null;

    // Find a direct conversation where both users are participants
    if (existingConversations) {
      for (const conv of existingConversations) {
        const participants = conv.conversation_participants as { user_id: string }[];
        const participantIds = participants.map(p => p.user_id);
        
        if (participantIds.length === 2 && 
            participantIds.includes(user.id) && 
            participantIds.includes(recipientId)) {
          conversationId = conv.id;
          break;
        }
      }
    }

    // If no conversation exists, create one
    if (!conversationId) {
      console.log('[notify-gift-ready] Creating new conversation');
      
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'direct',
          created_by: user.id,
        })
        .select('id')
        .single();

      if (convError || !newConv) {
        console.error('[notify-gift-ready] Failed to create conversation:', convError);
        return new Response(
          JSON.stringify({ error: 'Failed to create conversation' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      conversationId = newConv.id;

      // Add both participants
      const { error: participantsError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: conversationId, user_id: user.id, role: 'member' },
          { conversation_id: conversationId, user_id: recipientId, role: 'member' },
        ]);

      if (participantsError) {
        console.error('[notify-gift-ready] Failed to add participants:', participantsError);
      }
    }

    // Send the message
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: messageContent,
      })
      .select('id')
      .single();

    if (messageError) {
      console.error('[notify-gift-ready] Failed to send message:', messageError);
      return new Response(
        JSON.stringify({ error: 'Failed to send message' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update conversation last_message
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: messageContent.substring(0, 100),
      })
      .eq('id', conversationId);

    console.log('[notify-gift-ready] Message sent successfully:', message.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: message.id,
        conversationId: conversationId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[notify-gift-ready] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
