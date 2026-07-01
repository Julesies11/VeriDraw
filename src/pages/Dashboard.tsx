import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { eventsApi, type EventRow } from '@/api/events';
import { ROUTES } from '@/config/routes.config';
import { PlusCircle, Trash2, Calendar, CheckCircle, Play } from 'lucide-react';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';

export function Dashboard() {
  const { user, loading: loadingAuth } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const PAGE_SIZE = 12;

  const loadEvents = useCallback(async (currentOffset: number, append: boolean = false) => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const data = await eventsApi.list(PAGE_SIZE, currentOffset, user.id);
      
      if (append) {
        setEvents((prev) => [...prev, ...data]);
      } else {
        setEvents(data);
      }
      
      // If we got fewer than PAGE_SIZE items, we know there are no more items left
      if (data.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Failed to load drawing events.'));
      void logErrorToDb(err, { context: 'Dashboard.loadEvents', currentOffset });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user]);

  const loadTotalCount = useCallback(async () => {
    if (!user) {
      setTotalCount(null);
      return;
    }
    try {
      const count = await eventsApi.count(user.id);
      setTotalCount(count);
    } catch (err) {
      console.error('Failed to load total events count:', err);
      void logErrorToDb(err, { context: 'Dashboard.loadTotalCount' });
    }
  }, [user]);

  useEffect(() => {
    if (!loadingAuth) {
      const timer = setTimeout(() => {
        loadEvents(0, false);
        loadTotalCount();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, loadingAuth, loadEvents, loadTotalCount]);

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    loadEvents(nextOffset, true);
  };

  useEffect(() => {
    const checkQuickDrawUpgrade = async () => {
      if (!user) return;
      const upgradeDataStr = sessionStorage.getItem('quick_draw_upgrade');
      if (!upgradeDataStr) return;

      try {
        const { items: lines, selectCount, eventName, requireViewerLogin, scheduledStartTime, status } = JSON.parse(upgradeDataStr);
        sessionStorage.removeItem('quick_draw_upgrade');
        
        setLoading(true);
        const newEvent = await eventsApi.create(
          {
            event_name: eventName || 'Quick Draw Live',
            scheduled_start_time: scheduledStartTime || new Date().toISOString(),
            item_type: 'custom',
            select_count: selectCount,
            require_viewer_login: requireViewerLogin ?? false,
            status: status || 'active',
          },
          lines
        );
        navigate(ROUTES.DRAW_ROOM(newEvent.slug));
      } catch (err) {
        console.error('Failed to auto-upgrade quick draw:', err);
        void logErrorToDb(err, { context: 'Dashboard.checkQuickDrawUpgrade' });
      } finally {
        setLoading(false);
      }
    };

    checkQuickDrawUpgrade();
  }, [user, navigate]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault(); // prevent navigation
    e.stopPropagation(); // prevent card click navigation trigger
    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
      await eventsApi.delete(id);
      setEvents((prev) => prev.filter((event) => event.id !== id));
      setTotalCount((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
    } catch (err: unknown) {
      alert(getFriendlyErrorMessage(err, 'Failed to delete event.'));
      void logErrorToDb(err, { context: 'Dashboard.handleDelete', eventId: id });
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    
    // Support parsing full URLs if pasted, or just the UUID code/slug
    const matches = joinCode.match(/\/draw\/([a-zA-Z0-9_-]+)/i);
    const slugOrId = matches ? matches[1] : joinCode.trim();
    navigate(ROUTES.DRAW_ROOM(slugOrId));
  };

  const formatTime = (timeStr: string) => {
    return new Date(timeStr).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <div className="space-y-10 animate-fade-in max-w-5xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-12 px-6 glass border border-border/30 rounded-3xl relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 shadow-xl">
        {/* Subtle decorative grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(128,128,128,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        <div className="relative z-10 max-w-2xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-2xs font-bold uppercase tracking-wider">
            Fair, transparent random selections.
          </div>
          <h1 className="text-4xl md:text-5xl font-black font-heading tracking-tight text-foreground">
            VeriDraw
          </h1>
          <p className="text-sm md:text-base text-muted-foreground font-medium max-w-lg mx-auto leading-relaxed">
            Create instant draws or schedule live events. Spin the wheel, select winners, and let everyone watch the results in real time.
          </p>

          {/* Core Actions */}
          <div className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto w-full">
            {/* Action 1: Quick Draw */}
            <div className="p-5 rounded-2xl border border-border/40 bg-secondary/35 flex flex-col justify-between items-center text-center space-y-4 shadow-sm hover:border-primary/20 transition-all">
              <div className="space-y-1.5">
                <h3 className="font-heading font-extrabold text-md text-foreground">Quick Draw</h3>
                <p className="text-2xs text-muted-foreground leading-normal max-w-[240px]">
                  Spin the wheel instantly. No account required. Perfect for quick decisions, team selections, and random picks.
                </p>
              </div>
              <button
                onClick={() => navigate(ROUTES.QUICK_DRAW)}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer"
              >
                <Play className="w-4.5 h-4.5" />
                Start Now
              </button>
            </div>

            {/* Action 2: Live Event */}
            <div className="p-5 rounded-2xl border border-border/40 bg-secondary/35 flex flex-col justify-between items-center text-center space-y-4 shadow-sm hover:border-primary/20 transition-all">
              <div className="space-y-1.5">
                <h3 className="font-heading font-extrabold text-md text-foreground">Live Event</h3>
                <p className="text-2xs text-muted-foreground leading-normal max-w-[240px]">
                  Create a scheduled draw, invite spectators, and watch the results unfold live.
                </p>
              </div>
              {user ? (
                <button
                  onClick={() => navigate(ROUTES.CREATE_EVENT)}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background font-bold hover:opacity-90 transition-all cursor-pointer"
                >
                  <PlusCircle className="w-4.5 h-4.5" />
                  Create Event
                </button>
              ) : (
                <Link
                  to={ROUTES.LOGIN}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-foreground text-background font-bold hover:opacity-90 transition-all text-center"
                >
                  <PlusCircle className="w-4.5 h-4.5" />
                  Create Event
                </Link>
              )}
            </div>

            {/* Action 3: Join Room */}
            <div className="p-5 rounded-2xl border border-border/40 bg-secondary/35 flex flex-col justify-between items-center text-center space-y-4 shadow-sm hover:border-primary/20 transition-all">
              <div className="space-y-1.5 w-full">
                <h3 className="font-heading font-extrabold text-md text-foreground">Join Live Event</h3>
                <p className="text-2xs text-muted-foreground leading-normal max-w-[240px] mx-auto">
                  Got an invite? Enter the link or event code to watch the draw unfold live.
                </p>
              </div>
              <form onSubmit={handleJoin} className="w-full flex flex-col gap-2.5">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Invite Code"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-input text-foreground text-2sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
                <button
                  type="submit"
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-secondary hover:bg-border/20 border border-border text-2sm font-semibold transition-all cursor-pointer"
                >
                  Join
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Why VeriDraw Section */}
      {!user && (
        <>
          <div className="p-6 glass border border-border/30 rounded-3xl bg-secondary/10 shadow-sm max-w-4xl mx-auto">
            <h2 className="text-md font-extrabold font-heading text-center text-foreground mb-6">
              Why VeriDraw?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="flex flex-col items-center text-center p-3 space-y-1.5">
                <span className="text-lg">✅</span>
                <span className="text-2xs font-semibold text-muted-foreground leading-snug">Transparent random selection</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 space-y-1.5">
                <span className="text-lg">✅</span>
                <span className="text-2xs font-semibold text-muted-foreground leading-snug">Live events with spectator viewing</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 space-y-1.5">
                <span className="text-lg">✅</span>
                <span className="text-2xs font-semibold text-muted-foreground leading-snug">Shareable event links</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 space-y-1.5">
                <span className="text-lg">✅</span>
                <span className="text-2xs font-semibold text-muted-foreground leading-snug">Verifiable results</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 space-y-1.5">
                <span className="text-lg">✅</span>
                <span className="text-2xs font-semibold text-muted-foreground leading-snug">No account required for Quick Draw</span>
              </div>
            </div>
          </div>

          {/* Additional Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Card 1: Use VeriDraw For */}
            <div className="p-6 glass border border-border/30 rounded-3xl bg-secondary/10 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-md font-extrabold font-heading text-primary mb-4">
                  Use VeriDraw For
                </h3>
                <ul className="space-y-2.5">
                  <li className="flex items-center gap-2.5 text-2sm text-muted-foreground font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Prize draws
                  </li>
                  <li className="flex items-center gap-2.5 text-2sm text-muted-foreground font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Team selection
                  </li>
                  <li className="flex items-center gap-2.5 text-2sm text-muted-foreground font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Volunteer allocation
                  </li>
                  <li className="flex items-center gap-2.5 text-2sm text-muted-foreground font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Tournament seeding
                  </li>
                  <li className="flex items-center gap-2.5 text-2sm text-muted-foreground font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Venue selection
                  </li>
                  <li className="flex items-center gap-2.5 text-2sm text-muted-foreground font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Random decisions
                  </li>
                </ul>
              </div>
            </div>

            {/* Card 2: Trust Every Result */}
            <div className="p-6 glass border border-border/30 rounded-3xl bg-secondary/10 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-md font-extrabold font-heading text-primary mb-4">
                  Trust Every Result
                </h3>
                <p className="text-2sm text-muted-foreground font-medium leading-relaxed">
                  VeriDraw records every draw and can provide verification that selections were made fairly and without manipulation.
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Dashboard Section (Host specific) */}
      {user && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border/20 pb-4">
            <h2 className="text-xl font-bold font-heading">
              My Draw History {totalCount !== null ? `(${totalCount})` : ''}
            </h2>
            <span className="text-2xs text-muted-foreground font-semibold">
              Host session: {user.email}
            </span>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <span className="text-sm text-muted-foreground font-medium">Loading events...</span>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12 glass border border-border/40 rounded-2xl">
              <Calendar className="w-12 h-12 text-muted-foreground/60 mb-4" />
              <h3 className="text-lg font-semibold font-heading">No events found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                You haven't created any events yet. Click 'Create Event' to set up your first draw!
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => {
                  const statusColors: Record<string, string> = {
                    scheduled: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
                    active: 'bg-green-500/10 text-green-600 border-green-500/20',
                    completed: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
                  };
    
                  const statusIcons: Record<string, React.ComponentType<{ className?: string }>> = {
                    scheduled: Calendar,
                    active: Play,
                    completed: CheckCircle,
                  };
                  const StatusIcon = statusIcons[event.status] || Calendar;
    
                  const winners = event.vd_event_items
                    ? event.vd_event_items
                        .filter((item: { is_selected: boolean }) => item.is_selected)
                        .sort((a: { selection_order?: number | null }, b: { selection_order?: number | null }) => (a.selection_order || 0) - (b.selection_order || 0))
                    : [];
    
                  return (
                    <Link
                      key={event.id}
                      to={ROUTES.DRAW_ROOM(event.slug)}
                      className="group relative flex flex-col p-4 glass border border-border/40 hover:border-primary/45 rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer block text-left"
                    >
                      <div className="flex items-center justify-between mb-3">
                        {event.status === 'completed' ? (
                          <div className="flex gap-2">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-600 text-2xs font-bold uppercase">
                              Completed
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-secondary text-foreground text-2xs font-bold uppercase">
                              Locked
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-2xs font-bold uppercase ${
                              statusColors[event.status] || ''
                            }`}
                          >
                            <StatusIcon className="w-3.5 h-3.5" />
                            {event.status}
                          </span>
                        )}
  
                        <button
                          onClick={(e) => { e.preventDefault(); handleDelete(event.id, e); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                          title="Delete Event"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
  
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h3 className="font-heading font-extrabold text-lg text-foreground group-hover:text-primary transition-colors leading-snug">
                          {event.event_name}
                        </h3>
                        <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground border border-border/10 font-semibold uppercase">
                          {`VD-${event.id.substring(0, 6).toUpperCase()}`}
                        </span>
                      </div>
  
                      <div className="mt-1.5 text-2sm text-muted-foreground">
                        {formatTime(event.scheduled_start_time)}
                      </div>
  
                      <div className="mt-3 border-t border-border/10 pt-2.5 flex items-center gap-4 text-2sm">
                        <div>
                          <span className="text-muted-foreground font-semibold">Entries:</span>{' '}
                          <span className="font-bold text-foreground">{event.vd_event_items?.length || 0}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground font-semibold">Winners:</span>{' '}
                          <span className="font-bold text-foreground">{event.select_count}</span>
                        </div>
                      </div>
  
                      {winners.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-border/10 space-y-1">
                          <span className="text-3xs font-extrabold uppercase text-muted-foreground tracking-wider block">
                            Winners List
                          </span>
                          <div className="space-y-1 max-h-[100px] overflow-y-auto pr-1">
                            {winners.map((winner: { item_value: string }, idx: number) => (
                              <div key={idx} className="text-2sm font-bold text-foreground flex items-center gap-1.5">
                                <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 leading-none">
                                  #{idx + 1}
                                </span>
                                {winner.item_value}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>

              {hasMore && (
                <div className="flex justify-center pt-2">
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border border-border bg-secondary hover:bg-border/20 text-sm font-semibold transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More Events'
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
