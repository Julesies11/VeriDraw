import React, { useState } from 'react';
import { Info } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

interface GoLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onConfirm: (
    eventName: string,
    requireViewerLogin: boolean,
    scheduledStartTime: string,
    status: 'active' | 'scheduled'
  ) => void;
  loading: boolean;
}

export function GoLiveModal({ isOpen, onClose, user, onConfirm, loading }: GoLiveModalProps) {
  const [eventName, setEventName] = useState(() => {
    const today = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return `Quick Draw Live - ${today}`;
  });
  const [requireViewerLogin, setRequireViewerLogin] = useState(false);
  const [isScheduled, setIsScheduled] = useState(true);
  const [scheduledTime, setScheduledTime] = useState(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + 10);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim()) return;

    const startTime = isScheduled ? new Date(scheduledTime).toISOString() : new Date().toISOString();
    const status = isScheduled ? 'scheduled' : 'active';
    onConfirm(eventName.trim(), requireViewerLogin, startTime, status);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 animate-fade-in">
      <div className="bg-background border-t border-x border-border/80 sm:border rounded-t-3xl rounded-b-none sm:rounded-3xl p-6 sm:p-5 max-w-md sm:max-w-sm w-full max-h-[92vh] overflow-y-auto shadow-2xl space-y-4 relative animate-slide-up sm:animate-scale-in">
        {/* Drag Handle Indicator for Mobile Bottom Sheet */}
        <div className="w-12 h-1.5 bg-muted-foreground/20 rounded-full mx-auto mb-1 sm:hidden shrink-0" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer font-bold text-xs sm:top-3.5 sm:right-3.5"
          aria-label="Close modal"
          disabled={loading}
        >
          ✕
        </button>

        {/* Header */}
        <div className="space-y-0.5 pr-6">
          <h3 className="text-lg font-black font-heading tracking-tight text-foreground">Create Live Event</h3>
          <p className="text-2xs text-muted-foreground leading-normal">
            Schedule a live draw and invite spectators to watch in real time.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Event Name */}
          <div className="space-y-1">
            <label htmlFor="modalEventName" className="text-2sm font-bold text-foreground">
              Event Name
            </label>
            <input
              id="modalEventName"
              type="text"
              required
              disabled={loading}
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. Club Volunteer Draw"
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          {/* Privacy Visibility Toggles (Horizontal Card Style) */}
          <div className="space-y-1">
            <span className="text-2sm font-bold text-foreground block">
              Event Privacy
            </span>
            <div className="grid grid-cols-2 gap-2">
              {/* Option 1: Public Draw */}
              <label className={`flex items-start gap-1.5 p-2 rounded-xl border cursor-pointer transition-all select-none ${!requireViewerLogin ? 'bg-primary/5 border-primary/30 text-foreground' : 'bg-secondary/20 border-border/10 text-muted-foreground'}`}>
                <input
                  type="radio"
                  name="visibility"
                  disabled={loading}
                  checked={!requireViewerLogin}
                  onChange={() => setRequireViewerLogin(false)}
                  className="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-primary cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="text-2xs font-extrabold block leading-none">Public</span>
                  <span className="text-[10px] opacity-80 block leading-tight font-normal">Anyone with the link can watch</span>
                </div>
              </label>

              {/* Option 2: Private Draw */}
              <label className={`flex items-start gap-1.5 p-2 rounded-xl border cursor-pointer transition-all select-none ${requireViewerLogin ? 'bg-primary/5 border-primary/30 text-foreground' : 'bg-secondary/20 border-border/10 text-muted-foreground'}`}>
                <input
                  type="radio"
                  name="visibility"
                  disabled={loading}
                  checked={requireViewerLogin}
                  onChange={() => setRequireViewerLogin(true)}
                  className="mt-0.5 h-3.5 w-3.5 border-border text-primary focus:ring-primary cursor-pointer"
                />
                <div className="space-y-0.5">
                  <span className="text-2xs font-extrabold block leading-none">Private</span>
                  <span className="text-[10px] opacity-80 block leading-tight font-normal">Requires users to register and login (free)</span>
                </div>
              </label>
            </div>
          </div>

          {/* Optional Schedule Toggle */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="modalIsScheduled" className="text-2sm font-bold text-foreground cursor-pointer select-none">
                Schedule for later
              </label>
              <input
                id="modalIsScheduled"
                type="checkbox"
                disabled={loading}
                checked={isScheduled}
                onChange={(e) => setIsScheduled(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-input text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            {isScheduled && (
              <div className="p-3 bg-secondary/35 border border-border/20 rounded-2xl space-y-2.5 animate-fade-in">
                <input
                  type="datetime-local"
                  required={isScheduled}
                  disabled={loading}
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3.5 py-1.5 rounded-xl border border-border bg-input text-foreground text-2sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
                <p className="text-[10px] text-muted-foreground leading-normal flex items-start gap-1.5 font-medium">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                  <span>Even though scheduled, you can commence the draw manually at any time.</span>
                </p>
              </div>
            )}
          </div>

          {/* Host Line (Condensed Row) */}
          <div className="flex items-center justify-between py-2 border-t border-b border-border/10 text-2sm">
            <span className="font-bold text-foreground">Host</span>
            {user ? (
              <span className="font-semibold text-muted-foreground truncate max-w-[200px]" title={user.email}>
                {user.email}
              </span>
            ) : (
              <span className="font-semibold text-amber-500 flex items-center gap-1.5 text-2xs">
                <Info className="w-3.5 h-3.5 shrink-0" /> Guest (Sign in required)
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-1 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2 rounded-xl border border-border bg-transparent text-foreground hover:bg-secondary text-2sm font-bold transition-all cursor-pointer text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !eventName.trim()}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-primary text-primary-foreground font-bold shadow-md shadow-primary/10 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer select-none"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/20 border-t-primary-foreground animate-spin" />
                  Processing...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default GoLiveModal;
