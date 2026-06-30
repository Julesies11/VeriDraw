import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  scheduledStartTime: string;
  status: string;
  onCommenced: () => void;
  isActivating: boolean;
}

export function CountdownTimer({ scheduledStartTime, status, onCommenced, isActivating }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timerReady, setTimerReady] = useState(false);

  useEffect(() => {
    if (status !== 'scheduled') {
      const timer = setTimeout(() => {
        setTimeLeft(0);
        setTimerReady(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const calculateTimeLeft = () => {
      const difference = new Date(scheduledStartTime).getTime() - Date.now();
      return Math.max(0, Math.floor(difference / 1000));
    };

    let initTimer: ReturnType<typeof setTimeout> | null = null;
    initTimer = setTimeout(() => {
      setTimeLeft(calculateTimeLeft());
      setTimerReady(true);
    }, 0);

    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      if (initTimer) clearTimeout(initTimer);
    };
  }, [scheduledStartTime, status]);

  // Trigger commencement callback if countdown hits zero
  useEffect(() => {
    if (status === 'scheduled' && timerReady && timeLeft <= 0 && !isActivating) {
      onCommenced();
    }
  }, [timeLeft, timerReady, status, isActivating, onCommenced]);

  const formatCountdown = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0'),
    ].join(':');
  };

  if (!timerReady) {
    return <div className="h-14" />;
  }

  if (timeLeft > 0) {
    return (
      <div className="space-y-2.5">
        <div className="text-5xl font-black font-mono tracking-wider text-primary select-none drop-shadow-[0_0_15px_rgba(30,96,145,0.25)]">
          {formatCountdown(timeLeft)}
        </div>
      </div>
    );
  }

  if (isActivating) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <span className="text-sm font-bold text-primary animate-pulse">Launching draw...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="text-sm font-semibold text-green-600 flex items-center justify-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>Draw is ready to commence!</span>
      </div>
    </div>
  );
}

export default CountdownTimer;
