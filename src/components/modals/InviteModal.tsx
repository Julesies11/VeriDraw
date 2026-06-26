import { useState } from 'react';
import { Users, CheckCircle, Copy } from 'lucide-react';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  inviteCode: string;
}

export function InviteModal({ isOpen, onClose, inviteCode }: InviteModalProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in animate-duration-200">
      <div className="bg-background border border-border/80 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-6 relative animate-scale-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer font-bold"
          aria-label="Close invite modal"
        >
          ✕
        </button>

        <div className="text-center space-y-1.5">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black font-heading tracking-tight">Invite Participants</h3>
          <p className="text-2xs text-muted-foreground">
            Share this draw event with others so they can join and watch live!
          </p>
        </div>

        {/* Invite Code Section */}
        <div className="p-4 bg-secondary/50 border border-border/20 rounded-2xl space-y-2.5 text-center">
          <span className="text-3xs font-extrabold uppercase text-muted-foreground tracking-wider block">Invite Code</span>
          <div className="flex items-center justify-center gap-3">
            <span className="text-3xl font-black font-mono tracking-wider text-foreground select-all">
              {inviteCode}
            </span>
            <button
              onClick={handleCopyCode}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                copiedCode
                  ? 'bg-green-500 text-white border-green-500'
                  : 'bg-background hover:bg-border/20 border border-border text-muted-foreground hover:text-foreground'
              }`}
              title="Copy Invite Code"
              aria-label="Copy Invite Code"
            >
              {copiedCode ? <CheckCircle className="w-4.5 h-4.5" /> : <Copy className="w-4.5 h-4.5" />}
            </button>
          </div>
          {copiedCode && <span className="text-3xs font-bold text-green-500 animate-pulse">Code copied!</span>}
        </div>

        {/* Public Link Section */}
        <div className="space-y-2">
          <span className="text-3xs font-extrabold uppercase text-muted-foreground tracking-wider block">Direct Invite Link</span>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/draw/${inviteCode.toLowerCase()}`}
              className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-input text-foreground text-2xs font-mono focus:outline-none"
            />
            <button
              onClick={handleCopyLink}
              className={`px-4 rounded-xl font-semibold text-2xs transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                copiedLink
                  ? 'bg-green-500 text-white'
                  : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm shadow-primary/10'
              }`}
              aria-label="Copy Direct Invite Link"
            >
              {copiedLink ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* How to Join Steps */}
        <div className="pt-2 border-t border-border/10 space-y-2.5">
          <span className="text-3xs font-extrabold uppercase text-muted-foreground tracking-wider block">How to join:</span>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-secondary/25 border border-border/15 rounded-xl space-y-1">
              <span className="text-3xs font-bold text-primary block">Step 1</span>
              <span className="text-4xs text-muted-foreground block leading-tight">Go to VeriDraw dashboard</span>
            </div>
            <div className="p-2.5 bg-secondary/25 border border-border/15 rounded-xl space-y-1">
              <span className="text-3xs font-bold text-primary block">Step 2</span>
              <span className="text-4xs text-muted-foreground block leading-tight">Enter code <strong className="font-semibold">{inviteCode}</strong></span>
            </div>
            <div className="p-2.5 bg-secondary/25 border border-border/15 rounded-xl space-y-1">
              <span className="text-3xs font-bold text-primary block">Step 3</span>
              <span className="text-4xs text-muted-foreground block leading-tight">Watch the spins live!</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
