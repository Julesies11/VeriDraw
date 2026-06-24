import { supabase } from '@/lib/supabase';
import { TABLES } from '@/config/db-tables';
import type { Database } from '@/models/database.types';

export type EventSessionRow = Database['public']['Tables']['vd_event_sessions']['Row'];

export const drawApi = {
  /**
   * Fetch current session coordination state.
   */
  async getSession(eventId: string): Promise<EventSessionRow | null> {
    const { data, error } = await supabase
      .from(TABLES.EVENT_SESSIONS)
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Triggers a server-side random draw via the vd-draw-item Edge Function.
   */
  async drawItem(eventId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const { data, error } = await supabase.functions.invoke('vd-draw-item', {
      body: { event_id: eventId },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (error) throw error;
    return data; // returns selected item info, target_angle, spin_duration_ms, etc.
  },

  /**
   * Triggers a server-side auto-draw loop via the vd-run-auto-draw Edge Function.
   * This is invoked anonymously by spectator clients when a countdown finishes.
   */
  async triggerAutoDraw(eventId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const { data, error } = await supabase.functions.invoke('vd-run-auto-draw', {
      body: { event_id: eventId },
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (error) throw error;
    return data;
  },

  /**
   * Reset session status to idle and set landed winner to null.
   */
  async updateSessionStatus(eventId: string, status: 'idle' | 'spinning' | 'landed', winnerId?: string | null) {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user ? user.id : null;

    const { error } = await supabase
      .from(TABLES.EVENT_SESSIONS)
      .update({
        current_status: status,
        ...(winnerId !== undefined ? { active_winner_id: winnerId } : {}),
        updated_by: userId,
      })
      .eq('event_id', eventId);

    if (error) throw error;
  },

  /**
   * Reset a drawing event. Sets all items back to unselected, resets events status to scheduled,
   * and resets the event session.
   */
  async resetEvent(eventId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user ? user.id : null;

    // 1. Reset event items state
    const { error: itemsError } = await supabase
      .from(TABLES.EVENT_ITEMS)
      .update({
        is_selected: false,
        selection_order: null,
        selected_at: null,
        updated_by: userId,
      })
      .eq('event_id', eventId);

    if (itemsError) throw itemsError;

    // 2. Reset event status
    const { error: eventError } = await supabase
      .from(TABLES.EVENTS)
      .update({
        status: 'scheduled',
        updated_by: userId,
      })
      .eq('id', eventId);

    if (eventError) throw eventError;

    // 3. Reset session state
    const { error: sessionError } = await supabase
      .from(TABLES.EVENT_SESSIONS)
      .update({
        current_status: 'idle',
        active_winner_id: null,
        spin_start_time: null,
        last_spin_angle: 0,
        updated_by: userId,
      })
      .eq('event_id', eventId);

    if (sessionError) throw sessionError;

    return true;
  },

  /**
   * Update the status of an event.
   */
  async updateEventStatus(eventId: string, status: 'scheduled' | 'active' | 'completed') {
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user ? user.id : null;

    const { error } = await supabase
      .from(TABLES.EVENTS)
      .update({
        status,
        updated_by: userId,
      })
      .eq('id', eventId);

    if (error) throw error;
  },
};
