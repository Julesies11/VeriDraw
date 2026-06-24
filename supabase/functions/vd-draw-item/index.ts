// supabase/functions/vd-draw-item/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let event_id: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables on server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    try {
      const body = await req.json();
      event_id = body?.event_id;
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!event_id) {
      return new Response(
        JSON.stringify({ error: "event_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate user using their JWT (decoded offline since Gateway enforces signature validation)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let userId: string | null = null;
    try {
      const parts = authHeader.split(" ");
      if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
        const token = parts[1];
        const tokenParts = token.split(".");
        if (tokenParts.length === 3) {
          const payloadBase64 = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
          const payloadJson = atob(payloadBase64);
          const payload = JSON.parse(payloadJson);
          userId = payload.sub || null;
        }
      }
    } catch (e) {
      console.error("JWT Decode error:", e);
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized user JWT" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Load the event and session using service role client to check ownership, status, and session concurrency
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const [eventResult, sessionResult] = await Promise.all([
      serviceClient.from("vd_events").select("created_by, status, select_count").eq("id", event_id).single(),
      serviceClient.from("vd_event_sessions").select("current_status, last_spin_angle").eq("event_id", event_id).single()
    ]);

    const { data: event, error: eventError } = eventResult;
    const { data: session, error: sessionError } = sessionResult;

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event.created_by !== userId) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Only the event creator can trigger a draw" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Security Hardening: Block requests on already completed drawings
    if (event.status === "completed") {
      return new Response(
        JSON.stringify({ error: "Drawing is already completed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Concurrency Guard: Block manual draws if another spin is currently active
    if (session && session.current_status === "spinning") {
      return new Response(
        JSON.stringify({ error: "A spin is already in progress. Please wait for the current round to finish." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch unselected items for this event (ordered by display_order to match client list)
    const { data: items, error: itemsError } = await serviceClient
      .from("vd_event_items")
      .select("id, item_value")
      .eq("event_id", event_id)
      .eq("is_selected", false)
      .order("display_order", { ascending: true });

    if (itemsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch items" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "No unselected items remaining in this draw" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Select a random item
    const randomIndex = Math.floor(Math.random() * items.length);
    const selectedItem = items[randomIndex];

    // Determine the selection order
    const { count: selectedCount, error: countError } = await serviceClient
      .from("vd_event_items")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event_id)
      .eq("is_selected", true);

    if (countError) {
      return new Response(
        JSON.stringify({ error: "Failed to determine selection order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nextOrder = (selectedCount ?? 0) + 1;

    // 5. Update the selected item
    const { error: updateItemError } = await serviceClient
      .from("vd_event_items")
      .update({
        is_selected: true,
        selection_order: nextOrder,
        selected_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", selectedItem.id);

    if (updateItemError) {
      return new Response(
        JSON.stringify({ error: "Failed to update selected item" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Update the event session state
    const N = items.length;
    const sliceAngle = 360 / N;
    const spinDuration = 4000;
    // Calculate target angle to align selected slice with indicator pointer
    const targetBaseAngle = (randomIndex * sliceAngle) + Math.random() * (sliceAngle - 2);
    
    // Make target angle cumulative (at least 5 revolutions from last spin angle)
    const lastAngle = Number(session?.last_spin_angle || 0);
    const K = Math.ceil((lastAngle + 1800 - targetBaseAngle) / 360);
    const targetAngle = 360 * K + targetBaseAngle;

    const { error: sessionError } = await serviceClient
      .from("vd_event_sessions")
      .update({
        current_status: "spinning",
        active_winner_id: selectedItem.id,
        spin_start_time: new Date().toISOString(),
        spin_duration_ms: spinDuration,
        last_spin_angle: targetAngle,
        updated_by: userId,
      })
      .eq("event_id", event_id);

    if (sessionError) {
      return new Response(
        JSON.stringify({ error: "Failed to update draw session state" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Check if we've completed the selection targets or selected all items
    const totalSelected = nextOrder;
    const isAllSelected = totalSelected >= event.select_count || items.length === 1;
    if (isAllSelected) {
      await serviceClient
        .from("vd_events")
        .update({
          status: "completed",
          updated_by: userId,
        })
        .eq("id", event_id);
    } else if (event.status === "scheduled") {
      // Mark event as active once draws start
      await serviceClient
        .from("vd_events")
        .update({
          status: "active",
          updated_by: userId,
        })
        .eq("id", event_id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        item: selectedItem,
        selection_order: nextOrder,
        spin_duration_ms: spinDuration,
        target_angle: targetAngle,
        is_completed: isAllSelected,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[vd-draw-item Error]`, error);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && supabaseServiceKey) {
        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
        await serviceClient.from("vd_error_logs").insert({
          error_message: error.message || String(error),
          error_stack: error.stack,
          context: { function: "vd-draw-item", event_id }
        });
      }
    } catch (logErr) {
      console.error("Failed to write function crash to DB:", logErr);
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
