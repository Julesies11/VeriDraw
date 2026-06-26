import { useState, forwardRef, useImperativeHandle } from 'react';

export interface ReactionsOverlayRef {
  triggerReaction: (type: string) => void;
}

export const ReactionsOverlay = forwardRef<ReactionsOverlayRef>((_, ref) => {
  const [reactions, setReactions] = useState<Array<{ id: number; type: string; x: number }>>([]);

  useImperativeHandle(ref, () => ({
    triggerReaction: (type: string) => {
      const id = Date.now() + Math.random();
      const x = 15 + Math.random() * 70; // random offset between 15% and 85% width
      setReactions(prev => [...prev, { id, type, x }]);
      
      // Auto-remove reaction after 2s
      setTimeout(() => {
        setReactions(prev => prev.filter(r => r.id !== id));
      }, 2000);
    }
  }));

  const emojiMap: Record<string, string> = { fair: '👍', exciting: '🎉', verify: '🔍' };

  return (
    <div className="absolute inset-x-0 bottom-0 top-20 pointer-events-none z-40 overflow-hidden">
      {reactions.map(r => (
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
      ))}
    </div>
  );
});

ReactionsOverlay.displayName = 'ReactionsOverlay';
