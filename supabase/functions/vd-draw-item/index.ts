// supabase/functions/vd-draw-item/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Seeded PRNG (mulberry32)
function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

// Generate simple 32-bit hash from string seed
function cyrb128(str: string): number[] {
  let h1 = 1779033703, h2 = 3024733117, h3 = 3362453659, h4 = 50249339;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1^h2^h3^h4)>>>0, (h2^h1)>>>0, (h3^h1)>>>0, (h4^h1)>>>0];
}

// Seeded Fisher-Yates Shuffle
function seededShuffle<T>(array: T[], seedStr: string): T[] {
  const shuffled = [...array];
  const seedHash = cyrb128(seedStr)[0];
  const rand = mulberry32(seedHash);
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let event_id: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
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

    // 1. Authenticate user using their JWT via the Supabase Auth client to verify the signature
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const tempServiceClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await tempServiceClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized user JWT: signature verification failed" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = user.id;

    // 2. Load the event and session using service role client
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const [eventResult, sessionResult] = await Promise.all([
      serviceClient.from("vd_events").select("created_by, status, select_count, seed").eq("id", event_id).single(),
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

    let currentStatus = event.status;
    let seed = event.seed;

    // 3. Activation Phase: Pre-generate deterministic selection orders if currently scheduled
    if (currentStatus === "scheduled") {
      console.log(`[Activation] Initializing deterministic seed and shuffling for event ${event_id}`);
      
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      seed = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { data: allItems, error: loadAllError } = await serviceClient
        .from("vd_event_items")
        .select("id, item_value")
        .eq("event_id", event_id)
        .order("display_order", { ascending: true });

      if (loadAllError || !allItems || allItems.length === 0) {
        return new Response(
          JSON.stringify({ error: "Failed to load event items for initialization" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const shuffledItems = seededShuffle(allItems, seed);

      const updates = shuffledItems.map((item, index) => 
        serviceClient
          .from("vd_event_items")
          .update({ selection_order: index + 1 })
          .eq("id", item.id)
      );

      const updateResults = await Promise.all(updates);
      const updateError = updateResults.find(r => r.error);
      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to pre-assign deterministic selection orders" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to atomically activate the event status from scheduled to active
      const { data: updatedEvents, error: eventActiveError } = await serviceClient
        .from("vd_events")
        .update({
          status: "active",
          seed: seed,
          updated_by: userId,
        })
        .eq("id", event_id)
        .eq("status", "scheduled")
        .select();

      if (eventActiveError) {
        return new Response(
          JSON.stringify({ error: "Failed to transition event to active state" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!updatedEvents || updatedEvents.length === 0) {
        return new Response(
          JSON.stringify({ error: "Draw event was already activated or is currently being run" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      currentStatus = "active";
    }

    // 4. Fetch unselected items for this event (ordered by display_order to match client wheel)
    const { data: remainingItems, error: itemsError } = await serviceClient
      .from("vd_event_items")
      .select("id, item_value, selection_order")
      .eq("event_id", event_id)
      .eq("is_selected", false)
      .order("display_order", { ascending: true });

    if (itemsError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch items" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!remainingItems || remainingItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "No unselected items remaining in this draw" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Select the next item deterministically by minimum selection_order
    const sortedByOrder = [...remainingItems].sort(
      (a, b) => (a.selection_order || 0) - (b.selection_order || 0)
    );
    const selectedItem = sortedByOrder[0];

    if (!selectedItem || selectedItem.selection_order == null) {
      return new Response(
        JSON.stringify({ error: "Deterministic selection order is corrupted or missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nextOrder = selectedItem.selection_order;

    // 6. Update the selected item in the database
    const { error: updateItemError } = await serviceClient
      .from("vd_event_items")
      .update({
        is_selected: true,
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

    // 7. Calculate target spin angle matching display_order indices
    const randomIndex = remainingItems.findIndex(i => i.id === selectedItem.id);
    const N = remainingItems.length;
    const sliceAngle = 360 / N;
    const spinDuration = 4000;
    const targetBaseAngle = (randomIndex * sliceAngle) + Math.random() * (sliceAngle - 2);
    
    const lastAngle = Number(session?.last_spin_angle || 0);
    const K = Math.ceil((lastAngle + 1800 - targetBaseAngle) / 360);
    const targetAngle = 360 * K + targetBaseAngle;

    // 8. Update the event session state
    const { error: sessionErrorUpdate } = await serviceClient
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

    if (sessionErrorUpdate) {
      return new Response(
        JSON.stringify({ error: "Failed to update draw session state" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Check if we've completed the selection targets
    const isAllSelected = nextOrder >= event.select_count || remainingItems.length === 1;
    if (isAllSelected) {
      await serviceClient
        .from("vd_events")
        .update({
          status: "completed",
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
