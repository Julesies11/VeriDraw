import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes.config';
import { ArrowLeft, ArrowRight, Play, Trophy, Sparkles, Upload, List, Save, Copy, Share2, Settings, Volume2, VolumeX } from 'lucide-react';
import { RouletteWheel } from '@/components/roulette/RouletteWheel';
import confetti from 'canvas-confetti';
import { audioManager } from '@/lib/audio';
import { eventsApi } from '@/api/events';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';
import { generateSecureCode, seededShuffle } from '@/lib/crypto';
import { GoLiveModal } from '@/components/modals/GoLiveModal';
import { ShareResultsModal } from '@/components/modals/ShareResultsModal';

interface QuickDrawItem {
  id: string;
  item_value: string;
  is_selected: boolean;
  selection_order?: number | null;
}

export function QuickDraw() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Navigation tabs for data entry
  const [activeTab, setActiveTab] = useState<'paste' | 'csv'>('paste');

  // Input states
  const [itemsText, setItemsText] = useState('');
  const [selectCount, setSelectCount] = useState<number | ''>(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Wheel animation states
  const [items, setItems] = useState<QuickDrawItem[]>([]);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinDuration] = useState(4000);
  const [localWinner, setLocalWinner] = useState<string | null>(null);
  const [showWinnerBanner, setShowWinnerBanner] = useState(false);
  const [completedDrawId, setCompletedDrawId] = useState<string | null>(null);
  const [completedTimestamp, setCompletedTimestamp] = useState<string | null>(null);
  const [duplicatedFromSlug, setDuplicatedFromSlug] = useState<string | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [isGoLiveModalOpen, setIsGoLiveModalOpen] = useState(false);
  const [isShareResultsModalOpen, setIsShareResultsModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const [muted, setMuted] = useState(() => audioManager.isMuted());
  const toggleMute = () => {
    const nextMuted = !muted;
    audioManager.setMuted(nextMuted);
    setMuted(nextMuted);
  };


  const handleStartLocalDraw = () => {
    setError('');
    if (items.length < 2) {
      setError('Please add at least 2 entries to run a draw.');
      return;
    }
    if (selectCount === '') {
      setError('Please enter the number of winners to draw.');
      return;
    }
    const targetCount = selectCount;
    if (isNaN(targetCount) || targetCount <= 0) {
      setError('Number of winners must be at least 1.');
      return;
    }
    if (targetCount > items.length) {
      setError(`Select count (${targetCount}) cannot exceed the number of entries supplied (${items.length}).`);
      return;
    }
    setStep(2);
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleGoLiveClick = () => {
    setError('');
    if (items.length < 2) {
      setError('Please add at least 2 entries before going live.');
      return;
    }
    if (selectCount === '') {
      setError('Please enter the number of winners to draw.');
      return;
    }
    const targetCount = selectCount;
    if (isNaN(targetCount) || targetCount <= 0) {
      setError('Number of winners must be at least 1.');
      return;
    }
    if (targetCount > items.length) {
      setError(`Select count (${targetCount}) cannot exceed the number of entries supplied (${items.length}).`);
      return;
    }
    setIsGoLiveModalOpen(true);
  };

  // Derived lists for rendering
  const activeItems = useMemo(() => {
    return items.filter((item) => !item.is_selected);
  }, [items]);

  const selectedItems = useMemo(() => {
    return items
      .filter((item) => item.is_selected)
      .sort((a, b) => (a.selection_order || 0) - (b.selection_order || 0));
  }, [items]);

  const winnerItem = useMemo(() => {
    if (!localWinner) return null;
    return items.find((item) => item.id === localWinner) || null;
  }, [localWinner, items]);

  const isCompleted = useMemo(() => {
    const target = selectCount === '' ? 1 : selectCount;
    return !isSpinning && !showWinnerBanner && selectedItems.length > 0 && selectedItems.length === target;
  }, [isSpinning, showWinnerBanner, selectedItems, selectCount]);

  // Perform client-side random spin
  const handleSpin = useCallback(() => {
    if (isSpinning || activeItems.length === 0) return;
    setError('');

    const targetCount = selectCount === '' ? 1 : selectCount;
    if (targetCount > items.length) {
      setError(`Select count (${targetCount}) cannot exceed the number of items supplied (${items.length}).`);
      return;
    }

    // Dismiss previous banner if active
    setShowWinnerBanner(false);
    setLocalWinner(null);

    let activeSeed = seed;
    let currentItems = [...items];

    // If seed doesn't exist, we generate it and pre-shuffle the items deterministically
    if (!activeSeed) {
      const bytes = new Uint8Array(32);
      window.crypto.getRandomValues(bytes);
      activeSeed = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setSeed(activeSeed);

      // Deterministically shuffle
      const shuffled = seededShuffle(items, activeSeed);
      currentItems = items.map((item) => {
        const idx = shuffled.findIndex((s) => s.id === item.id);
        return {
          ...item,
          selection_order: idx + 1,
        };
      });
      setItems(currentItems);
    }

    const currentSelected = currentItems.filter((i) => i.is_selected).length;
    const nextOrder = currentSelected + 1;

    // Find the pre-calculated winner
    const selected = currentItems.find((item) => item.selection_order === nextOrder);
    if (!selected) {
      setError('Failed to resolve deterministic selection.');
      return;
    }

    // Find index of the selected item in the remaining active items list (ordered by original display/index order)
    const currentActiveItems = currentItems.filter((item) => !item.is_selected);
    const randomIndex = currentActiveItems.findIndex((item) => item.id === selected.id);

    if (randomIndex === -1) {
      setError('Winner not found in remaining entries.');
      return;
    }

    // Compute target angle
    const count = currentActiveItems.length;
    const sliceAngle = 360 / count;
    const offset = Math.random() * (sliceAngle - 2) + 1;
    const targetAngle = rotationAngle + 360 * 5 + (randomIndex * sliceAngle) + offset;

    // Trigger spinning animation
    setIsSpinning(true);
    setRotationAngle(targetAngle);

    // After animation completes
    setTimeout(() => {
      setIsSpinning(false);
      setLocalWinner(selected.id);
      setShowWinnerBanner(true);

      // Mark item as selected
      const selectionCount = currentSelected + 1;
      const updatedItems = currentItems.map((item) =>
        item.id === selected.id
          ? { ...item, is_selected: true, selection_order: selectionCount }
          : item
      );
      setItems(updatedItems);

      // Woo factor confetti
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
      });
      audioManager.playWin();

      if (selectionCount === targetCount) {
        const randomId = `VD-${generateSecureCode(6)}`;
        const utcStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        setCompletedDrawId(randomId);
        setCompletedTimestamp(utcStr);

        // Async save to database
        eventsApi
          .createCompletedQuickDraw(
            randomId,
            updatedItems.map((item) => ({
              item_value: item.item_value,
              is_selected: item.is_selected,
              selection_order: item.selection_order ?? undefined,
            })),
            activeSeed,
            duplicatedFromSlug
          )
          .then((event) => {
            if (event && event.slug) {
              setCompletedDrawId(event.slug);
            }
          })
          .catch((err) => {
            console.error('[QuickDraw DB Save Error]', err);
            void logErrorToDb(err, { context: 'QuickDraw.handleSpin.saveCompleted', seed: activeSeed });
          });
      }
    }, spinDuration);
  }, [isSpinning, activeItems, selectCount, items, rotationAngle, spinDuration, duplicatedFromSlug, seed]);

  // Parse itemsText into items array
  const updateItemsFromText = (text: string) => {
    setItemsText(text);
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const newItems = lines.map((line, idx) => ({
      id: `local-${idx}`,
      item_value: line,
      is_selected: false,
    }));
    setItems(newItems);
  };

  // Auto spin loop for multi-draw target count
  useEffect(() => {
    if (isSpinning) return;
    if (showWinnerBanner) {
      const targetCount = selectCount === '' ? 1 : selectCount;
      const currentSelected = items.filter((i) => i.is_selected).length;
      if (currentSelected < targetCount && currentSelected < items.length) {
        // Wait 2500ms to show the winner, then dismiss banner and spin again
        const timer = setTimeout(() => {
          setShowWinnerBanner(false);
          handleSpin();
        }, 2500);
        return () => clearTimeout(timer);
      } else {
        // Draw completed: auto-dismiss final winner banner after 2500ms to show finished overlay
        const timer = setTimeout(() => {
          setShowWinnerBanner(false);
        }, 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [items, isSpinning, showWinnerBanner, selectCount, handleSpin]);

  // Handle CSV file upload parsing
  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const parsedItems = text
        .split(/[\r\n]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      
      updateItemsFromText(parsedItems.join('\n'));
    };
    reader.readAsText(file);
  };

  // Reset local wheel selections
  const handleReset = () => {
    if (isSpinning) return;
    setRotationAngle(0);
    setLocalWinner(null);
    setShowWinnerBanner(false);
    setCompletedDrawId(null);
    setCompletedTimestamp(null);
    setSeed(null);
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        is_selected: false,
        selection_order: undefined,
      }))
    );
  };

  // Re-initialize a completely fresh local draw
  const handleCreateNewDraw = () => {
    setItemsText('');
    setItems([]);
    setSelectCount(1);
    setError('');
    setActiveTab('paste');
    setRotationAngle(0);
    setLocalWinner(null);
    setShowWinnerBanner(false);
    setCompletedDrawId(null);
    setCompletedTimestamp(null);
    setSeed(null);
    setDuplicatedFromSlug(null);
    setStep(1);
    const mainElement = document.querySelector('main');
    if (mainElement) {
      mainElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };


  // Dismiss winner banner smoothly
  const handleDismissWinner = () => {
    setShowWinnerBanner(false);
  };

  // Convert local draw into database backed live session
  const handleGoLive = async (
    customEventName: string,
    requireViewerLogin: boolean,
    startTime: string = new Date().toISOString(),
    status: 'active' | 'scheduled' = 'active'
  ) => {
    const lines = items.map((i) => i.item_value);
    if (lines.length === 0) {
      setError('Please provide at least one item before going live.');
      return;
    }

    const targetCount = selectCount === '' ? 1 : selectCount;
    if (targetCount > lines.length) {
      setError(`Select count (${targetCount}) cannot exceed the number of items supplied (${lines.length}).`);
      return;
    }

    try {
      setLoading(true);
      setError('');

      if (user) {
        // Logged in: Create live room directly and redirect
        const newEvent = await eventsApi.create(
          {
            event_name: customEventName,
            scheduled_start_time: startTime,
            item_type: 'custom',
            select_count: targetCount,
            require_viewer_login: requireViewerLogin,
            status: status,
          },
          lines
        );
        setIsGoLiveModalOpen(false);
        navigate(ROUTES.DRAW_ROOM(newEvent.slug));
      } else {
        // Anonymous: Save candidate state to sessionStorage and navigate to Login
        sessionStorage.setItem(
          'quick_draw_upgrade',
          JSON.stringify({
            items: lines,
            selectCount: targetCount,
            eventName: customEventName,
            requireViewerLogin: requireViewerLogin,
            scheduledStartTime: startTime,
            status: status,
          })
        );
        setIsGoLiveModalOpen(false);
        navigate(ROUTES.LOGIN);
      }
    } catch (err: unknown) {
      console.error(err);
      setError(getFriendlyErrorMessage(err, 'Failed to create live event.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto pb-28 sm:pb-0">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/20 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (step > 1) {
                handleReset();
                setStep(1);
              } else {
                navigate(ROUTES.DASHBOARD);
              }
            }}
            className="p-2.5 rounded-xl hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Back"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-black font-heading tracking-tight mt-0.5">
              Quick Draw
            </h1>
            <p className="text-2xs text-muted-foreground mt-1 max-w-sm leading-normal">
              Create an instant random selection. No account required.
            </p>
          </div>
        </div>
      </div>

      {/* STEP 1: Setup Draw */}
      {step === 1 && (
        <div className="max-w-xl mx-auto p-4 sm:p-6 glass border border-border/40 rounded-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-border/20 pb-2.5">
            <h2 className="text-md font-extrabold font-heading text-primary flex items-center gap-2">
              <List className="w-4.5 h-4.5" />
              1. Add entries
            </h2>
            <span className="text-2xs px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold">
              Total: {items.length}
            </span>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-secondary/50 p-1 rounded-xl border border-border/30">
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`flex-1 py-1.5 text-2sm font-semibold rounded-lg transition-all ${
                activeTab === 'paste' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              Enter List
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('csv')}
              className={`flex-1 py-1.5 text-2sm font-semibold rounded-lg transition-all ${
                activeTab === 'csv' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
              }`}
            >
              CSV Upload
            </button>
          </div>

          {/* Tab Content A: Paste List */}
          {activeTab === 'paste' && (
            <div className="space-y-1.5">
              <label className="text-2sm font-semibold text-muted-foreground">
                Enter or paste entries (one per line)
              </label>
              <textarea
                id="entry-textarea"
                rows={8}
                value={itemsText}
                onChange={(e) => updateItemsFromText(e.target.value)}
                placeholder="Sarah Jones&#10;David Miller&#10;Emma Smith"
                className="w-full px-4 py-3 rounded-xl border border-border bg-input text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-y"
              />
            </div>
          )}

          {/* Tab Content B: CSV Upload */}
          {activeTab === 'csv' && (
            <div className="space-y-3">
              <label className="text-2sm font-semibold text-muted-foreground block">
                Drag & drop or select a text file
              </label>
              <div className="border-2 border-dashed border-border/80 hover:border-primary/50 rounded-2xl p-6 text-center transition-all bg-input relative">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="w-8 h-8 mx-auto text-muted-foreground/60 mb-2.5" />
                <span className="text-sm font-medium text-foreground block">
                  Select CSV or TXT file
                </span>
              </div>
            </div>
          )}

          {/* Select count picker */}
          <div className="space-y-1.5 pt-4 border-t border-border/20">
            <h2 className="text-md font-extrabold font-heading text-primary flex items-center gap-2 pb-1.5">
              <Settings className="w-4.5 h-4.5" />
              2. Draw Settings
            </h2>
            <label className="text-2sm font-semibold text-muted-foreground block">
              How many winners should be drawn?
            </label>
            <input
              type="number"
              min="1"
              max={items.length || 1}
              value={selectCount}
              onChange={(e) => {
                const val = e.target.value;
                setSelectCount(val === '' ? '' : parseInt(val) || 1);
              }}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center animate-fade-in">
              {error}
            </div>
          )}

          <div className="pt-6 border-t border-border/20">
            {/* Desktop Actions */}
            <div className="hidden sm:flex flex-col items-center gap-4">
              <button
                onClick={handleStartLocalDraw}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer whitespace-nowrap font-heading text-base animate-pulse-subtle"
              >
                Continue
                <ArrowRight className="w-5 h-5" />
              </button>
              
              <div className="text-2xs font-extrabold text-muted-foreground/60 uppercase tracking-widest">
                or
              </div>

              <div className="w-full flex flex-col items-center gap-2">
                <button
                  onClick={handleGoLiveClick}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-bold transition-all cursor-pointer font-heading"
                >
                  <Save className="w-4.5 h-4.5" />
                  Go Live Instead
                </button>
                <p className="text-3xs text-muted-foreground text-center max-w-xs leading-normal font-medium">
                  Turn this into a scheduled live event and invite spectators.
                </p>
              </div>
            </div>

            {/* Mobile Sticky Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md p-4 flex gap-3 sm:hidden animate-fade-in">
              <button
                onClick={handleGoLiveClick}
                className="flex-1 py-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-bold text-2sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                Go Live
              </button>
              <button
                onClick={handleStartLocalDraw}
                className="flex-1 py-3 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold text-2sm transition-all cursor-pointer flex items-center justify-center gap-1.5 animate-pulse-subtle"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Spin Wheel & Results */}
      {step === 2 && (
        <>
          {isCompleted ? (
            /* Centered Completed Results Panel */
            <div className="max-w-xl mx-auto p-4 sm:p-6 glass border border-border/40 rounded-2xl flex flex-col items-center relative space-y-5 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Trophy className="w-6 h-6 text-yellow-500" />
              </div>
              <div className="text-center space-y-0.5 shrink-0">
                <h3 className="text-lg font-black font-heading tracking-tight text-foreground">
                  Draw Completed!
                </h3>
              </div>

              {/* Selections List */}
              <div className="w-full max-w-sm space-y-2 max-h-[160px] overflow-y-auto pr-1 shrink-0">
                {selectedItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-secondary border border-border/40 shadow-sm"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-primary/15 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="text-2sm font-bold text-foreground truncate max-w-[180px] shrink-0">
                        {item.item_value}
                      </span>
                    </div>
                    <span className="text-3xs font-extrabold text-primary uppercase tracking-wide shrink-0">
                      Selected Winner
                    </span>
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
                  <div className="self-start pt-1">Draw ID:</div>
                  <div className="text-right flex flex-col items-end">
                    <div className="font-mono text-foreground font-bold flex items-center justify-end gap-1">
                      <span>{completedDrawId || 'N/A'}</span>
                      {completedDrawId && (
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/draw/${completedDrawId}`;
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
                    {duplicatedFromSlug && (
                      <span className="text-3xs text-muted-foreground font-light italic mt-0.5 leading-normal">
                        Duplicated from {duplicatedFromSlug}
                      </span>
                    )}
                  </div>
                  <div>Completed:</div>
                  <div className="text-right text-foreground whitespace-nowrap">{completedTimestamp || 'N/A'}</div>
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

              {/* Completed Actions - Sticky on Mobile */}
              <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md p-4 flex gap-3 sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:border-t-0 sm:bg-transparent sm:p-0 sm:flex-col sm:gap-3 w-full sm:max-w-xs shrink-0 animate-fade-in">
                <button
                  onClick={() => setIsShareResultsModalOpen(true)}
                  className="flex-1 sm:flex-initial py-3 rounded-xl bg-gradient-to-tr from-primary to-accent hover:opacity-95 text-white font-bold shadow-md shadow-primary/25 transition-all cursor-pointer flex items-center justify-center gap-1.5 text-2sm sm:text-base"
                >
                  <Share2 className="w-4.5 h-4.5" />
                  Share Results
                </button>
                <button
                  onClick={handleCreateNewDraw}
                  className="flex-1 sm:flex-initial py-3 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer flex items-center justify-center gap-1.5 text-2sm sm:text-base"
                >
                  <Sparkles className="w-4.5 h-4.5" />
                  New Draw
                </button>
              </div>
            </div>
          ) : (
            /* Active Draw Grid */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: Wheel Canvas & Controls (takes 8 cols) */}
              <div className="lg:col-span-8 p-4 sm:p-6 glass border border-border/40 rounded-2xl flex flex-col items-center relative min-h-[380px] lg:min-h-[460px]">
                {/* Mute/Unmute Control */}
                <button
                  onClick={toggleMute}
                  className="absolute top-4 right-4 z-20 p-2 rounded-xl bg-secondary hover:bg-border/30 border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-sm active:scale-95"
                  title={muted ? "Unmute Sounds" : "Mute Sounds"}
                >
                  {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>

                {/* Winner Banner */}
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

                {selectedItems.length === 0 && !isSpinning && (
                  <p className="text-2xs text-muted-foreground text-center mb-2 font-medium animate-fade-in">
                    Everything is ready. Click "Spin Wheel" to begin the draw.
                  </p>
                )}

                {/* SVG Wheel */}
                <div className="w-full flex items-center justify-center py-4">
                  <RouletteWheel
                    items={items}
                    rotationAngle={rotationAngle}
                    isSpinning={isSpinning}
                    spinDurationMs={spinDuration}
                  />
                </div>

                {error && (
                  <div className="w-full mt-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center animate-fade-in">
                    {error}
                  </div>
                )}

                {/* Local Action Buttons - Sticky on Mobile */}
                <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-md p-4 flex gap-3 sm:relative sm:bottom-auto sm:left-auto sm:right-auto sm:border-t-0 sm:bg-transparent sm:p-0 sm:mt-6 animate-fade-in">
                  <button
                    onClick={() => {
                      handleReset();
                      setStep(1);
                    }}
                    disabled={isSpinning}
                    className="py-3 px-4 sm:py-3.5 sm:px-5 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-bold text-2sm sm:text-base transition-all cursor-pointer select-none shrink-0 sm:shrink"
                  >
                    Setup
                  </button>
                  <button
                    onClick={handleSpin}
                    disabled={isSpinning || activeItems.length === 0 || items.filter((i) => i.is_selected).length >= (selectCount || 1)}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 sm:py-3.5 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none text-2sm sm:text-base"
                  >
                    <Play className="w-4.5 h-4.5" />
                    Spin Wheel
                  </button>
                </div>
              </div>

              {/* Right Column: Selections List */}
              <div className="lg:col-span-4 p-4 sm:p-6 glass border border-border/40 rounded-2xl space-y-4">
                <div className="border-b border-border/20 pb-2 flex items-center justify-between">
                  <h2 className="text-md font-extrabold font-heading text-foreground flex items-center gap-2">
                    <Trophy className="w-4.5 h-4.5 text-yellow-500" />
                    Selections
                  </h2>
                  <span className="text-2xs font-bold px-2 py-0.5 rounded-lg bg-secondary/80 text-muted-foreground">
                    {selectedItems.length} / {selectCount || 1}
                  </span>
                </div>

                {selectedItems.length === 0 ? (
                  <div className="py-12 text-center text-2xs text-muted-foreground italic">
                    No items selected yet. Click Spin to draw a winner!
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {selectedItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/10 shadow-sm animate-fade-in"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}.
                          </span>
                          <span className="text-2sm font-semibold text-foreground truncate max-w-[140px] shrink-0">
                            {item.item_value}
                          </span>
                        </div>
                        <span className="text-3xs font-extrabold text-muted-foreground uppercase tracking-wide shrink-0">
                          Picked
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Go Live Confirmation Modal */}
      {isGoLiveModalOpen && (
        <GoLiveModal
          isOpen={isGoLiveModalOpen}
          onClose={() => setIsGoLiveModalOpen(false)}
          user={user}
          onConfirm={handleGoLive}
          loading={loading}
        />
      )}

      {/* Share Results Modal */}
      {completedDrawId && (
        <ShareResultsModal
          isOpen={isShareResultsModalOpen}
          onClose={() => setIsShareResultsModalOpen(false)}
          eventName="Quick Draw"
          eventSlug={completedDrawId}
          winners={selectedItems}
          totalEntriesCount={items.length}
        />
      )}
    </div>
  );
}

export default QuickDraw;
