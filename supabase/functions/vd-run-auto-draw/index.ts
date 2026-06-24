// supabase/functions/vd-run-auto-draw/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-veridraw-cron-secret",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startTime = Date.now();
  const MAX_EXECUTION_TIME_MS = 120000; // 2-minute safety limit to prevent Edge Function timeout

  let event_id: string | undefined;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

    if (!supabaseUrl || !supabaseServiceKey || !cronSecret) {
      return new Response(
        JSON.stringify({ error: "Missing environment variables on server (including CRON_SECRET)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Parse JSON Body
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
      .select("id, status, select_count, scheduled_start_time")
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
      // Decode JWT if Authorization header exists to see if the caller is the host (creator)
      const authHeader = req.headers.get("Authorization");
      let userId: string | null = null;
      if (authHeader) {
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
          console.error("JWT Decode error in vd-run-auto-draw:", e);
        }
      }

      const isHost = userId && event.created_by === userId;

      if (!isHost) {
        const scheduledTime = new Date(event.scheduled_start_time).getTime();
        const currentTime = Date.now();
        const DRIFT_TOLERANCE_MS = 60000; // 60 seconds tolerance to absorb device clock discrepancies

        if (currentTime < scheduledTime - DRIFT_TOLERANCE_MS) {
          return new Response(
            JSON.stringify({ error: "Forbidden: This drawing event has not reached its scheduled start time yet." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 4. Activate event if it is currently scheduled (atomic check-and-set to prevent parallel loops)
    if (event.status === "scheduled") {
      console.log(`Activating scheduled event: ${event_id}`);
      const { data: updateData, error: activateError } = await serviceClient
        .from("vd_events")
        .update({
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", event_id)
        .eq("status", "scheduled")
        .select("id");

      if (activateError) {
        throw new Error(`Failed to activate event status: ${activateError.message}`);
      }

      // If no rows were updated, it means another request won the race
      if (!updateData || updateData.length === 0) {
        console.log(`Event ${event_id} was already activated by another concurrent request.`);
        return new Response(
          JSON.stringify({ success: true, message: "Draw event is already being activated by another instance." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Starting auto-draw process for event ${event_id}. Target count: ${event.select_count}`);

    // 3. Load currently selected items count
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

    // 4. Load remaining unselected items
    const { data: unselectedItems, error: unselectedError } = await serviceClient
      .from("vd_event_items")
      .select("id, item_value")
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
        
        // Spawn parallel execution for remaining items (fire-and-forget call)
        fetch(req.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-veridraw-cron-secret": cronSecret,
          },
          body: JSON.stringify({ event_id }),
        }).catch((err) => console.error("Failed to self-trigger resume:", err));

        // Sleep 150ms to guarantee network dispatch before this instance freezes
        await new Promise((resolve) => setTimeout(resolve, 150));

        return new Response(
          JSON.stringify({ success: true, message: "Safety execution limit reached. Spawned resuming execution." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const randomIndex = Math.floor(Math.random() * remainingItems.length);
      const selectedItem = remainingItems[randomIndex];
      currentOrder++;

      console.log(`Round ${currentOrder}: Selected "${selectedItem.item_value}"`);

      // A. Update item status to selected
      const { error: updateItemError } = await serviceClient
        .from("vd_event_items")
        .update({
          is_selected: true,
          selection_order: currentOrder,
          selected_at: new Date().toISOString(),
        })
        .eq("id", selectedItem.id);

      if (updateItemError) {
        throw new Error(`Failed to select item: ${updateItemError.message}`);
      }

      // B. Update event live session status to 'spinning'
      const N = remainingItems.length;
      const sliceAngle = 360 / N;
      const spinDuration = 4000;
      
      // Calculate target angle to align selected slice with indicator pointer
      const targetBaseAngle = (randomIndex * sliceAngle) + Math.random() * (sliceAngle - 2);
      
      // Make target angle cumulative (at least 5 revolutions from last spin angle)
      const K = Math.ceil((lastAngle + 1800 - targetBaseAngle) / 360);
      const targetAngle = 360 * K + targetBaseAngle;
      lastAngle = targetAngle;

      const { error: sessionSpinError } = await serviceClient
        .from("vd_event_sessions")
        .update({
          current_status: "spinning",
          active_winner_id: selectedItem.id,
          spin_start_time: new Date().toISOString(),
          spin_duration_ms: spinDuration,
          last_spin_angle: targetAngle,
        })
        .eq("event_id", event_id);

      if (sessionSpinError) {
        throw new Error(`Failed to initiate spin state: ${sessionSpinError.message}`);
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

    // 5. Complete Draw Event
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
