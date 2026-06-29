import { useState, useMemo } from 'react';
import { Copy, Share2, Check } from 'lucide-react';

interface ShareResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventName: string;
  eventSlug: string;
  winners: Array<{ item_value: string; selection_order?: number | null }>;
  totalEntriesCount: number;
}

export function ShareResultsModal({
  isOpen,
  onClose,
  eventName,
  eventSlug,
  winners,
  totalEntriesCount
}: ShareResultsModalProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);

  const shortCode = useMemo(() => {
    const cleanCode = eventSlug.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode);
    if (isUuid) {
      return cleanCode.substring(0, 6).toUpperCase();
    }
    const parts = cleanCode.split('-');
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.length === 6) {
      return lastPart.toUpperCase();
    }
    return cleanCode.toUpperCase();
  }, [eventSlug]);

  const displayId = useMemo(() => {
    if (/^VD-/i.test(shortCode)) {
      return shortCode.toUpperCase();
    }
    return `VD-${shortCode.toUpperCase()}`;
  }, [shortCode]);

  const replayUrl = useMemo(() => {
    return `${window.location.origin}/replay/${shortCode}`;
  }, [shortCode]);

  const sortedWinners = useMemo(() => {
    return [...winners]
      .filter((w) => w.selection_order != null)
      .sort((a, b) => (a.selection_order || 0) - (b.selection_order || 0));
  }, [winners]);

  const summaryText = useMemo(() => {
    const winnerLines = sortedWinners
      .map((w, idx) => `${idx + 1}. ${w.item_value}`)
      .join('\n');

    return [
      `🎉 VeriDraw Results`,
      ``,
      `Event:`,
      eventName,
      ``,
      `Selected Entries:`,
      winnerLines,
      ``,
      `Entries: ${totalEntriesCount}`,
      `Draw ID: ${displayId}`,
      ``,
      `Replay & Verification:`,
      replayUrl
    ].join('\n');
  }, [eventName, sortedWinners, replayUrl, totalEntriesCount, displayId]);

  const handleCopySummary = () => {
    navigator.clipboard.writeText(summaryText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleShare = async () => {
    const shareData = {
      title: `${eventName} - Draw Results`,
      text: summaryText,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Error sharing:', err);
          handleCopySummary();
        }
      }
    } else {
      handleCopySummary();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in animate-duration-200">
      <div className="bg-background border border-border/80 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5.5 relative animate-scale-in my-8">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer font-bold"
          aria-label="Close share modal"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center space-y-1">
          <h3 className="text-xl font-black font-heading tracking-tight text-foreground">Share Results</h3>
          <p className="text-2sm text-muted-foreground leading-relaxed">
            Copy the results summary or share it directly to your group chats.
          </p>
        </div>

        {/* Results Summary Section */}
        <div className="space-y-4">
          <div className="space-y-0.5">
            <span className="text-2sm font-bold text-foreground block">Results Summary</span>
            <span className="text-3xs text-muted-foreground block font-medium">
              Copy-paste results summary with visual replay link.
            </span>
          </div>
          
          <textarea
            rows={8}
            readOnly
            value={summaryText}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-input text-foreground text-3xs font-mono focus:outline-none select-all resize-none"
          />

          <div className="flex gap-2.5">
            <button
              onClick={handleCopySummary}
              className={`flex-1 py-2.5 rounded-xl font-bold text-2sm transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                copiedSummary
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-secondary hover:bg-border/20 border border-border text-foreground'
              }`}
            >
              {copiedSummary ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedSummary ? 'Summary Copied!' : 'Copy Summary'}
            </button>
            
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 py-2.5 rounded-xl font-bold text-2sm bg-primary text-primary-foreground hover:opacity-90 shadow-md shadow-primary/10 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Share2 className="w-4 h-4" />
              Share Summary
            </button>
          </div>
          
          {copiedSummary && (
            <span className="text-3xs font-bold text-green-500 block text-center animate-pulse">
              ✅ Summary copied to clipboard.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareResultsModal;
