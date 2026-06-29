import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useDrawSession } from '@/hooks/useDrawSession';
import { drawApi } from '@/api/draw';
import { RouletteWheel } from '@/components/roulette/RouletteWheel';
import { deriveWheelState } from '@/components/roulette/roulette-helpers';
import { ROUTES } from '@/config/routes.config';
import { ArrowLeft, Users, CheckCircle, Trophy, Play, Pause, Info, Copy, List, Sparkles, Share2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';
import { CountdownTimer } from '@/components/draw/CountdownTimer';
import { ReactionsOverlay, type ReactionsOverlayRef } from '@/components/draw/ReactionsOverlay';
import { InviteModal } from '@/components/modals/InviteModal';
import { ShareResultsModal } from '@/components/modals/ShareResultsModal';

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

  // Replay playback states
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayStep, setReplayStep] = useState(1);
  const [replayStatus, setReplayStatus] = useState<'idle' | 'spinning' | 'landed'>('idle');
  const [isReplayPaused, setIsReplayPaused] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2>(1);
  
  // Auditable reactions overlay state
  const reactionsRef = useRef<ReactionsOverlayRef>(null);

  // Sharing states
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isShareResultsModalOpen, setIsShareResultsModalOpen] = useState(false);

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
    refetch,
  } = useDrawSession({
    slugOrId: slugOrId || '',
    onSpinTriggered: useCallback((targetAngle: number, durationMs: number, winnerId: string) => {
      if (isReplaying) return;
      animateSpin(targetAngle, durationMs, winnerId);
    }, [isReplaying, animateSpin]),
    onSpinStarted: useCallback(() => {
      if (isReplaying) return;
      handleLocalSpinStart();
    }, [isReplaying, handleLocalSpinStart]),
    onReactionReceived: triggerLocalReaction,
  });


  // Guard check for private events (require_viewer_login = true)
  useEffect(() => {
    if (loading || loadingAuth || !event) return;
    if (event.require_viewer_login && !user) {
      navigate(ROUTES.LOGIN, { state: { from: location.pathname } });
    }
  }, [event, user, loading, loadingAuth, navigate, location.pathname]);

  // Auto-open invite modal if redirected from a Go Live transition
  useEffect(() => {
    if (loading || !event) return;
    const state = location.state as { autoOpenInvite?: boolean } | null;
    if (state?.autoOpenInvite) {
      // Queue state update to prevent synchronous cascading renders warning
      setTimeout(() => {
        setIsInviteModalOpen(true);
      }, 0);
      // Clear navigation state to prevent modal reopening on page reloads/manual refreshes
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [loading, event, location.state, location.pathname, navigate]);

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
    if (isReplaying) return;
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
  }, [session, animateSpin, refetch, handleDismissWinner, isReplaying]);

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

  // Handle Host Spin Trigger (Commences the continuous auto-draw loop)
  const handleHostSpin = useCallback(async () => {
    if (!event || event.status !== 'scheduled' || isSpinning || isActivating) return;

    try {
      setIsActivating(true);
      await drawApi.triggerAutoDraw(event.id);
      await refetch();
    } catch (err: unknown) {
      logErrorToDb(err, { context: 'DrawRoom.handleHostSpin', eventId: event.id });
      alert(getFriendlyErrorMessage(err, 'Failed to start drawing.'));
    } finally {
      setIsActivating(false);
    }
  }, [event, isSpinning, isActivating, refetch]);

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
    if (!event?.slug) return;
    const link = `${window.location.origin}/draw/${event.slug}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (!event?.slug) return;
    const link = `${window.location.origin}/draw/${event.slug}`;
    
    const shareData = {
      title: 'VeriDraw Live Event',
      text: `Join my live drawing event on VeriDraw! Use invite code: ${inviteCode}`,
      url: link,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
          handleCopyLink();
        }
      }
    } else {
      handleCopyLink();
    }
  };

  // Replay helper derivations
  const orderedWinners = useMemo(() => {
    return [...items]
      .filter((item) => item.is_selected && item.selection_order != null)
      .sort((a, b) => (a.selection_order || 0) - (b.selection_order || 0));
  }, [items]);

  const replayItems = useMemo(() => {
    if (!isReplaying) return items;
    return items.map((item) => {
      const winnerIdx = orderedWinners.findIndex((w) => w.id === item.id);
      if (winnerIdx !== -1) {
        const orderNum = winnerIdx + 1;
        const isSelected = orderNum < replayStep || (orderNum === replayStep && replayStatus === 'landed');
        return {
          ...item,
          is_selected: isSelected,
          selection_order: isSelected ? orderNum : null,
          selected_at: isSelected ? item.selected_at : null,
        };
      }
      return {
        ...item,
        is_selected: false,
        selection_order: null,
        selected_at: null,
      };
    });
  }, [isReplaying, items, orderedWinners, replayStep, replayStatus]);

  const replaySession = useMemo(() => {
    if (!isReplaying) return null;
    const currentWinner = orderedWinners[replayStep - 1];
    return {
      current_status: replayStatus,
      active_winner_id: (replayStatus === 'spinning' || replayStatus === 'landed') && currentWinner ? currentWinner.id : null,
    };
  }, [isReplaying, replayStep, replayStatus, orderedWinners]);

  // Display name of winner
  const winnerItem = useMemo(() => {
    const activeItems = isReplaying ? replayItems : items;
    const activeSession = isReplaying ? replaySession : session;
    const activeWinnerId = localWinner || activeSession?.active_winner_id;
    if (!activeWinnerId) return null;
    return activeItems.find((item) => item.id === activeWinnerId);
  }, [localWinner, session, items, isReplaying, replayItems, replaySession]);

  // Derive the wheel state and round info using our pure testable helper
  const { wheelItems } = useMemo(() => {
    const activeItems = isReplaying ? replayItems : items;
    const activeSession = isReplaying ? replaySession : session;
    return deriveWheelState(activeItems, activeSession);
  }, [items, session, isReplaying, replayItems, replaySession]);

  // Use wheelItems as our visual items representation for the RouletteWheel component
  const visualItems = wheelItems;

  // Group selection history list: show items when they are selected, excluding the active winner ONLY while spinning to preserve surprise
  const selectedItems = useMemo(() => {
    const activeItems = isReplaying ? replayItems : items;
    const activeSession = isReplaying ? replaySession : session;
    const activeWinnerId = activeSession?.active_winner_id;
    const isSpinning = activeSession?.current_status === 'spinning';
    return activeItems
      .filter((item) => item.is_selected && (!isSpinning || item.id !== activeWinnerId))
      .sort((a, b) => (a.selection_order || 0) - (b.selection_order || 0));
  }, [items, session, isReplaying, replayItems, replaySession]);

  // Group remaining items in pool
  const remainingItems = useMemo(() => {
    const activeItems = isReplaying ? replayItems : items;
    const activeSession = isReplaying ? replaySession : session;
    const activeWinnerId = activeSession?.active_winner_id;
    const isSpinningOrLanded = activeSession?.current_status === 'spinning' || activeSession?.current_status === 'landed';
    return activeItems.filter((item) => !item.is_selected || (isSpinningOrLanded && item.id === activeWinnerId));
  }, [items, session, isReplaying, replayItems, replaySession]);

  const startReplay = useCallback(() => {
    setIsReplaying(true);
    setReplayStep(1);
    setReplayStatus('idle');
    setIsReplayPaused(false);
    setRotationAngle(0);
    setLocalWinner(null);
    setShowWinnerBanner(false);
    setIsSpinning(false);
  }, []);

  const stopReplay = useCallback(() => {
    setIsReplaying(false);
    setReplayStep(1);
    setReplayStatus('idle');
    setIsReplayPaused(false);
    setRotationAngle(0);
    setLocalWinner(null);
    setShowWinnerBanner(false);
    setIsSpinning(false);

    // If on a /replay/ route, redirect to /draw/ using react-router to update local state and prevent looping
    if (location.pathname.startsWith('/replay/')) {
      const slug = location.pathname.replace('/replay/', '');
      navigate(`/draw/${slug}`, { replace: true });
    } else {
      // Otherwise strip any query parameters that would trigger replay
      const params = new URLSearchParams(location.search);
      if (params.has('replay') || params.has('mode') || params.has('r')) {
        navigate(location.pathname, { replace: true });
      }
    }
  }, [location.pathname, location.search, navigate]);

  // URL parameters or pathname replay trigger
  useEffect(() => {
    if (loading || loadingAuth || !event || event.status !== 'completed') return;
    
    const isReplayRoute = location.pathname.startsWith('/replay');
    const searchParams = new URLSearchParams(location.search);
    const mode = searchParams.get('mode');
    const replay = searchParams.get('replay');
    const r = searchParams.get('r');
    
    if (isReplayRoute || mode === 'replay' || replay === 'true' || r === '1' || r === 'true') {
      const timer = setTimeout(() => {
        startReplay();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [event, loading, loadingAuth, location.pathname, location.search, startReplay]);

  // Handle active replay step simulation timer loop
  useEffect(() => {
    if (!isReplaying || isReplayPaused || replayStatus !== 'idle') return;

    if (replayStep > orderedWinners.length) {
      // Replay finished
      const timer = setTimeout(() => {
        stopReplay();
      }, 1500);
      return () => clearTimeout(timer);
    }

    const currentWinner = orderedWinners[replayStep - 1];
    if (!currentWinner) return;

    // Wait before starting the spin
    const timer = setTimeout(() => {
      // Find index of the winner in remaining items pool before this spin
      const activeItemsBeforeSpin = items.filter(
        (item) => !item.is_selected || (item.selection_order != null && item.selection_order >= replayStep)
      );
      const winnerIndex = activeItemsBeforeSpin.findIndex((item) => item.id === currentWinner.id);
      if (winnerIndex !== -1) {
        const sliceAngle = 360 / Math.max(1, activeItemsBeforeSpin.length);
        const targetAngle = rotationAngle + 360 * 5 + (winnerIndex * sliceAngle) + (sliceAngle / 2);
        const duration = 4000 / replaySpeed;

        setReplayStatus('spinning');
        animateSpin(targetAngle, duration, currentWinner.id);

        const spinTimer = setTimeout(() => {
          setReplayStatus('landed');
          setLocalWinner(currentWinner.id);
          setShowWinnerBanner(true);
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 },
          });

          const bannerTimer = setTimeout(() => {
            // Dismiss winner: rotate back to 0
            setRotationAngle(0);
            setShowWinnerBanner(false);

            // Wait for reset animation
            const resetTimer = setTimeout(() => {
              setLocalWinner(null);
              setReplayStatus('idle');
              setReplayStep((prev) => prev + 1);
            }, 500 / replaySpeed);

            return () => clearTimeout(resetTimer);
          }, 2500 / replaySpeed);

          return () => clearTimeout(bannerTimer);
        }, duration);

        return () => clearTimeout(spinTimer);
      }
    }, 1500 / replaySpeed);

    return () => clearTimeout(timer);
  }, [isReplaying, isReplayPaused, replayStatus, replayStep, replaySpeed, orderedWinners, items, animateSpin, rotationAngle, stopReplay]);

  // If host resets draw while replaying, exit replay mode
  useEffect(() => {
    if (isReplaying && event && event.status !== 'completed') {
      const timer = setTimeout(() => {
        stopReplay();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [event, isReplaying, stopReplay]);





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
        eventSlug={event?.slug ?? ''}
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

          {isReplaying ? (
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-2sm font-bold uppercase animate-pulse">
              Replay Active
            </div>
          ) : event.status === 'completed' && !isSpinning && !showWinnerBanner ? (
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
          <div className="lg:col-span-2 glass border border-border/40 rounded-2xl p-4 sm:p-6 flex flex-col justify-between items-center text-center min-h-[460px]">
            <div className="max-w-md w-full space-y-6 py-4">
              {/* Countdown Timer Header */}
              <div className="space-y-1">
                <span className="text-2sm font-bold text-foreground block">
                  Draw Starts In
                </span>
                <CountdownTimer
                  scheduledStartTime={event.scheduled_start_time}
                  status={event.status}
                  onCommenced={handleAutoActivate}
                  isActivating={isActivating}
                />
                <div className="text-2xs text-muted-foreground font-medium pt-1">
                  Scheduled for:<br />
                  <span className="font-bold text-foreground">
                    {new Date(event.scheduled_start_time).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}, {new Date(event.scheduled_start_time).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                    })} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </span>
                </div>
              </div>

              {/* Share/Invite Box */}
              <div className="border-t border-border/10 pt-5 space-y-4 text-left">
                <h4 className="text-sm font-black font-heading text-foreground">Invite Spectators</h4>
                
                {/* Invite Link */}
                <div className="space-y-1.5">
                  <span className="text-2xs font-extrabold text-foreground block">Invite Link</span>
                  <span className="text-3xs text-muted-foreground block font-medium">Anyone with this link can join the event.</span>
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/draw/${event.slug}`}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-input text-foreground text-2sm font-mono focus:outline-none select-all"
                  />
                  
                  <div className="flex gap-2.5">
                    <button
                      onClick={handleCopyLink}
                      aria-label="Copy Direct Invite Link"
                      className={`flex-1 py-2.5 rounded-xl font-bold text-2sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        copiedLink
                          ? 'bg-green-500 text-white'
                          : 'bg-primary text-primary-foreground hover:opacity-90 shadow-md shadow-primary/10'
                      }`}
                    >
                      {copiedLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedLink ? 'Copied' : 'Copy Link'}
                    </button>
                    <button
                      type="button"
                      onClick={handleShare}
                      aria-label="Share Direct Invite Link"
                      className="flex-1 py-2.5 rounded-xl font-bold text-2sm bg-secondary hover:bg-border/20 border border-border text-foreground transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Share2 className="w-4 h-4" />
                      Share
                    </button>
                  </div>
                  {copiedLink && (
                    <span className="text-3xs font-bold text-green-500 block text-center animate-pulse">
                      ✅ Invite link copied to clipboard.
                    </span>
                  )}
                </div>

                {/* Event Code */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-2xs font-extrabold text-foreground block">Event Code</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleCopyCode}
                      className="text-2xl font-black font-mono tracking-wider text-primary hover:opacity-85 transition-opacity cursor-pointer focus:outline-none select-all"
                      title="Click to copy code"
                      aria-label="Copy Invite Code"
                    >
                      {inviteCode}
                    </button>
                    <span className="text-3xs text-muted-foreground font-medium">
                      Already on VeriDraw? Join using this code.
                    </span>
                  </div>
                  {copiedCode && <span className="text-3xs font-bold text-green-500 block animate-pulse">Code copied!</span>}
                </div>
              </div>
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="border-t border-border/10 pt-5 w-full flex justify-center">
                <button
                  disabled={isActivating}
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
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Draw Now
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Pre-lock items listing */}
          <div className="glass border border-border/40 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="border-b border-border/20 pb-2.5 space-y-1">
              <h2 className="text-md font-extrabold font-heading flex items-center gap-2">
                <List className="w-4.5 h-4.5 text-primary" />
                Entry Pool ({items.length})
              </h2>
              <div className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider pl-6.5">
                Target: {event.select_count} {event.select_count === 1 ? 'selection' : 'selections'} will be drawn
              </div>
            </div>
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
          <div className="glass border border-border/40 rounded-2xl p-4 sm:p-5 space-y-4 flex flex-col justify-between min-h-[250px] lg:min-h-[480px] order-2 lg:order-1">
            <div>
              <h2 className="text-md font-extrabold font-heading flex items-center gap-2 border-b border-border/20 pb-2.5">
                {event.status === 'completed' && !isSpinning && !showWinnerBanner && !isReplaying ? (
                  <>
                    <List className="w-4.5 h-4.5 text-primary" />
                    Entry Pool ({items.length})
                  </>
                ) : (
                  <>
                    <Users className="w-4.5 h-4.5 text-primary" />
                    Remaining Pool ({remainingItems.length} left)
                  </>
                )}
              </h2>
              <div className="divide-y divide-border/20 max-h-[300px] overflow-y-auto pr-1">
                {event.status === 'completed' && !isSpinning && !showWinnerBanner && !isReplaying ? (
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
                        Entry pool exhausted. Selections complete.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Center Panel: Roulette Wheel */}
          <div className="lg:col-span-1 flex flex-col items-center justify-center p-4 sm:p-6 glass border border-border/40 rounded-2xl min-h-[450px] lg:min-h-[550px] relative overflow-hidden order-1 lg:order-2">
            {event.status === 'completed' && !isSpinning && !showWinnerBanner && !isReplaying ? (
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
                    <div>Seed:</div>
                    <div className="font-mono text-right text-foreground truncate max-w-[180px] select-all" title={event.seed || ''}>
                      {event.seed || 'N/A'}
                    </div>
                    <div>Timestamp:</div>
                    <div className="text-right text-foreground whitespace-nowrap">
                      {(() => {
                        const dateVal = selectedItems.length > 0 && selectedItems[selectedItems.length - 1].selected_at
                          ? selectedItems[selectedItems.length - 1].selected_at
                          : (event.updated_at || event.created_at);
                        return dateVal
                          ? new Date(dateVal).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
                          : 'N/A';
                      })()}
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
                      onClick={() => setIsShareResultsModalOpen(true)}
                      className="w-full py-3 rounded-xl bg-gradient-to-tr from-primary to-accent hover:opacity-95 text-white font-bold shadow-md shadow-primary/25 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4.5 h-4.5" />
                      Share Results
                    </button>
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
                    <button
                      onClick={startReplay}
                      className="w-full py-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current text-primary" />
                      Watch Replay
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 w-full max-w-xs shrink-0">
                    <button
                      onClick={startReplay}
                      className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current text-white" />
                      Watch Replay
                    </button>
                    <button
                      onClick={() => setIsShareResultsModalOpen(true)}
                      className="w-full py-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4.5 h-4.5 text-primary" />
                      Share Results
                    </button>
                    <div className="w-full p-3 bg-secondary/50 rounded-xl text-2xs text-muted-foreground text-center border border-border/20 shrink-0">
                      This draw is complete and the results are verified.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Header Round Marker */}
                <div className="absolute top-4 z-20 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-2xs font-bold uppercase tracking-wider">
                  {isReplaying
                    ? `Replay: Round ${Math.min(event.select_count, replayStep)} of ${event.select_count}`
                    : event.status === 'completed' && !isSpinning && !showWinnerBanner
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

                {/* Action buttons */}
                <div className="mt-6 flex items-center gap-3.5 z-20 w-full px-2">
                  {isReplaying ? (
                    <div className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-primary/10 border border-primary/20 rounded-xl text-2sm text-primary text-center font-bold animate-pulse">
                      <Play className="w-4 h-4 fill-current shrink-0" />
                      <span>Replay Mode Active</span>
                    </div>
                  ) : isHost ? (
                    <button
                      onClick={handleHostSpin}
                      disabled={event.status === 'active' || isSpinning || remainingItems.length === 0}
                      className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
                    >
                      <Play className="w-5 h-5 fill-current" />
                      {event.status === 'active' || isSpinning ? 'Drawing...' : 'Spin Wheel'}
                    </button>
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
          <div className="glass border border-border/40 rounded-2xl p-4 sm:p-5 space-y-4 flex flex-col min-h-[350px] lg:h-[550px] justify-between order-3 lg:order-3">
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
          </div>
        </div>
      )}

      {/* Floating replay controls overlay */}
      {isReplaying && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="glass border border-primary/20 rounded-2xl shadow-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center animate-pulse">
                <Play className="w-5 h-5 fill-current" />
              </div>
              <div>
                <div className="text-2sm font-bold text-foreground">Replay Mode</div>
                <div className="text-3xs text-muted-foreground font-semibold uppercase tracking-wider">
                  Winner {Math.min(orderedWinners.length, replayStep)} of {orderedWinners.length}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsReplayPaused((prev) => !prev)}
                className="flex items-center justify-center p-2.5 rounded-xl bg-secondary hover:bg-border/40 text-foreground transition-all cursor-pointer shadow-sm active:scale-95"
                title={isReplayPaused ? 'Resume Replay' : 'Pause Replay'}
              >
                {isReplayPaused ? (
                  <Play className="w-4 h-4 fill-current text-green-600 dark:text-green-400" />
                ) : (
                  <Pause className="w-4 h-4 fill-current text-primary" />
                )}
              </button>
              
              <button
                onClick={() => setReplaySpeed((prev) => (prev === 1 ? 2 : 1))}
                className="flex items-center justify-center px-3 py-1.5 rounded-xl bg-secondary hover:bg-border/40 text-foreground text-2xs font-bold transition-all cursor-pointer min-w-[50px] shadow-sm active:scale-95"
                title="Toggle Speed"
              >
                {replaySpeed}x
              </button>
              
              <button
                onClick={stopReplay}
                className="flex items-center justify-center px-4 py-1.5 rounded-xl bg-primary text-white text-2xs font-bold hover:opacity-90 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Skip Replay"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Results Modal */}
      {event && (
        <ShareResultsModal
          isOpen={isShareResultsModalOpen}
          onClose={() => setIsShareResultsModalOpen(false)}
          eventName={event.event_name}
          eventSlug={event.slug}
          winners={selectedItems}
          totalEntriesCount={items.length}
        />
      )}
    </div>
  );
}

export default DrawRoom;
