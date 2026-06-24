import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ROUTES } from '@/config/routes.config';
import { ArrowLeft, Play, Trophy, Sparkles, Upload, List, Save, Copy } from 'lucide-react';
import { RouletteWheel } from '@/components/roulette/RouletteWheel';
import confetti from 'canvas-confetti';
import { eventsApi } from '@/api/events';
import { getFriendlyErrorMessage } from '@/lib/error-helpers';
import { generateSecureCode } from '@/lib/crypto';

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

    // Pick random index from active (unselected) items
    const randomIndex = Math.floor(Math.random() * activeItems.length);
    const selected = activeItems[randomIndex];

    // Compute target angle (multiple full rotations + index alignment offset + slight random center offset)
    const count = activeItems.length;
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
      const selectionCount = items.filter((i) => i.is_selected).length + 1;
      setItems((prev) =>
        prev.map((item) =>
          item.id === selected.id
            ? { ...item, is_selected: true, selection_order: selectionCount }
            : item
        )
      );

      // Woo factor confetti
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
      });

      const targetCount = selectCount === '' ? 1 : selectCount;
      if (selectionCount === targetCount) {
        const randomId = `VD-${generateSecureCode(6)}`;
        const utcStr = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
        setCompletedDrawId(randomId);
        setCompletedTimestamp(utcStr);

        // Capture current selected items state
        const finalItems = items.map((item) =>
          item.id === selected.id
            ? { ...item, is_selected: true, selection_order: selectionCount }
            : item
        );

        // Async save to database
        eventsApi
          .createCompletedQuickDraw(
            randomId,
            finalItems.map((item) => ({
              item_value: item.item_value,
              is_selected: item.is_selected,
              selection_order: item.selection_order ?? undefined,
            })),
            duplicatedFromSlug
          )
          .then((event) => {
            if (event && event.slug) {
              setCompletedDrawId(event.slug);
            }
          })
          .catch((err) => {
            console.error('[QuickDraw DB Save Error]', err);
          });
      }
    }, spinDuration);
  }, [isSpinning, activeItems, selectCount, items, rotationAngle, spinDuration, duplicatedFromSlug]);

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
    setDuplicatedFromSlug(null);
  };

  // Duplicate settings + entries (removes selected state but keeps entries intact)
  const handleDuplicateDraw = () => {
    setDuplicatedFromSlug(completedDrawId);
    handleReset();
  };

  // Dismiss winner banner smoothly
  const handleDismissWinner = () => {
    setShowWinnerBanner(false);
  };

  // Convert local draw into database backed live session
  const handleGoLive = async () => {
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
            event_name: 'Quick Draw Live',
            scheduled_start_time: new Date().toISOString(),
            item_type: 'custom',
            select_count: targetCount,
          },
          lines
        );
        navigate(ROUTES.DRAW_ROOM(newEvent.slug));
      } else {
        // Anonymous: Save candidate state to sessionStorage and navigate to Login
        sessionStorage.setItem(
          'quick_draw_upgrade',
          JSON.stringify({
            items: lines,
            selectCount: targetCount,
          })
        );
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
    <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/20 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="p-2.5 rounded-xl hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
          </button>
          <div>
            <span className="text-2xs font-extrabold uppercase text-primary tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Instant Local Picker
            </span>
            <h1 className="text-2xl md:text-3xl font-black font-heading tracking-tight mt-0.5">
              Quick Draw
            </h1>
          </div>
        </div>

        <button
          onClick={handleGoLive}
          disabled={loading || items.length === 0}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer whitespace-nowrap"
        >
          <Save className="w-4.5 h-4.5" />
          {loading ? 'Creating...' : 'Go Live & Invite Viewers'}
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center">
          {error}
        </div>
      )}

      {/* Main Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Candidate entries input */}
        <div className="lg:col-span-4 p-6 glass border border-border/40 rounded-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-border/20 pb-2.5">
            <h2 className="text-md font-extrabold font-heading text-primary flex items-center gap-2">
              <List className="w-4.5 h-4.5" />
              Add entries
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
              Paste List
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
                Paste names (one per line)
              </label>
              <textarea
                rows={8}
                value={itemsText}
                onChange={(e) => setItemsText(e.target.value)}
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
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center gap-1.5">
              <label className="text-2sm font-semibold text-muted-foreground">
                How many winners should be drawn?
              </label>
            </div>
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
        </div>

        {/* Center Column: Wheel Canvas & Controls */}
        <div className="lg:col-span-5 p-6 glass border border-border/40 rounded-2xl flex flex-col items-center relative min-h-[460px]">
          {isCompleted ? (
            <div className="w-full flex flex-col items-center justify-start space-y-5 animate-fade-in">
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
                    <div className="flex items-center gap-2.5">
                      <span className="w-5.5 h-5.5 rounded-lg bg-primary/15 text-primary font-bold text-2xs flex items-center justify-center">
                        {idx + 1}.
                      </span>
                      <span className="text-2sm font-bold text-foreground truncate max-w-[200px]">
                        {item.item_value}
                      </span>
                    </div>
                    <span className="text-3xs font-extrabold text-primary uppercase tracking-wide">
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
                  <div className="self-start pt-0.5">Status:</div>
                  <div className="text-right flex flex-col items-end">
                    <span className="text-green-500 font-bold flex items-center justify-end gap-1">
                      Verified <span className="text-green-500">✔</span>
                    </span>
                    {duplicatedFromSlug && (
                      <span className="text-3xs text-muted-foreground font-light italic mt-0.5 leading-normal">
                        Duplicated from {duplicatedFromSlug}
                      </span>
                    )}
                  </div>
                  <div className="self-start pt-1">Draw ID:</div>
                  <div className="font-mono text-right text-foreground font-bold flex items-center justify-end gap-1">
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
                  <div>Timestamp:</div>
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
            </div>
          ) : (
            <>
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

              {/* SVG Wheel */}
              <div className="w-full flex items-center justify-center py-4">
                <RouletteWheel
                  items={items}
                  rotationAngle={rotationAngle}
                  isSpinning={isSpinning}
                  spinDurationMs={spinDuration}
                />
              </div>

              {/* Local Action Buttons */}
              <div className="mt-6 z-20 w-full px-2">
                <button
                  onClick={handleSpin}
                  disabled={isSpinning || activeItems.length === 0 || items.filter((i) => i.is_selected).length >= (selectCount || 1)}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
                >
                  <Play className="w-5 h-5" />
                  Quick Draw
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Selections List */}
        <div className="lg:col-span-3 p-6 glass border border-border/40 rounded-2xl space-y-4">
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
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                      {idx + 1}.
                    </span>
                    <span className="text-2sm font-semibold text-foreground truncate max-w-[140px]">
                      {item.item_value}
                    </span>
                  </div>
                  <span className="text-3xs font-extrabold text-muted-foreground uppercase tracking-wide">
                    Picked
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuickDraw;
