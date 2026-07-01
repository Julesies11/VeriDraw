import { useState } from 'react';
import { Copy, Share2, Check } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteCode: string;
  /** Full event slug (e.g. "my-event-njrc0l") used to build the share link. */
  eventSlug: string;
}

export function InviteModal({ isOpen, onClose, inviteCode, eventSlug }: InviteModalProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    if (!eventSlug) return;
    const link = `${window.location.origin}/draw/${eventSlug}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = async () => {
    if (!eventSlug) return;
    const link = `${window.location.origin}/draw/${eventSlug}`;
    
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-background border-t border-x border-border/80 sm:border rounded-t-3xl rounded-b-none sm:rounded-3xl p-6 max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl space-y-5.5 relative animate-slide-up sm:animate-scale-in">
        {/* Drag Handle Indicator for Mobile Bottom Sheet */}
        <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full mx-auto mb-1 sm:hidden shrink-0" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer font-bold sm:top-4 sm:right-4"
          aria-label="Close invite modal"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center space-y-1">
          <h3 className="text-xl font-black font-heading tracking-tight text-foreground">Invite Spectators</h3>
          <p className="text-2sm text-muted-foreground leading-relaxed">
            Share this draw event with others so they can join and watch live!
          </p>
        </div>

        {/* Share Link (Recommended) Section */}
        <div className="space-y-2">
          <div className="space-y-0.5">
            <span className="text-2sm font-bold text-foreground block">Share Link (Recommended)</span>
            <span className="text-3xs text-muted-foreground block font-medium">Anyone with this link can join the event.</span>
          </div>
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/draw/${eventSlug}`}
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
              {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedLink ? 'Copied!' : 'Copy Link'}
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

        {/* Event Code Section */}
        <div className="pt-4 border-t border-border/10 space-y-2.5 text-center">
          <div className="space-y-0.5">
            <span className="text-2sm font-bold text-foreground block">Event Code</span>
            <span className="text-3xs text-muted-foreground block font-medium">Already on VeriDraw? Join using this event code:</span>
          </div>
          <button
            onClick={handleCopyCode}
            className="text-4xl font-black font-mono tracking-wider text-primary hover:opacity-85 transition-opacity block mx-auto cursor-pointer focus:outline-none select-all"
            title="Click to copy code"
            aria-label="Copy Invite Code"
          >
            {inviteCode}
          </button>
          {copiedCode && <span className="text-3xs font-bold text-green-500 block animate-pulse">Code copied!</span>}
        </div>
      </div>
    </div>
  );
}

export default InviteModal;
