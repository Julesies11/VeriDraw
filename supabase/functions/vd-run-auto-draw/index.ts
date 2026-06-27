// supabase/functions/vd-run-auto-draw/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-veridraw-cron-secret",
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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const MAX_EXECUTION_TIME_MS = 120000; // 2-minute safety limit

  let event_id: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !cronSecret) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables on server (including CRON_SECRET)." }),
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

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // 2. Fetch event metadata
    const { data: event, error: eventError } = await serviceClient
      .from("vd_events")
      .select("id, status, select_count, scheduled_start_time, created_by, seed")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Authenticate and Validate transition variables
    const receivedSecret = req.headers.get("x-veridraw-cron-secret");
    const isSystemCron = receivedSecret === cronSecret;

    // Check if event is already completed
    if (event.status === "completed") {
      return new Response(
        JSON.stringify({ success: true, message: "Draw event is already completed." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Concurrency Guard: if spectator calls the active draw, return immediately to prevent parallel execution loops
    if (event.status === "active" && !isSystemCron) {
      return new Response(
        JSON.stringify({ success: true, message: "Draw event is already active and running." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side Clock-drift Tolerance check for public activation requests
    if (!isSystemCron) {
      const authHeader = req.headers.get("Authorization");
      let userId: string | null = null;
      if (authHeader) {
        try {
          const token = authHeader.replace(/^bearer\s+/i, "");
          const tempServiceClient = createClient(supabaseUrl, supabaseAnonKey);
          const { data: { user }, error: authError } = await tempServiceClient.auth.getUser(token);
          if (!authError && user) {
            userId = user.id;
          }
        } catch (e) {
          console.error("JWT verification error in vd-run-auto-draw:", e);
        }
      }

      const isHost = userId && event.created_by === userId;

      if (!isHost) {
        const scheduledTime = new Date(event.scheduled_start_time).getTime();
        const currentTime = Date.now();
        const DRIFT_TOLERANCE_MS = 60000;

        if (currentTime < scheduledTime - DRIFT_TOLERANCE_MS) {
          return new Response(
            JSON.stringify({ error: "Forbidden: This drawing event has not reached its scheduled start time yet." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    let seed = event.seed;

    // 4. Activation Phase: Pre-generate deterministic selection orders if currently scheduled
    if (event.status === "scheduled") {
      console.log(`[Activation] Initializing deterministic seed and shuffling for event ${event_id}`);
      
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      seed = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Fetch all items
      const { data: allItems, error: loadAllError } = await serviceClient
        .from("vd_event_items")
        .select("id, item_value")
        .eq("event_id", event_id)
        .order("display_order", { ascending: true });

      if (loadAllError || !allItems || allItems.length === 0) {
        throw new Error(`Failed to load event items for initialization: ${loadAllError?.message}`);
      }

      // Shuffle deterministically
      const shuffledItems = seededShuffle(allItems, seed);

      // Save order
      const updates = shuffledItems.map((item, index) => 
        serviceClient
          .from("vd_event_items")
          .update({ selection_order: index + 1 })
          .eq("id", item.id)
      );

      const updateResults = await Promise.all(updates);
      const updateError = updateResults.find(r => r.error);
      if (updateError) {
        throw new Error(`Failed to save deterministic selection orders: ${updateError.error?.message}`);
      }

      // Update event status to active (atomic status transition check)
      const { data: updatedEvents, error: activateError } = await serviceClient
        .from("vd_events")
        .update({
          status: "active",
          seed: seed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", event_id)
        .eq("status", "scheduled")
        .select();

      if (activateError) {
        throw new Error(`Failed to activate event status: ${activateError.message}`);
      }

      if (!updatedEvents || updatedEvents.length === 0) {
        console.log(`[Concurrency] Event ${event_id} was already activated by another runner. Aborting execution loop.`);
        return new Response(
          JSON.stringify({ success: true, message: "Draw event was already activated and is being run by another process." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Starting auto-draw process for event ${event_id}. Target count: ${event.select_count}`);

    // 5. Load currently selected items count
    const { data: selectedItems, error: selectedError } = await serviceClient
      .from("vd_event_items")
      .select("id, selection_order")
      .eq("event_id", event_id)
      .eq("is_selected", true);

    if (selectedError) {
      throw new Error(`Failed to load selected items: ${selectedError.message}`);
    }

    let currentOrder = selectedItems ? selectedItems.length : 0;
    const targetCount = event.select_count;

    // 6. Load remaining unselected items (ordered by display_order for wheel alignment index mapping)
    const { data: unselectedItems, error: unselectedError } = await serviceClient
      .from("vd_event_items")
      .select("id, item_value, selection_order")
      .eq("event_id", event_id)
      .eq("is_selected", false)
      .order("display_order", { ascending: true });

    if (unselectedError) {
      throw new Error(`Failed to load unselected items: ${unselectedError.message}`);
    }

    let remainingItems = unselectedItems || [];

    // Load initial session state to get last_spin_angle
    const { data: initialSession, error: initialSessionError } = await serviceClient
      .from("vd_event_sessions")
      .select("last_spin_angle")
      .eq("event_id", event_id)
      .single();

    if (initialSessionError) {
      throw new Error(`Failed to load initial session state: ${initialSessionError.message}`);
    }

    let lastAngle = Number(initialSession?.last_spin_angle || 0);

    // Loop through drawing process
    while (currentOrder < targetCount && remainingItems.length > 0) {
      // Fetch latest event status to ensure it hasn't been reset or completed by another process
      const { data: currentEvent, error: statusError } = await serviceClient
        .from("vd_events")
        .select("status")
        .eq("id", event_id)
        .single();

      if (statusError || !currentEvent || currentEvent.status !== "active") {
        console.log(`Event ${event_id} status is no longer active (status: ${currentEvent?.status}). Terminating auto-draw loop.`);
        break;
      }

      // Check execution time limit to prevent function timeout
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
        console.log("Approaching Edge Function execution limit. Triggering self-resume call.");
        
        fetch(req.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-veridraw-cron-secret": cronSecret,
          },
          body: JSON.stringify({ event_id }),
        }).catch((err) => console.error("Failed to self-trigger resume:", err));

        await new Promise((resolve) => setTimeout(resolve, 150));

        return new Response(
          JSON.stringify({ success: true, message: "Safety execution limit reached. Spawned resuming execution." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Select next item deterministically by selection_order
      const sortedByOrder = [...remainingItems].sort(
        (a, b) => (a.selection_order || 0) - (b.selection_order || 0)
      );
      const selectedItem = sortedByOrder[0];

      if (!selectedItem || selectedItem.selection_order == null) {
        throw new Error("Deterministic selection order is corrupted or missing inside loop");
      }

      currentOrder = selectedItem.selection_order;
      console.log(`Round ${currentOrder}: Selected "${selectedItem.item_value}" (deterministic)`);

      // A. Update item status to selected
      const { error: updateItemError } = await serviceClient
        .from("vd_event_items")
        .update({
          is_selected: true,
          selected_at: new Date().toISOString(),
        })
        .eq("id", selectedItem.id);

      if (updateItemError) {
        throw new Error(`Failed to select item: ${updateItemError.message}`);
      }

      // B. Update event live session status to 'spinning'
      const randomIndex = remainingItems.findIndex(i => i.id === selectedItem.id);
      const N = remainingItems.length;
      const sliceAngle = 360 / N;
      const spinDuration = 4000;
      
      const targetBaseAngle = (randomIndex * sliceAngle) + Math.random() * (sliceAngle - 2);
      
      const K = Math.ceil((lastAngle + 1800 - targetBaseAngle) / 360);
      const targetAngle = 360 * K + targetBaseAngle;
      lastAngle = targetAngle;

      const { data: updatedSessions, error: sessionSpinError } = await serviceClient
        .from("vd_event_sessions")
        .update({
          current_status: "spinning",
          active_winner_id: selectedItem.id,
          spin_start_time: new Date().toISOString(),
          spin_duration_ms: spinDuration,
          last_spin_angle: targetAngle,
        })
        .eq("event_id", event_id)
        .in("current_status", ["idle", "landed"])
        .select();

      if (sessionSpinError) {
        throw new Error(`Failed to initiate spin state: ${sessionSpinError.message}`);
      }

      if (!updatedSessions || updatedSessions.length === 0) {
        console.log(`[Concurrency] Session for event ${event_id} was already updated. Aborting auto-draw loop.`);
        break;
      }

      // C. Sleep for spin duration (4 seconds)
      await new Promise((resolve) => setTimeout(resolve, spinDuration));

      // D. Update session status to 'landed' (confetti and banner reveal)
      const { error: sessionLandError } = await serviceClient
        .from("vd_event_sessions")
        .update({
          current_status: "landed",
        })
        .eq("event_id", event_id);

      if (sessionLandError) {
        throw new Error(`Failed to land spin state: ${sessionLandError.message}`);
      }

      // E. Sleep for winner banner display duration (2.5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // F. Remove item from remaining local list
      remainingItems = remainingItems.filter(item => item.id !== selectedItem.id);
    }

    // 7. Complete Draw Event
    console.log(`Auto-draw complete for event ${event_id}. Marking completed.`);

    const { error: completeEventError } = await serviceClient
      .from("vd_events")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", event_id);

    if (completeEventError) {
      throw new Error(`Failed to complete event status: ${completeEventError.message}`);
    }

    const { error: idleSessionError } = await serviceClient
      .from("vd_event_sessions")
      .update({
        current_status: "idle",
        active_winner_id: null,
      })
      .eq("event_id", event_id);

    if (idleSessionError) {
      throw new Error(`Failed to reset session status: ${idleSessionError.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "Draw event completed successfully." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`[vd-run-auto-draw Error]`, error);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (supabaseUrl && supabaseServiceKey) {
        const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
        await serviceClient.from("vd_error_logs").insert({
          error_message: error.message || String(error),
          error_stack: error.stack,
          context: { function: "vd-run-auto-draw", event_id }
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
