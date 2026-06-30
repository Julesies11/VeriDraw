import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { eventsApi, type EventRow, type EventItemRow } from '@/api/events';
import { seededShuffle } from '@/lib/crypto';
import { getFriendlyErrorMessage, logErrorToDb } from '@/lib/error-helpers';
import { ArrowLeft, CheckCircle, HelpCircle, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { ROUTES } from '@/config/routes.config';

export function VerifyDraw() {
  const { slugOrId } = useParams();
  
  // States for dynamic DB verification
  const [event, setEvent] = useState<EventRow | null>(null);
  const [items, setItems] = useState<EventItemRow[]>([]);
  const [loading, setLoading] = useState(!!slugOrId);
  const [error, setError] = useState('');

  // States for manual verification calculator
  const [manualSeed, setManualSeed] = useState('');
  const [manualEntries, setManualEntries] = useState('');
  const [manualResults, setManualResults] = useState<string[]>([]);
  const [manualCalculated, setManualCalculated] = useState(false);

  // Load event details if slugOrId is provided
  useEffect(() => {
    if (!slugOrId) return;

    const loadEvent = async () => {
      try {
        setLoading(true);
        setError('');
        const eventData = await eventsApi.getBySlugOrId(slugOrId);
        if (!eventData) {
          setError('Event not found.');
          return;
        }

        const itemsData = await eventsApi.listItems(eventData.id);
        setEvent(eventData);
        setItems(itemsData);
      } catch (err: unknown) {
        console.error(err);
        setError(getFriendlyErrorMessage(err, 'Failed to load draw details.'));
        void logErrorToDb(err, { context: 'VerifyDraw.loadEvent', slugOrId });
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [slugOrId]);

  // Compute deterministic order for the database-backed draw
  const verificationResult = useMemo(() => {
    if (!event || items.length === 0 || !event.seed) return null;

    // 1. Get original entry items ordered by setup display_order
    const originalList = [...items].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

    // 2. Perform seeded Fisher-Yates shuffle
    const shuffled = seededShuffle(originalList, event.seed);

    // 3. Compare with stored selection_order from database
    const mapped = shuffled.map((item, index) => {
      const order = index + 1;
      const actualWinner = items.find(i => i.id === item.id);
      const dbOrder = actualWinner?.selection_order || null;
      const isSelected = actualWinner?.is_selected || false;
      const matches = !isSelected || dbOrder === order;

      return {
        item_value: item.item_value,
        calculated_order: order,
        db_order: dbOrder,
        is_selected: isSelected,
        is_valid: matches,
      };
    });

    const allMatch = mapped.every(item => item.is_valid);

    return {
      shuffledList: mapped,
      isVerified: allMatch,
    };
  }, [event, items]);

  // Handle manual calculations
  const handleManualVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSeed.trim() || !manualEntries.trim()) return;

    const lines = manualEntries
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return;

    // Perform seeded shuffle
    const shuffled = seededShuffle(lines, manualSeed.trim());
    setManualResults(shuffled);
    setManualCalculated(true);
  };

  const handleResetManual = () => {
    setManualSeed('');
    setManualEntries('');
    setManualResults([]);
    setManualCalculated(false);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center gap-3 border-b border-border/20 pb-4">
        <Link
          to={event ? ROUTES.DRAW_ROOM(event.slug) : ROUTES.DASHBOARD}
          className="p-2.5 rounded-xl hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </Link>
        <div>
          <span className="text-2xs font-extrabold uppercase text-primary tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Security Center
          </span>
          <h1 className="text-2xl md:text-3xl font-black font-heading tracking-tight mt-0.5">
            Verifiable Random Draw Console
          </h1>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-3">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground font-medium">Verifying drawing ledger...</span>
        </div>
      ) : error ? (
        <div className="p-5 rounded-2xl bg-destructive/10 text-destructive text-sm border border-destructive/20 text-center max-w-md mx-auto space-y-4">
          <p className="font-semibold">{error}</p>
          <Link to={ROUTES.DASHBOARD} className="inline-flex items-center justify-center px-4 py-2 bg-secondary rounded-xl text-foreground text-2sm border border-border font-bold">
            Back to Dashboard
          </Link>
        </div>
      ) : event && verificationResult ? (
        // STAGE A: Database-backed Event Audit view
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Certify Card & Details */}
          <div className="lg:col-span-5 space-y-6">
            {/* Trust Seal Card */}
            <div className={`p-6 rounded-3xl border text-center shadow-lg relative overflow-hidden ${
              verificationResult.isVerified
                ? 'bg-green-500/5 border-green-500/20 text-green-700'
                : 'bg-destructive/5 border-destructive/20 text-destructive'
            }`}>
              {/* Decorative grid background */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(128,128,128,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.02)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

              <div className="relative z-10 space-y-4 flex flex-col items-center">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  verificationResult.isVerified ? 'bg-green-500/10' : 'bg-destructive/10'
                }`}>
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-black font-heading leading-tight">
                    {verificationResult.isVerified ? 'Audit Certified Fair' : 'Audit Certification Failed'}
                  </h2>
                  <p className="text-2xs opacity-85 leading-normal max-w-xs mx-auto">
                    {verificationResult.isVerified 
                      ? 'The sequence recorded in the database matches the pre-published cryptographic seed shuffle results.'
                      : 'The recorded results deviate from the pre-published seed shuffle. Outcome may have been altered.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Event Ledger Info */}
            <div className="p-6 glass border border-border/40 rounded-3xl space-y-4">
              <h3 className="font-heading font-extrabold text-md border-b border-border/20 pb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" /> Draw ledger metadata
              </h3>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-2xs leading-normal">
                <span className="text-muted-foreground">Event Name:</span>
                <span className="text-right text-foreground font-bold">{event.event_name}</span>

                <span className="text-muted-foreground">Draw ID / Code:</span>
                <span className="text-right text-foreground font-mono font-bold uppercase">{event.slug}</span>

                <span className="text-muted-foreground">Audit Seed:</span>
                <span className="text-right text-foreground font-mono text-3xs select-all truncate max-w-[200px]" title={event.seed || ''}>
                  {event.seed}
                </span>

                <span className="text-muted-foreground">Total Entries:</span>
                <span className="text-right text-foreground font-bold">{items.length}</span>

                <span className="text-muted-foreground">Winners Target:</span>
                <span className="text-right text-foreground font-bold">{event.select_count}</span>

                <span className="text-muted-foreground">Verification Method:</span>
                <span className="text-right text-primary font-bold">Seeded Fisher-Yates</span>
              </div>
            </div>

            {/* Audit Explainer FAQ */}
            <div className="p-6 bg-secondary/15 border border-border/30 rounded-3xl space-y-3 leading-relaxed text-2xs text-muted-foreground">
              <h4 className="font-bold text-foreground flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-muted-foreground" /> How does this work?
              </h4>
              <p>
                Before selection began, a secure random hash was published as the event seed. 
              </p>
              <p>
                Using this seed, the entries list was shuffled deterministically. Spectators verify that the order of the actual drawn winners matches this shuffle sequence, ensuring the host could not manipulate the draw.
              </p>
            </div>
          </div>

          {/* Right Column: Comparison Table */}
          <div className="lg:col-span-7 glass border border-border/40 rounded-3xl p-6 space-y-5">
            <h3 className="font-heading font-extrabold text-md border-b border-border/20 pb-2">
              Seeded Sequence Comparison Ledger
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-2xs">
                <thead>
                  <tr className="border-b border-border/20 text-muted-foreground uppercase font-bold tracking-wider">
                    <th className="py-2.5 pb-3">Seeded Order</th>
                    <th className="py-2.5 pb-3">Participant Name</th>
                    <th className="py-2.5 pb-3 text-center">Status</th>
                    <th className="py-2.5 pb-3 text-right">Recorded Winner #</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10 font-medium">
                  {verificationResult.shuffledList.map((item, idx) => (
                    <tr key={idx} className="hover:bg-secondary/10 transition-colors">
                      <td className="py-3 font-mono font-bold text-primary">{item.calculated_order}.</td>
                      <td className="py-3 text-foreground font-bold truncate max-w-[180px]">{item.item_value}</td>
                      <td className="py-3 text-center">
                        {item.is_selected ? (
                          <span className="px-2 py-0.5 rounded-lg bg-green-500/10 text-green-600 font-bold uppercase tracking-wider text-3xs">
                            Selected
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg bg-secondary/80 text-muted-foreground font-bold uppercase tracking-wider text-3xs">
                            Unselected
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right font-mono font-bold">
                        {item.db_order !== null ? (
                          <span className="text-foreground">Winner #{item.db_order}</span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        // STAGE B: Standalone Seed Shuffle Calculator
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Form Input */}
          <form onSubmit={handleManualVerify} className="lg:col-span-5 glass border border-border/40 rounded-3xl p-6 space-y-5">
            <h3 className="font-heading font-extrabold text-md border-b border-border/20 pb-2">
              Verify Seed Calculator
            </h3>
            
            <div className="space-y-1.5">
              <label className="text-2sm font-semibold text-muted-foreground block">
                Cryptographic Seed
              </label>
              <input
                type="text"
                required
                value={manualSeed}
                onChange={e => setManualSeed(e.target.value)}
                placeholder="Paste the 64-char verification seed hash"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-input text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-2sm font-semibold text-muted-foreground block">
                Original Entries (one per line, exact order as created)
              </label>
              <textarea
                rows={8}
                required
                value={manualEntries}
                onChange={e => setManualEntries(e.target.value)}
                placeholder="Sarah Jones&#10;David Miller&#10;Emma Smith"
                className="w-full px-4 py-3 rounded-xl border border-border bg-input text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-y"
              />
            </div>

            <div className="flex gap-3.5 pt-2">
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-tr from-primary to-accent text-white font-bold shadow-md shadow-primary/20 hover:opacity-90 transition-all cursor-pointer select-none"
              >
                <ShieldCheck className="w-4.5 h-4.5" />
                Compute Verification
              </button>
              {manualCalculated && (
                <button
                  type="button"
                  onClick={handleResetManual}
                  className="px-4 py-3 rounded-xl bg-secondary hover:bg-border/20 border border-border text-foreground font-semibold transition-all cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {/* Right Column: Calculator Output */}
          <div className="lg:col-span-7 glass border border-border/40 rounded-3xl p-6 min-h-[380px] flex flex-col justify-start">
            {manualCalculated && manualResults.length > 0 ? (
              <div className="space-y-5 animate-fade-in">
                <div className="border-b border-border/20 pb-2">
                  <h3 className="font-heading font-extrabold text-md">
                    Deterministic Shuffle Results
                  </h3>
                </div>
                
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {manualResults.map((val, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-secondary border border-border/40 shadow-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5.5 h-5.5 rounded-lg bg-primary/15 text-primary font-bold text-2xs flex items-center justify-center">
                          {index + 1}.
                        </span>
                        <span className="text-2sm font-bold text-foreground truncate max-w-[320px]">
                          {val}
                        </span>
                      </div>
                      <span className="text-3xs font-extrabold text-primary uppercase tracking-wide">
                        Verified Position
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="m-auto text-center space-y-3 py-10 max-w-sm">
                <ShieldCheck className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <h4 className="font-heading font-extrabold text-sm text-foreground">
                  Verify Math calculations
                </h4>
                <p className="text-2xs text-muted-foreground leading-normal">
                  Enter the event verification seed and original candidate items to run the deterministic shuffle algorithm in your local browser sandbox.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VerifyDraw;
