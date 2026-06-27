import { useMemo, useEffect, useRef, useState, useCallback } from 'react';

interface RouletteWheelProps {
  items: Array<{ id: string; item_value: string; is_selected: boolean }>;
  rotationAngle: number;
  isSpinning: boolean;
  spinDurationMs: number;
}

export function RouletteWheel({ items, rotationAngle, isSpinning, spinDurationMs }: RouletteWheelProps) {
  const size = 500;
  const radius = size / 2;
  const center = size / 2;

  const pointerRef = useRef<HTMLDivElement>(null);
  const [renderedAngle, setRenderedAngle] = useState(() => {
    // If we mount in a non-spinning state, initialize directly to the target rotationAngle
    return isSpinning ? 0 : rotationAngle;
  });

  useEffect(() => {
    // After mount, update the rendered angle to match the prop rotationAngle
    const frame = requestAnimationFrame(() => {
      setRenderedAngle(rotationAngle);
    });
    return () => cancelAnimationFrame(frame);
  }, [rotationAngle]);

  const animFrameRef = useRef<number | null>(null);
  const startAngleRef = useRef(0);
  const targetAngleRef = useRef(0);
  const lastTickIndexRef = useRef(0);
  const pointerRotationRef = useRef(0);

  // Web Audio Context synthetic click generator for tactile tick feedback
  const playTickSound = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.04);

      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.04);
    } catch {
      // Browser autoplay policy might block audio before interaction
    }
  }, []);

  // Cubic Bezier solver to match the ease-out transition curve exactly
  const solveCubicBezier = (x1: number, y1: number, x2: number, y2: number, t: number) => {
    const getX = (tVal: number) => 3 * tVal * (1 - tVal) * (1 - tVal) * x1 + 3 * tVal * tVal * (1 - tVal) * x2 + tVal * tVal * tVal;
    const getY = (tVal: number) => 3 * tVal * (1 - tVal) * (1 - tVal) * y1 + 3 * tVal * tVal * (1 - tVal) * y2 + tVal * tVal * tVal;
    let tVal = t;
    for (let i = 0; i < 8; i++) {
      const x = getX(tVal);
      const dx = (getX(tVal + 0.001) - x) / 0.001;
      if (Math.abs(dx) < 1e-6) break;
      tVal -= (x - t) / dx;
    }
    return getY(tVal);
  };

  // Render only unselected items
  const activeItems = useMemo(() => {
    const unselected = items.filter((item) => !item.is_selected);
    if (unselected.length === 0) {
      return items; // Fallback to full list greyed out if all are selected
    }
    return unselected;
  }, [items]);

  const count = activeItems.length;
  const sliceAngle = 360 / (count || 1);

  // Sync tick animations and click sounds to match real-time wheel rotation
  useEffect(() => {
    if (isSpinning && rotationAngle !== startAngleRef.current) {
      targetAngleRef.current = rotationAngle;
      const startTime = performance.now();
      const startAngle = startAngleRef.current;
      const deltaAngle = rotationAngle - startAngle;

      lastTickIndexRef.current = Math.floor(startAngle / sliceAngle);

      const loop = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / spinDurationMs);

        // Find exact rotation progress aligning with cubic-bezier(0.2, 0.8, 0.3, 1)
        const easeProgress = solveCubicBezier(0.2, 0.8, 0.3, 1.0, progress);
        const currentAngle = startAngle + easeProgress * deltaAngle;

        // Keep startAngleRef in sync with real-time progress so subsequent transitions start here
        startAngleRef.current = currentAngle;

        const currentTickIndex = Math.floor(currentAngle / sliceAngle);
        if (currentTickIndex !== lastTickIndexRef.current) {
          playTickSound();
          // Kick the pointer to drag it left and simulate peg deflection
          pointerRotationRef.current = -20;
          lastTickIndexRef.current = currentTickIndex;
        }

        // Apply visual decay to wiggle rotation for springy recoil action
        pointerRotationRef.current *= 0.82;
        if (Math.abs(pointerRotationRef.current) < 0.1) {
          pointerRotationRef.current = 0;
        }
        if (pointerRef.current) {
          pointerRef.current.style.transform = `rotate(${pointerRotationRef.current}deg)`;
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(loop);
        } else {
          startAngleRef.current = rotationAngle;
        }
      };

      animFrameRef.current = requestAnimationFrame(loop);
    } else {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      startAngleRef.current = rotationAngle;
      if (pointerRef.current) {
        pointerRef.current.style.transform = 'rotate(0deg)';
      }
      pointerRotationRef.current = 0;
    }

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isSpinning, rotationAngle, spinDurationMs, sliceAngle, playTickSound]);

  // Generate color palette using clean, premium HSL values
  const getSliceColor = (index: number) => {
    const item = activeItems[index];
    if (item?.is_selected) {
      // Inactive grey for drawn slices
      return '#3f3f46'; // zinc-700
    }
    // Curated high-contrast harmonic HSL colors
    const hue = (index * (360 / count)) % 360;
    return `hsl(${hue}, 70%, 45%)`;
  };

  const getSliceTextColor = (index: number) => {
    const item = activeItems[index];
    if (item?.is_selected) {
      return '#71717a'; // zinc-500
    }
    return '#ffffff';
  };

  // Generate SVG path for a circular pie slice
  const getSlicePath = (index: number) => {
    const startAngle = index * sliceAngle - 90; // offset by -90 to start at top
    const endAngle = (index + 1) * sliceAngle - 90;

    const radStart = (startAngle * Math.PI) / 180;
    const radEnd = (endAngle * Math.PI) / 180;

    const x1 = center + radius * Math.cos(radStart);
    const y1 = center + radius * Math.sin(radStart);
    const x2 = center + radius * Math.cos(radEnd);
    const y2 = center + radius * Math.sin(radEnd);

    // Large arc flag is 0 for slices <= 180 deg, else 1
    const largeArcFlag = sliceAngle > 180 ? 1 : 0;

    return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
  };

  return (
    <div className="relative flex items-center justify-center select-none w-full max-w-[420px] aspect-square mx-auto">
      {/* Outer Glowing Ring */}
      <div className="absolute w-[106%] h-[106%] rounded-full border-4 border-primary/40 bg-background/5 shadow-[0_0_50px_rgba(30,96,145,0.25)] dark:shadow-[0_0_50px_rgba(58,134,200,0.15)] flex items-center justify-center">
        <div className="w-[96%] h-[96%] rounded-full border-2 border-white/10 dark:border-white/5" />
      </div>

      {/* Wheel Core SVG Container */}
      <div
        className="relative z-10 w-full h-full rounded-full shadow-[0_15px_35px_rgba(0,0,0,0.2)] overflow-hidden"
        style={{
          transform: `rotate(${-renderedAngle}deg)`,
          transition: isSpinning
            ? `transform ${spinDurationMs}ms cubic-bezier(0.2, 0.8, 0.3, 1)`
            : 'transform 0.5s ease-out',
          background: items.length === 0 ? 'repeating-conic-gradient(#e0e0e0 0deg 15deg, #ffffff 15deg 30deg)' : undefined,
        }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width="100%"
          height="100%"
          className="overflow-visible"
        >
          {items.length === 0 && (
            <text
              x={center}
              y={center - 90}
              fill="#71717a"
              textAnchor="middle"
              alignmentBaseline="middle"
              className="font-heading font-black text-[24px] tracking-wider uppercase"
            >
              Add entries
            </text>
          )}

          <g>
            {count === 1 ? (
              // Single remaining item fills the entire wheel
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill={getSliceColor(0)}
              />
            ) : (
              // Draw slices
              activeItems.map((item, index) => (
                <path
                  key={item.id}
                  d={getSlicePath(index)}
                  fill={getSliceColor(index)}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="2"
                />
              ))
            )}
          </g>

          {/* Slices Text Labels */}
          <g>
            {activeItems.map((item, index) => {
              const angle = index * sliceAngle + sliceAngle / 2 - 90;
              const rad = (angle * Math.PI) / 180;
              // Position text 65% of the radius away from center
              const textDist = radius * 0.65;
              const tx = center + textDist * Math.cos(rad);
              const ty = center + textDist * Math.sin(rad);

              // Truncate long strings for cleaner UI
              const displayVal =
                item.item_value.length > 18
                  ? `${item.item_value.substring(0, 15)}...`
                  : item.item_value;

              return (
                <text
                  key={`text-${item.id}`}
                  x={tx}
                  y={ty}
                  fill={getSliceTextColor(index)}
                  transform={`rotate(${angle + 180}, ${tx}, ${ty})`}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  className="font-heading font-semibold text-[13px] tracking-wide uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                  style={{
                    textDecoration: item.is_selected ? 'line-through' : 'none',
                    opacity: item.is_selected ? 0.5 : 1,
                  }}
                >
                  {displayVal}
                </text>
              );
            })}
          </g>
        </svg>

        {/* Center Golden Pin Cap */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-gradient-to-tr from-zinc-700 via-zinc-900 to-zinc-700 border-4 border-white/20 shadow-2xl z-20 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Target Arrow Pointer (Points down to 12 o'clock sector) */}
      <div 
        ref={pointerRef}
        className="absolute top-[-10px] z-30 flex flex-col items-center"
        style={{
          transform: 'rotate(0deg)',
          transformOrigin: 'top center',
        }}
      >
        {/* Pointer Arrow SVG */}
        <svg
          width="48"
          height="40"
          viewBox="0 0 48 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)] filter brightness-110"
        >
          <path
            d="M24 38L4 8C2 5 4 1 8 1H40C44 1 46 5 44 8L24 38Z"
            fill="url(#pointer-gradient)"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="pointer-gradient" x1="24" y1="1" x2="24" y2="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f39c12" />
              <stop offset="1" stopColor="#d35400" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
