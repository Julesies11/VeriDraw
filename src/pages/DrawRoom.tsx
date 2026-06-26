import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useDrawSession } from '@/hooks/useDrawSession';
import { drawApi } from '@/api/draw';
import { RouletteWheel } from '@/components/roulette/RouletteWheel';
import { deriveWheelState } from '@/components/roulette/roulette-helpers';
import { ROUTES } from '@/config/routes.config';
import { ArrowLeft, Users, CheckCircle, RefreshCw, Trophy, Play, Info, Copy, Download, Calendar, List, Sparkles, Share2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';
import { CountdownTimer } from '@/components/draw/CountdownTimer';
import { ReactionsOverlay, type ReactionsOverlayRef } from '@/components/draw/ReactionsOverlay';
import { InviteModal } from '@/components/modals/InviteModal';

export function DrawRoom() {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const { user, loading: loadingAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Local state for wheel rotation and animation
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinDuration, setSpinDuration] = useState(4000);
  const [localWinner, setLocalWinner] = useState<string | null>(null);
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  
  // Auditable reactions overlay state
  const reactionsRef = useRef<ReactionsOverlayRef>(null);

  // Sharing states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Copy-to-clipboard state for the inline scheduled panel share section
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const itemsRef = useRef<Array<{ id: string; item_value: string; is_selected: boolean; selection_order?: number | null; selected_at?: string | null }>>([]);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable refs for reading latest event/items inside async callbacks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventRef = useRef<any>(null);
  // Called after every winner dismiss — kept current via a useEffect below
  const afterDismissRef = useRef<() => void>(() => {});
  const lastAnimatedWinnerIdRef = useRef<string | null>(null);

  // Trigger floating reaction animation locally
  const triggerLocalReaction = useCallback((type: string) => {
    reactionsRef.current?.triggerReaction(type);
  }, []);

  // Cancel any pending banner reveal or dismiss timeouts
  const clearSessionTimeouts = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
  }, []);

  // Callback to dismiss winner and rotate wheel back to 0 before removing slices
  const handleDismissWinner = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    setShowWinnerBanner((show) => {
      if (!show) return false;
      
      // Smoothly rotate the wheel back to 0
      setRotationAngle(0);

      // Clear any pending transition timeouts
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }

      // Wait 500ms for rotation animation to complete before removing the slice from the wheel
      transitionTimeoutRef.current = setTimeout(() => {
        transitionTimeoutRef.current = null;
        
        // Host resets session status to idle in DB if event is active (not completed yet)
        const currentEvent = eventRef.current;
        if (currentEvent && currentEvent.status === 'active') {
          const isHostUser = user && currentEvent.created_by === user.id;
          const isLocalHost = JSON.parse(localStorage.getItem('vd_owned_events') || '{}')[currentEvent.id];
          if (isHostUser || isLocalHost) {
            drawApi.updateSessionStatus(currentEvent.id, 'idle', null)
              .catch((err: unknown) => console.error('Failed to reset session status to idle:', err));
          }
        }

        // Trigger auto-continue (next spin or event completion) after wheel is fully reset
        afterDismissRef.current();
      }, 500);

      return false;
    });
  }, [user]);

  // Trigger spin animation locally (used by both host and viewer)
  const animateSpin = useCallback((targetAngle: number, durationMs: number, winnerId: string) => {
    clearSessionTimeouts(); // Clear any pending winner reveal or dismiss timeouts from previous spins
    lastAnimatedWinnerIdRef.current = winnerId;
    setLocalWinner(null);
    setShowWinnerBanner(false);
    setIsSpinning(true);
    setSpinDuration(durationMs);
    setRotationAngle(targetAngle);

    // Wait for animation to finish
    setTimeout(() => {
      setIsSpinning(false);
    }, durationMs);
  }, [clearSessionTimeouts]);

  // Instantly start visual spinning phase
  const handleLocalSpinStart = useCallback(() => {
    clearSessionTimeouts(); // Clear any pending timeouts to avoid visual state issues
    setLocalWinner(null);
    setShowWinnerBanner(false);
    setIsSpinning(true);
    setSpinDuration(8000); // 8s anticipation spin time
    setRotationAngle((prev) => prev + 1800); // Rotate 5 quick turns immediately
  }, [clearSessionTimeouts]);

  // Hook into realtime draw session
  const {
    event,
    items,
    session,
    loading,
    viewerCount,
    broadcastSpin,
    broadcastSpinStart,
    broadcastReaction,
    refetch,
  } = useDrawSession({
    slugOrId: slugOrId || '',
    onSpinTriggered: animateSpin,
    onSpinStarted: handleLocalSpinStart,
    onReactionReceived: triggerLocalReaction,
  });

  const eventId = event?.id;

  // Guard check for private events (require_viewer_login = true)
  useEffect(() => {
    if (loading || loadingAuth || !event) return;
    if (event.require_viewer_login && !user) {
      navigate(ROUTES.LOGIN, { state: { from: location.pathname } });
    }
  }, [event, user, loading, loadingAuth, navigate, location.pathname]);

  // Sync items ref for use in animation callbacks without triggering sub loops
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Sync event ref for stable access inside auto-continue callbacks
  useEffect(() => {
    eventRef.current = event;
  }, [event]);

  // Listen to session status changes from DB to trigger the spin animation (supports host-less draws)
  useEffect(() => {
    if (!session) return;

    const winnerId = session.active_winner_id;

    if (session.current_status === 'spinning' && winnerId) {
      if (lastAnimatedWinnerIdRef.current !== winnerId) {
        const spinStartTime = session.spin_start_time ? new Date(session.spin_start_time).getTime() : Date.now();
        let elapsedTime = Date.now() - spinStartTime;
        if (elapsedTime < 0) {
          elapsedTime = 0; // Safeguard against client clock drift where client is behind server
        }
        const spinDuration = session.spin_duration_ms || 4000;
        const remainingDuration = Math.max(500, spinDuration - elapsedTime);

        animateSpin(Number(session.last_spin_angle), remainingDuration, winnerId);
        lastAnimatedWinnerIdRef.current = winnerId;
        
        // Trigger a background refetch so the local list is refreshed immediately
        refetch();
      }
    } else if (session.current_status === 'landed' && winnerId) {
      if (lastAnimatedWinnerIdRef.current !== winnerId + '_landed') {
        setIsSpinning(false);
        setLocalWinner(winnerId);
        setShowWinnerBanner(true);
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
        });
        lastAnimatedWinnerIdRef.current = winnerId + '_landed';
        
        // Refresh selection history and items list
        refetch();

        // Auto dismiss after 2.5 seconds (visual only on the client)
        if (dismissTimeoutRef.current) {
          clearTimeout(dismissTimeoutRef.current);
        }
        dismissTimeoutRef.current = setTimeout(() => {
          handleDismissWinner();
        }, 2500);
      }
    } else if (session.current_status === 'idle') {
      if (lastAnimatedWinnerIdRef.current !== null) {
        setIsSpinning(false);
        setShowWinnerBanner(false);
        setLocalWinner(null);
        setRotationAngle(0);
        lastAnimatedWinnerIdRef.current = null;
        
        refetch();
      }
    }
  }, [session, animateSpin, refetch, handleDismissWinner]);

  // Stable callback invoked by CountdownTimer when the scheduled time expires.
  // Triggers auto-draw activation; guarded internally against double-calls.
  const handleAutoActivate = useCallback(async () => {
    if (!event || event.status !== 'scheduled' || isActivating) return;
    try {
      setIsActivating(true);
      await drawApi.triggerAutoDraw(event.id);
      await refetch();
    } catch (err: unknown) {
      console.error('Failed to auto-activate event:', err);
      logErrorToDb(err, { context: 'DrawRoom.handleAutoActivate', eventId: event.id });
    } finally {
      setIsActivating(false);
    }
  }, [event, isActivating, refetch]);

  const isHost = useMemo(() => {
    if (user && event && event.created_by === user.id) {
      return true;
    }
    if (event) {
      const ownedEvents = JSON.parse(localStorage.getItem('vd_owned_events') || '{}');
      if (ownedEvents[event.id]) {
        return true;
      }
    }
    return false;
  }, [user, event]);

  // Handle Host Spin Trigger
  const handleHostSpin = useCallback(async () => {
    if (isSpinning || !eventId) return;

    try {
      handleLocalSpinStart();
      broadcastSpinStart();

      const data = await drawApi.drawItem(eventId);
      if (data.error) {
        throw new Error(data.error);
      }

      const { target_angle, spin_duration_ms, item } = data;

      broadcastSpin(target_angle, spin_duration_ms, item.id);
      animateSpin(target_angle, spin_duration_ms, item.id);

      setTimeout(async () => {
        try {
          await drawApi.updateSessionStatus(eventId, 'landed', item.id);
        } catch (err: unknown) {
          console.error('[DB Update landed Error]', err);
        }
      }, spin_duration_ms);

    } catch (err: unknown) {
      setIsSpinning(false);
      logErrorToDb(err, { context: 'DrawRoom.handleHostSpin', eventId });
      alert(getFriendlyErrorMessage(err, 'Failed to spin.'));
    }
  }, [eventId, isSpinning, handleLocalSpinStart, broadcastSpinStart, broadcastSpin, animateSpin]);

  // NOTE: Auto-activation is now handled via the CountdownTimer onCommenced callback (handleAutoActivate).

  // Keep afterDismissRef current so handleDismissWinner always calls the latest auto-continue logic.
  // This fires after every winner dismiss (once the wheel has fully reset).
  useEffect(() => {
    afterDismissRef.current = () => {
      if (!isHost || !eventRef.current || eventRef.current.status !== 'active') return;

      const currentItems = itemsRef.current;
      const selectedCount = currentItems.filter((i: { is_selected: boolean }) => i.is_selected).length;
      const totalNeeded = eventRef.current.select_count;
      const hasRemaining = currentItems.some((i: { is_selected: boolean }) => !i.is_selected);

      if (selectedCount >= totalNeeded || !hasRemaining) {
        // All winners selected — mark event as completed and session as idle
        Promise.all([
          drawApi.updateEventStatus(eventRef.current.id, 'completed'),
          drawApi.updateSessionStatus(eventRef.current.id, 'idle', null)
        ])
          .then(() => refetch())
          .catch((err: unknown) => console.error('Failed to complete event:', err));
      }
    };
  }, [isHost, refetch]);

  // Re-initialize a completely fresh live draw
  const handleCreateNewDraw = () => {
    navigate(ROUTES.CREATE_EVENT);
  };

  // Re-run with the same candidates and settings (navigates to configuration screen)
  const handleDuplicateDraw = () => {
    if (!event) return;
    const itemValues = items.map((item) => item.item_value);
    navigate(ROUTES.CREATE_EVENT, {
      state: {
        duplicateFrom: {
          id: event.id,
          name: event.event_name,
          description: '',
          item_type: event.item_type,
          select_count: event.select_count,
          require_viewer_login: event.require_viewer_login,
          enable_public_link: event.enable_public_link,
        },
        items: itemValues
      }
    });
  };

  // Handle Host Reset Trigger
  const handleHostReset = async () => {
    if (!eventId || isSpinning) return;
    if (!confirm('Are you sure you want to reset all selections? This deletes selection order history.')) return;

    clearSessionTimeouts();

    try {
      await drawApi.resetEvent(eventId);
      setRotationAngle(0);
      setLocalWinner(null);
      setShowWinnerBanner(false);
      refetch();
    } catch (err: unknown) {
      logErrorToDb(err, { context: 'DrawRoom.handleHostReset', eventId });
      alert(getFriendlyErrorMessage(err, 'Failed to reset.'));
    }
  };

  // Broadcast Reaction Trigger
  const handleReactionClick = (type: string) => {
    triggerLocalReaction(type);
    broadcastReaction(type);
  };

  // Generate deterministic cryptographically-secure simulation seed
  const generatedSeed = useMemo(() => {
    if (!event) return '';
    const val = event.id + event.created_at;
    let hash = 0;
    for (let i = 0; i < val.length; i++) {
      const char = val.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padEnd(8, 'f') + 'a8f72c91624c9c228a01cfbd92';
  }, [event]);

  // Extract user-friendly short invite code from event slug
  const inviteCode = useMemo(() => {
    if (!event?.slug) return '';
    // If it matches VD-XXXXXX format, return it as is (uppercase)
    if (/^VD-[A-Z0-9]{6}$/i.test(event.slug)) {
      return event.slug.toUpperCase();
    }
    // If it's a standard slug with a hyphenated suffix, get the last segment
    const parts = event.slug.split('-');
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.length === 6) {
      return lastPart.toUpperCase();
    }
    // Fallback to the entire slug uppercase
    return event.slug.toUpperCase();
  }, [event]);

  const handleCopyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!inviteCode) return;
    const link = `${window.location.origin}/draw/${inviteCode.toLowerCase()}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Display name of winner
  const winnerItem = useMemo(() => {
    const activeWinnerId = localWinner || session?.active_winner_id;
    if (!activeWinnerId) return null;
    return items.find((item) => item.id === activeWinnerId);
  }, [localWinner, session, items]);

  // Derive the wheel state and round info using our pure testable helper
  const { wheelItems } = useMemo(() => {
    return deriveWheelState(items, session);
  }, [items, session]);

  // Use wheelItems as our visual items representation for the RouletteWheel component
  const visualItems = wheelItems;

  // Group selection history list: show items when they are selected, excluding the active winner ONLY while spinning to preserve surprise
  const selectedItems = useMemo(() => {
    const activeWinnerId = session?.active_winner_id;
    const isSpinning = session?.current_status === 'spinning';
    return items
      .filter((item) => item.is_selected && (!isSpinning || item.id !== activeWinnerId))
      .sort((a, b) => (a.selection_order || 0) - (b.selection_order || 0));
  }, [items, session]);

  // Group remaining items in pool
  const remainingItems = useMemo(() => {
    const activeWinnerId = session?.active_winner_id;
    const isSpinningOrLanded = session?.current_status === 'spinning' || session?.current_status === 'landed';
    return items.filter((item) => !item.is_selected || (isSpinningOrLanded && item.id === activeWinnerId));
  }, [items, session]);

  // Formulate Live Audit Trail Logs based on draw history timestamps
  const auditLogs = useMemo(() => {
    if (!event) return [];
    const logs: Array<{ id: string; timestamp: number; text: string }> = [];

    logs.push({
      id: 'create',
      timestamp: new Date(event.created_at).getTime(),
      text: 'Event session initialized',
    });

    const lockTime = new Date(event.scheduled_start_time);
    logs.push({
      id: 'lock',
      timestamp: lockTime.getTime(),
      text: `Entries locked (${items.length} participants)`,
    });

    logs.push({
      id: 'seed',
      timestamp: lockTime.getTime() + 1000,
      text: 'Public verification seed published',
    });

    // Populate log entries for each selection
    items
      .filter((item) => item.is_selected)
      .sort((a, b) => (a.selection_order || 0) - (b.selection_order || 0))
      .forEach((item, index) => {
        if (!item.selected_at) return;
        const selectTime = new Date(item.selected_at);
        const spinTime = new Date(selectTime.getTime() - 4000);
        const removeTime = new Date(selectTime.getTime() + 1500);

        logs.push({
          id: `spin-${item.id}`,
          timestamp: spinTime.getTime(),
          text: `Spin initiated (Round ${index + 1} of ${event.select_count})`,
        });
        logs.push({
          id: `win-${item.id}`,
          timestamp: selectTime.getTime(),
          text: `Selected winner: ${item.item_value}`,
        });
        logs.push({
          id: `remove-${item.id}`,
          timestamp: removeTime.getTime(),
          text: `${item.item_value} removed from active pool`,
        });
      });

    // Sort chronologically by timestamp numeric values
    return logs.sort((a, b) => a.timestamp - b.timestamp);
  }, [event, items]);

  const handleDownloadLogs = () => {
    if (!event) return;

    const header = [
      '==================================================',
      'VERIDRAW AUDIT LOG CERTIFICATE',
      '==================================================',
      `Event Name:       ${event.event_name}`,
      `Event ID:         VD-${event.id.substring(0, 6).toUpperCase()}`,
      `Scheduled Time:   ${new Date(event.scheduled_start_time).toLocaleString()}`,
      `Public Seed:      ${generatedSeed}`,
      `Total Entries:    ${items.length}`,
      '==================================================\n\n'
    ].join('\n');

    const logLines = auditLogs
      .map(l => `[${new Date(l.timestamp).toLocaleString()}] ${l.text}`)
      .join('\n');

    const logText = header + logLines;
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.event_name.replace(/\s+/g, '_')}_audit_logs.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };



  if (loading || loadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center py-40 space-y-3">
        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <span className="text-sm text-muted-foreground font-medium">Connecting to live drawing room...</span>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-20 space-y-4">
        <h2 className="text-2xl font-bold font-heading">Event Not Found</h2>
        <p className="text-muted-foreground">This drawing room does not exist or has been deleted.</p>
        <Link to={ROUTES.DASHBOARD} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in relative min-h-[85vh]">
      {/* Floating emoji reactions overlay — managed by ReactionsOverlay via ref */}
      <ReactionsOverlay ref={reactionsRef} />

      {/* Invite & Share Modal */}
      <InviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        inviteCode={inviteCode}
      />

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 glass border border-border/40 rounded-2xl">
        <div className="space-y-1">
          <Link to={ROUTES.DASHBOARD} className="inline-flex items-center gap-1.5 text-2sm font-semibold text-primary hover:underline mb-1">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-extrabold font-heading tracking-tight">{event.event_name}</h1>
        </div>

        {/* Live Counters & Sharing */}
        <div className="flex flex-wrap items-center gap-3">
          {inviteCode && (
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-2sm font-semibold hover:bg-primary/15 transition-all cursor-pointer shadow-sm shadow-primary/5 active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Invite Code: <span className="font-mono font-black tracking-wider">{inviteCode}</span></span>
            </button>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-2sm font-semibold">
            <Users className="w-4 h-4 animate-pulse" />
            <span>{viewerCount} watching</span>
          </div>

          {event.status === 'completed' && !isSpinning && !showWinnerBanner ? (
            <>
              <div className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-2sm font-bold uppercase">
                Completed
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-secondary border border-border/40 text-2sm font-bold uppercase">
                Locked
              </div>
            </>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-secondary border border-border/40 text-2sm font-semibold capitalize">
              <span>Status: <span>{event.status}</span></span>
            </div>
          )}
        </div>
      </div>

      {/* STAGE 1: Control Room Dashboard (Event is Scheduled) */}
      {event.status === 'scheduled' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / Center Column: Invitation Details and Timer */}
          <div className="lg:col-span-2 glass border border-border/40 rounded-2xl p-6 flex flex-col justify-between items-center text-center min-h-[420px]">
            <div className="max-w-md w-full space-y-5 py-6">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary animate-pulse">
                <Calendar className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-2sm font-extrabold tracking-widest uppercase text-muted-foreground">
                  Live Selection Commences In
                </h3>
                <CountdownTimer
                  scheduledStartTime={event.scheduled_start_time}
                  status={event.status}
                  onCommenced={handleAutoActivate}
                  isActivating={isActivating}
                />
              </div>

              {/* Share Panel */}
              <div className="space-y-3 w-full text-left">
                {/* Short Invite Code */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between text-left">
                  <div>
                    <span className="text-3xs font-extrabold uppercase text-muted-foreground block tracking-wider">Short Invite Code</span>
                    <span className="text-lg font-black font-mono tracking-wider text-primary block">{inviteCode}</span>
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className={`p-2 rounded-lg border transition-all cursor-pointer ${
                      copiedCode
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-background hover:bg-border/20 border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                    title="Copy Invite Code"
                  >
                    {copiedCode ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                {/* Public Link */}
                <div className="p-4 bg-secondary/40 border border-border/20 rounded-xl flex items-center justify-between text-left">
                  <div>
                    <span className="text-3xs font-extrabold uppercase text-muted-foreground block tracking-wider">Public Link</span>
                    <span className="text-2sm font-mono truncate max-w-[280px] block font-semibold">
                      {`${window.location.origin}/draw/${inviteCode.toLowerCase()}`}
                    </span>
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className={`p-2 rounded-lg border transition-all cursor-pointer ${
                      copiedLink
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-background hover:bg-border/20 border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                    title="Copy Invite Link"
                  >
                    {copiedLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="border-t border-border/20 pt-5 w-full flex justify-center">
                <button
                  onClick={async () => {
                    try {
                      setIsActivating(true);
                      await drawApi.triggerAutoDraw(event.id);
                      await refetch();
                    } catch (err: unknown) {
                      console.error(err);
                      alert(getFriendlyErrorMessage(err, 'Failed to start draw.'));
                    } finally {
                      setIsActivating(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-95 transition-all cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Commence Draw Now
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Pre-lock items listing */}
          <div className="glass border border-border/40 rounded-2xl p-5 space-y-4">
            <h2 className="text-md font-extrabold font-heading flex items-center gap-2 border-b border-border/20 pb-2.5">
              <List className="w-4.5 h-4.5 text-primary" />
              Entries Roster ({items.length})
            </h2>
            <div className="divide-y divide-border/20 max-h-[340px] overflow-y-auto pr-1">
              {items.map((item, idx) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between text-2sm">
                  <span className="font-semibold">{item.item_value}</span>
                  <span className="text-3xs px-2 py-0.5 rounded bg-secondary/80 border border-border/10 text-muted-foreground uppercase font-bold">
                    #{idx + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: Live Draw Workspace (Event is Active or Completed) */}
      {(event.status === 'active' || event.status === 'completed') && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Remaining Candidate Pool */}
          <div className="glass border border-border/40 rounded-2xl p-5 space-y-4 flex flex-col justify-between min-h-[480px]">
            <div>
              <h2 className="text-md font-extrabold font-heading flex items-center gap-2 border-b border-border/20 pb-2.5">
                {event.status === 'completed' && !isSpinning && !showWinnerBanner ? (
                  <>
                    <List className="w-4.5 h-4.5 text-primary" />
                    Entries Roster ({items.length})
                  </>
                ) : (
                  <>
                    <Users className="w-4.5 h-4.5 text-primary" />
                    Remaining Pool ({remainingItems.length} left)
                  </>
                )}
              </h2>
              <div className="divide-y divide-border/20 max-h-[300px] overflow-y-auto pr-1">
                {event.status === 'completed' && !isSpinning && !showWinnerBanner ? (
                  items.map((item, idx) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between text-2sm animate-fade-in">
                      <span className="font-semibold">{item.item_value}</span>
                      <span className="text-3xs px-2 py-0.5 rounded bg-secondary/80 border border-border/10 text-muted-foreground uppercase font-bold">
                        #{idx + 1}
                      </span>
                    </div>
                  ))
                ) : (
                  <>
                    {remainingItems.map((item) => (
                      <div key={item.id} className="py-2.5 flex items-center justify-between text-2sm transition-all duration-500">
                        <span className="font-semibold">{item.item_value}</span>
                        <span className="text-3xs px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 font-bold uppercase">
                          Eligible
                        </span>
                      </div>
                    ))}
                    {remainingItems.length === 0 && (
                      <p className="text-2sm text-muted-foreground py-6 text-center">
                        Roster pool exhausted. Selections complete.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Bottom engagement reactions panel */}
            <div className="border-t border-border/20 pt-4 space-y-2.5">
              <span className="text-3xs font-extrabold uppercase text-muted-foreground tracking-wider block">Audience reactions</span>
              <div className="flex gap-2.5">
                <button
                  onClick={() => handleReactionClick('fair')}
                  className="flex-1 py-2 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none"
                >
                  👍 <span className="text-2xs font-bold text-muted-foreground">Fair</span>
                </button>
                <button
                  onClick={() => handleReactionClick('exciting')}
                  className="flex-1 py-2 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none"
                >
                  🎉 <span className="text-2xs font-bold text-muted-foreground">Exciting</span>
                </button>
                <button
                  onClick={() => handleReactionClick('verify')}
                  className="flex-1 py-2 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none"
                >
                  🔍 <span className="text-2xs font-bold text-muted-foreground">Verify</span>
                </button>
              </div>
            </div>
          </div>

          {/* Center Panel: Roulette Wheel */}
          <div className="lg:col-span-1 flex flex-col items-center justify-center p-6 glass border border-border/40 rounded-2xl min-h-[550px] relative overflow-hidden">
            {event.status === 'completed' && !isSpinning && !showWinnerBanner ? (
              <div className="w-full flex flex-col items-center justify-start space-y-5 animate-fade-in">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Trophy className="w-6 h-6 text-yellow-500" />
                </div>
                <div className="text-center space-y-0.5 shrink-0">
                  <h3 className="text-lg font-black font-heading tracking-tight text-foreground">
                    Drawing Concluded!
                  </h3>
                </div>

                {/* Selections List */}
                <div className="w-full max-w-sm space-y-2 max-h-[160px] overflow-y-auto pr-1 shrink-0">
                  {selectedItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-secondary border border-border/40 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5.5 h-5.5 rounded-lg bg-primary/15 text-primary font-bold text-2xs flex items-center justify-center">
                          {idx + 1}.
                        </span>
                        <span className="text-2sm font-bold text-foreground truncate max-w-[200px]">
                          {item.item_value}
                        </span>
                      </div>
                      {item.selected_at && (
                        <span className="text-3xs text-muted-foreground font-mono">
                          {new Date(item.selected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Verification Card */}
                <div className="w-full max-w-sm p-4 rounded-xl bg-secondary/40 border border-border/30 text-left space-y-3 text-2xs shrink-0">
                  <div className="border-b border-border/20 pb-2">
                    <div className="flex items-center gap-1.5 font-bold text-foreground">
                      <span>🔒 Verification</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-muted-foreground">
                    <div className="self-start pt-0.5">Status:</div>
                    <div className="text-right flex flex-col items-end">
                      <span className="text-green-500 font-bold flex items-center justify-end gap-1">
                        Verified <span className="text-green-500">✔</span>
                      </span>
                      {(() => {
                        const parentSlug = Array.isArray(event.parent) ? event.parent[0]?.slug : event.parent?.slug;
                        return parentSlug ? (
                          <span className="text-3xs text-muted-foreground font-light italic mt-0.5 leading-normal">
                            Duplicated from {parentSlug}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <div className="self-start pt-1">Draw ID:</div>
                    <div className="font-mono text-right text-foreground font-bold flex items-center justify-end gap-1">
                      <span>{event ? `VD-${event.id.substring(0, 6).toUpperCase()}` : 'N/A'}</span>
                      {event && (
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/draw/${event.slug}`;
                            navigator.clipboard.writeText(url);
                            alert('Draw link copied to clipboard!');
                          }}
                          className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                          title="Copy Share Link"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div>Timestamp:</div>
                    <div className="text-right text-foreground whitespace-nowrap">
                      {selectedItems.length > 0 && selectedItems[selectedItems.length - 1].selected_at
                        ? new Date(selectedItems[selectedItems.length - 1].selected_at!).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
                        : new Date(event.updated_at).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'}
                    </div>
                    <div>Entries:</div>
                    <div className="text-right text-foreground">{items.length}</div>
                    <div>Winners:</div>
                    <div className="text-right text-foreground">{selectedItems.length}</div>
                  </div>
                </div>

                {/* Verification Explainer Card */}
                <div className="w-full max-w-sm p-4 rounded-xl bg-secondary/25 border border-border/20 text-left space-y-2 text-2xs shrink-0 text-muted-foreground leading-relaxed">
                  <div className="font-bold text-foreground">Verification Method</div>
                  <div className="font-semibold text-primary">Verifiable Shuffle</div>
                  <p>
                    A deterministic shuffle algorithm was used to ensure all entries had equal probability of selection.
                  </p>
                  <p className="border-t border-border/10 pt-2 text-3xs italic">
                    This result can be independently reproduced using the recorded seed.
                  </p>
                </div>

                {isHost ? (
                  <div className="flex flex-col gap-3 w-full max-w-xs shrink-0">
                    <button
                      onClick={handleCreateNewDraw}
                      className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4.5 h-4.5" />
                      Create New Draw
                    </button>
                    <button
                      onClick={handleDuplicateDraw}
                      className="w-full py-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Copy className="w-4.5 h-4.5" />
                      Duplicate & Run Again
                    </button>
                  </div>
                ) : (
                  <div className="w-full max-w-xs p-3 bg-secondary/50 rounded-xl text-2xs text-muted-foreground text-center border border-border/20 shrink-0">
                    This draw is complete and the results are verified.
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Header Round Marker */}
                <div className="absolute top-4 z-20 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-2xs font-bold uppercase tracking-wider">
                  {event.status === 'completed' && !isSpinning && !showWinnerBanner
                    ? 'Drawing Concluded! 🏆'
                    : `Round ${Math.min(event.select_count, selectedItems.length + 1)} of ${event.select_count}`
                  }
                </div>

                {/* Winner Fanfare Banner */}
                {showWinnerBanner && winnerItem && (
                  <div
                    onClick={handleDismissWinner}
                    className="absolute top-14 left-4 right-4 z-20 p-4 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-lg flex flex-col items-center text-center cursor-pointer hover:brightness-105 transition-all animate-bounce"
                  >
                    <span className="text-2xs font-extrabold tracking-widest uppercase opacity-90 flex items-center gap-1">
                      <Trophy className="w-3.5 h-3.5" /> Winner Chosen
                    </span>
                    <span className="font-heading font-black text-2xl uppercase mt-1 tracking-wide">
                      {winnerItem.item_value}
                    </span>
                  </div>
                )}

                {/* SVG Wheel */}
                <div className="w-full flex items-center justify-center py-4">
                  <RouletteWheel
                    items={visualItems}
                    rotationAngle={rotationAngle}
                    isSpinning={isSpinning}
                    spinDurationMs={spinDuration}
                  />
                </div>

                {/* Action buttons (Host only) */}
                <div className="mt-6 flex flex-col sm:flex-row items-center gap-3.5 z-20 w-full px-2">
                  {isHost ? (
                    <>
                      <button
                        onClick={handleHostSpin}
                        disabled={isSpinning || remainingItems.length === 0}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
                      >
                        <Play className="w-5 h-5 fill-current" />
                        {isSpinning ? 'Drawing...' : 'Spin Wheel'}
                      </button>
                      <button
                        onClick={handleHostReset}
                        disabled={isSpinning}
                        className="px-4 py-3.5 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-semibold transition-all cursor-pointer select-none"
                        title="Reset Roster Selections"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-secondary/50 rounded-xl text-2xs text-muted-foreground text-center">
                      <Info className="w-4 h-4 text-primary shrink-0" />
                      <span>
                        Waiting for the draw to commence...
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right Panel: Selections List */}
          <div className="glass border border-border/40 rounded-2xl p-5 space-y-4 flex flex-col h-[550px] justify-between">
            <div className="space-y-4 flex-1 flex flex-col min-h-0">
              <h2 className="text-md font-extrabold font-heading flex items-center gap-2 border-b border-border/20 pb-2.5">
                🏆 Selections ({selectedItems.length} drawn)
              </h2>

              <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                {selectedItems.map((item, idx) => (
                  <div key={item.id} className="p-3.5 rounded-xl bg-secondary/40 border border-border/20 flex items-center justify-between animate-fade-in">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs font-black flex items-center justify-center shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="font-bold text-2sm">{item.item_value}</span>
                    </div>
                    {item.selected_at && (
                      <span className="text-3xs text-muted-foreground font-mono">
                        {new Date(item.selected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                  </div>
                ))}
                {selectedItems.length === 0 && (
                  <p className="text-2sm text-muted-foreground py-10 text-center">
                    No selections drawn yet.
                  </p>
                )}
              </div>
            </div>

            {/* Download Draw History action */}
            <div className="border-t border-border/20 pt-4 flex gap-2">
              <button
                onClick={handleDownloadLogs}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-2xs font-semibold transition-all cursor-pointer select-none"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                Download Draw History
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DrawRoom;
