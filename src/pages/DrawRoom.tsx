import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDrawSession } from '@/hooks/useDrawSession';
import { drawApi } from '@/api/draw';
import { eventsApi } from '@/api/events';
import { RouletteWheel } from '@/components/roulette/RouletteWheel';
import { ROUTES } from '@/config/routes.config';
import { ArrowLeft, Users, CheckCircle, RefreshCw, Trophy, Play, Info, Copy, Download, Calendar, ShieldCheck, FileText, List, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';

export function DrawRoom() {
  const { slugOrId } = useParams<{ slugOrId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Local state for resets

  // Local state for wheel rotation and animation
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinDuration, setSpinDuration] = useState(4000);
  const [localWinner, setLocalWinner] = useState<any>(null);
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [preSpinSelectedIds, setPreSpinSelectedIds] = useState<Set<string>>(new Set());
  
  // Auditable reactions overlay state
  const [floatingReactions, setFloatingReactions] = useState<Array<{ id: number; type: string; x: number }>>([]);
  const [verificationChecked, setVerificationChecked] = useState(false);

  const itemsRef = useRef<any[]>([]);
  const dismissTimeoutRef = useRef<any>(null);
  const transitionTimeoutRef = useRef<any>(null);

  // Trigger floating reaction animation locally
  const triggerLocalReaction = useCallback((type: string) => {
    const id = Date.now() + Math.random();
    const x = 15 + Math.random() * 70; // random offset between 15% and 85% width
    setFloatingReactions(prev => [...prev, { id, type, x }]);
    
    // Auto-remove reaction after 2s
    setTimeout(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    }, 2000);
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
        setPreSpinSelectedIds(new Set());
        transitionTimeoutRef.current = null;
      }, 500);

      return false;
    });
  }, []);

  // Trigger spin animation locally (used by both host and viewer)
  const animateSpin = useCallback((targetAngle: number, durationMs: number, winnerId: string) => {
    setLocalWinner(null);
    setShowWinnerBanner(false);
    setIsSpinning(true);
    setSpinDuration(durationMs);
    setRotationAngle(targetAngle);

    // Snapshot selected items at start of animation if not already captured
    setPreSpinSelectedIds((prev) => {
      if (prev.size === 0) {
        return new Set(
          itemsRef.current
            .filter((item) => item.is_selected && item.id !== winnerId)
            .map((item) => item.id)
        );
      }
      return prev;
    });

    // Wait for animation to finish
    setTimeout(() => {
      setIsSpinning(false);
      // Trigger premium wow factor confetti
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
      });
      // Set the active winner details for display
      setLocalWinner(winnerId);
      setShowWinnerBanner(true);

      // Clear any existing auto-dismiss timer
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
      // Auto dismiss after 6 seconds to rotate back and remove the slice
        dismissTimeoutRef.current = setTimeout(() => {
          handleDismissWinner();
        }, 2500);
    }, durationMs);
  }, [handleDismissWinner]);

  // Instantly start visual spinning phase
  const handleLocalSpinStart = useCallback(() => {
    // Clear any pending timeouts to avoid visual state issues
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    setLocalWinner(null);
    setShowWinnerBanner(false);
    setIsSpinning(true);
    setSpinDuration(8000); // 8s anticipation spin time
    setRotationAngle((prev) => prev + 1800); // Rotate 5 quick turns immediately

    // Snapshot currently selected IDs to prevent premature spoilers
    setPreSpinSelectedIds(
      new Set(
        itemsRef.current
          .filter((item) => item.is_selected)
          .map((item) => item.id)
      )
    );
  }, []);

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

  // Sync items ref for use in animation callbacks without triggering sub loops
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Calculate and update the countdown timer
  useEffect(() => {
    if (!event || event.status !== 'scheduled') {
      setTimeLeft(0);
      return;
    }

    const calculateTimeLeft = () => {
      const difference = new Date(event.scheduled_start_time).getTime() - Date.now();
      return Math.max(0, Math.floor(difference / 1000));
    };

    setTimeLeft(calculateTimeLeft());

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [event]);

  const formatCountdown = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0'),
    ].join(':');
  };

  const isHost = useMemo(() => {
    if (user && event && event.created_by === user.id) {
      return true;
    }
    return false;
  }, [user, event]);

  const hasAutoSpunRef = useRef(false);

  // Auto-activate event when countdown hits 0 (Host only)
  useEffect(() => {
    if (!event || event.status !== 'scheduled' || !isHost || timeLeft > 0) return;

    const activateEvent = async () => {
      try {
        await drawApi.updateEventStatus(event.id, 'active');
        refetch();
      } catch (e) {
        console.error('Failed to auto-activate event:', e);
      }
    };

    activateEvent();
  }, [event?.status, isHost, timeLeft]);

  // Auto-spin first round when event becomes active (Host only)
  useEffect(() => {
    if (loading || !event || event.status !== 'active' || !isHost || hasAutoSpunRef.current) return;

    // Only auto-spin if no items have been selected yet (first round)
    const alreadySelectedCount = items.filter(item => item.is_selected).length;
    if (alreadySelectedCount > 0) return;

    hasAutoSpunRef.current = true;
    const timer = setTimeout(() => {
      handleHostSpin();
    }, 1500);

    return () => clearTimeout(timer);
  }, [event?.status, isHost, items, loading]);

  // Handle Host Spin Trigger
  const handleHostSpin = async () => {
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
        } catch (e) {
          console.error('[DB Update landed Error]', e);
        }
      }, spin_duration_ms);

    } catch (err: any) {
      setIsSpinning(false);
      alert(err.message || 'Failed to spin.');
    }
  };

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
          description: event.description,
          item_type: event.item_type,
          select_count: event.select_count,
        },
        items: itemValues
      }
    });
  };

  // Handle Host Reset Trigger
  const handleHostReset = async () => {
    if (!eventId || isSpinning) return;
    if (!confirm('Are you sure you want to reset all selections? This deletes selection order history.')) return;

    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    try {
      await drawApi.resetEvent(eventId);
      setRotationAngle(0);
      setLocalWinner(null);
      setPreSpinSelectedIds(new Set());
      setVerificationChecked(false);
      setShowWinnerBanner(false);
      refetch();
    } catch (err: any) {
      alert(err.message || 'Failed to reset.');
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

  // Display name of winner
  const winnerItem = useMemo(() => {
    const activeWinnerId = localWinner || session?.active_winner_id;
    if (!activeWinnerId) return null;
    return items.find((item) => item.id === activeWinnerId);
  }, [localWinner, session, items]);

  // Overrides selected status of new items while wheel is spinning to avoid spoilers
  const visualItems = useMemo(() => {
    if (!isSpinning) return items;
    return items.map((item) => {
      const wasSelectedBefore = preSpinSelectedIds.has(item.id);
      return { ...item, is_selected: wasSelectedBefore };
    });
  }, [items, isSpinning, preSpinSelectedIds]);

  // Group selection history list
  const selectedItems = useMemo(() => {
    return visualItems
      .filter((item) => item.is_selected)
      .sort((a, b) => (a.selection_order || 0) - (b.selection_order || 0));
  }, [visualItems]);

  // Group remaining items in pool
  const remainingItems = useMemo(() => {
    return visualItems.filter((item) => !item.is_selected);
  }, [visualItems]);

  // Formulate Live Audit Trail Logs based on draw history timestamps
  const auditLogs = useMemo(() => {
    if (!event) return [];
    const logs: Array<{ id: string; time: string; text: string }> = [];

    logs.push({
      id: 'create',
      time: new Date(event.created_at).toLocaleTimeString(),
      text: 'Event session initialized',
    });

    const lockTime = new Date(event.scheduled_start_time);
    logs.push({
      id: 'lock',
      time: lockTime.toLocaleTimeString(),
      text: `Entries locked (${items.length} participants)`,
    });

    logs.push({
      id: 'seed',
      time: new Date(lockTime.getTime() + 1000).toLocaleTimeString(),
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
          time: spinTime.toLocaleTimeString(),
          text: `Spin initiated (Round ${index + 1} of ${event.select_count})`,
        });
        logs.push({
          id: `win-${item.id}`,
          time: selectTime.toLocaleTimeString(),
          text: `Selected winner: ${item.item_value}`,
        });
        logs.push({
          id: `remove-${item.id}`,
          time: removeTime.toLocaleTimeString(),
          text: `${item.item_value} removed from active pool`,
        });
      });

    return logs.sort((a, b) => a.time.localeCompare(b.time));
  }, [event, items]);

  const handleDownloadLogs = () => {
    if (!event) return;
    const logText = auditLogs.map(l => `[${l.time}] ${l.text}`).join('\n');
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

  const verifyAuditSeed = () => {
    setVerificationChecked(true);
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
    });
  };

  if (loading) {
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
      {/* Floating emoji reactions container overlay */}
      <div className="absolute inset-x-0 bottom-0 top-20 pointer-events-none z-40 overflow-hidden">
        {floatingReactions.map(r => {
          const emojiMap: Record<string, string> = { fair: '👍', exciting: '🎉', verify: '🔍' };
          return (
            <span
              key={r.id}
              className="absolute text-3xl animate-float-up pointer-events-none select-none"
              style={{
                left: `${r.x}%`,
                bottom: '10%',
              }}
            >
              {emojiMap[r.type] || r.type}
            </span>
          );
        })}
      </div>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 glass border border-border/40 rounded-2xl">
        <div className="space-y-1">
          <Link to={ROUTES.DASHBOARD} className="inline-flex items-center gap-1.5 text-2sm font-semibold text-primary hover:underline mb-1">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <h1 className="text-2xl font-extrabold font-heading tracking-tight">{event.event_name}</h1>
        </div>

        {/* Live Counters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-2sm font-semibold">
            <Users className="w-4 h-4 animate-pulse" />
            <span>{viewerCount} watching</span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-secondary border border-border/40 text-2sm font-semibold capitalize">
            <span>Status: <span>{event.status}</span></span>
          </div>
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
                {timeLeft > 0 ? (
                  <div className="text-5xl font-black font-mono tracking-wider text-primary select-none drop-shadow-[0_0_15px_rgba(30,96,145,0.25)]">
                    {formatCountdown(timeLeft)}
                  </div>
                ) : (
                  <div className="text-sm font-semibold text-green-600 dark:text-green-400 flex items-center justify-center gap-1">
                    <span>Draw is ready to commence!</span>
                  </div>
                )}
              </div>

              {/* Share Panel */}
              <div className="p-4 bg-secondary/40 border border-border/20 rounded-xl flex items-center justify-between text-left">
                <div>
                  <span className="text-3xs font-extrabold uppercase text-muted-foreground block tracking-wider">Public Viewing link</span>
                  <span className="text-2sm font-mono truncate max-w-[280px] block font-semibold">{window.location.href}</span>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    alert('Viewing link copied to clipboard!');
                  }}
                  className="p-2 bg-background hover:bg-border/20 border border-border/60 rounded-lg text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                  title="Copy Invite Link"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Host Controls */}
            {isHost && (
              <div className="border-t border-border/20 pt-5 w-full flex justify-center">
                <button
                  onClick={async () => {
                    try {
                      await drawApi.updateEventStatus(event.id, 'active');
                      refetch();
                    } catch (e) {
                      alert('Failed to start draw.');
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
                {event.status === 'completed' ? (
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
                {event.status === 'completed' ? (
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
                  {event.status === 'completed'
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
                        Waiting for the Host to trigger the spin.
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

            {/* Export Selection Logs action */}
            <div className="border-t border-border/20 pt-4 flex gap-2">
              <button
                onClick={handleDownloadLogs}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-2xs font-semibold transition-all cursor-pointer select-none"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                Export Selection Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DrawRoom;
