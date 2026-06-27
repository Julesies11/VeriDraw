import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { drawApi, type EventSessionRow } from '@/api/draw';
import { eventsApi, type EventItemRow, type EventRow } from '@/api/events';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface DrawSessionHookProps {
  slugOrId: string;
  onSpinTriggered?: (targetAngle: number, durationMs: number, winnerId: string) => void;
  onSpinStarted?: () => void;
  onReactionReceived?: (type: string) => void;
}

export function useDrawSession({ slugOrId, onSpinTriggered, onSpinStarted, onReactionReceived }: DrawSessionHookProps) {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<EventItemRow[]>([]);
  const [session, setSession] = useState<EventSessionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerCount, setViewerCount] = useState(1);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isInitialLoadRef = useRef(true);

  // Load initial data
  const loadInitialData = useCallback(async () => {
    try {
      if (isInitialLoadRef.current) {
        setLoading(true);
      }
      const eventData = await eventsApi.getBySlugOrId(slugOrId);
      if (!eventData) {
        setEvent(null);
        setItems([]);
        setSession(null);
        return;
      }
      
      const eventId = eventData.id;
      const [itemsData, sessionData] = await Promise.all([
        eventsApi.listItems(eventId),
        drawApi.getSession(eventId),
      ]);
      setEvent(eventData);
      setItems(itemsData);
      setSession(sessionData);
    } catch (error) {
      console.error('[useDrawSession Load Error]', error);
    } finally {
      setLoading(false);
      isInitialLoadRef.current = false;
    }
  }, [slugOrId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadInitialData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadInitialData]);

  // Subscribe to real-time updates and broadcast channel
  useEffect(() => {
    if (!event?.id) return;
    const eventId = event.id;

    // 1. Create Supabase Realtime channel
    const channel = supabase.channel(`draw-room:${eventId}`, {
      config: {
        presence: {
          key: eventId,
        },
      },
    });
    channelRef.current = channel;

    // 2. Listen to Broadcast "spin" events for animation sync
    channel.on('broadcast', { event: 'spin' }, (payload: { payload: { targetAngle: number; durationMs: number; winnerId: string } }) => {
      const { targetAngle, durationMs, winnerId } = payload.payload;
      console.log('[Realtime] Broadcast spin event received:', payload);
      if (onSpinTriggered) {
        onSpinTriggered(targetAngle, durationMs, winnerId);
      }
    });

    // Listen to Broadcast "spin-started" event for immediate visual anticipation spin
    channel.on('broadcast', { event: 'spin-started' }, () => {
      console.log('[Realtime] Broadcast spin-started event received');
      if (onSpinStarted) {
        onSpinStarted();
      }
    });

    // Listen to Broadcast "reaction" event for floaty reaction sync
    channel.on('broadcast', { event: 'reaction' }, (payload: { payload: { type: string } }) => {
      const { type } = payload.payload;
      console.log('[Realtime] Broadcast reaction received:', type);
      if (onReactionReceived) {
        onReactionReceived(type);
      }
    });

    // 3. Listen to DB changes on vd_event_sessions to update session state
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'vd_event_sessions',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        console.log('[Realtime] Session DB update:', payload.new);
        setSession(payload.new as EventSessionRow);
      }
    );

    // 4. Listen to DB changes on vd_event_items to update selection state
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'vd_event_items',
        filter: `event_id=eq.${eventId}`,
      },
      (payload) => {
        console.log('[Realtime] Items DB change:', payload.eventType);
        if (payload.eventType === 'INSERT') {
          const newItem = payload.new as EventItemRow;
          setItems((prev) => {
            const exists = prev.some((item) => item.id === newItem.id);
            if (exists) return prev;
            return [...prev, newItem].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
          });
        } else if (payload.eventType === 'UPDATE') {
          const updatedItem = payload.new as EventItemRow;
          setItems((prev) =>
            prev.map((item) => (item.id === updatedItem.id ? { ...item, ...updatedItem } : item))
          );
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setItems((prev) => prev.filter((item) => item.id !== deletedId));
          }
        }
      }
    );

    // 5. Listen to DB changes on vd_events to update event state
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'vd_events',
        filter: `id=eq.${eventId}`,
      },
      (payload) => {
        console.log('[Realtime] Event DB update:', payload.new);
        setEvent(payload.new as EventRow);
      }
    );

    // 6. Setup Presence for tracking viewer count
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        // Count total presences (multiple tabs from same user count as separate viewers)
        let totalViewers = 0;
        Object.keys(state).forEach((key) => {
          totalViewers += state[key].length;
        });
        setViewerCount(totalViewers > 0 ? totalViewers : 1);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('[Presence] User joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('[Presence] User left:', leftPresences);
      });

    // 7. Subscribe to the channel
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Subscribed to room:', eventId);
        // Track presence
        const { data: { user } } = await supabase.auth.getUser();
        await channel.track({
          online_at: new Date().toISOString(),
          user_id: user?.id || 'anonymous',
          name: user?.user_metadata?.display_name || 'Anonymous Viewer',
        });
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [event?.id, onSpinTriggered, onSpinStarted, onReactionReceived]);

  /**
   * Broadcasts the spin details to all connected room viewers.
   */
  const broadcastSpin = (targetAngle: number, durationMs: number, winnerId: string) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'spin',
        payload: { targetAngle, durationMs, winnerId },
      });
      console.log('[Realtime] Broadcasted spin event:', { targetAngle, durationMs, winnerId });
    }
  };

  /**
   * Broadcasts the spin-start signal to all connected room viewers.
   */
  const broadcastSpinStart = () => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'spin-started',
        payload: {},
      });
      console.log('[Realtime] Broadcasted spin-started event');
    }
  };

  /**
   * Broadcasts an audience reaction to all connected room viewers.
   */
  const broadcastReaction = (type: string) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { type },
      });
      console.log('[Realtime] Broadcasted reaction:', type);
    }
  };

  return {
    event,
    items,
    session,
    loading,
    viewerCount,
    broadcastSpin,
    broadcastSpinStart,
    broadcastReaction,
    refetch: loadInitialData,
  };
}
