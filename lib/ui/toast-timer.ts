// Countdown includes the exit transition. Holding pauses both phases.
export function createToastTimer(onClosing: (value: boolean) => void, onClose: () => void, duration = 3500) {
  let remaining = duration;
  let started = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let exit: ReturnType<typeof setTimeout> | undefined;
  let paused = true;
  let disposed = false;
  const beginExit = () => {
    remaining = 0;
    onClosing(true);
    exit = setTimeout(() => { if (!disposed && !paused) onClose(); }, 250);
  };
  return {
    resume() {
      if (disposed || !paused) return;
      paused = false;
      started = Date.now();
      if (remaining <= 0) beginExit();
      else timer = setTimeout(beginExit, remaining);
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      remaining = Math.max(0, remaining - (Date.now() - started));
      clearTimeout(timer);
      clearTimeout(exit);
      onClosing(false);
    },
    dismiss() { this.dispose(); onClosing(true); exit = setTimeout(onClose, 250); },
    dispose() { disposed = true; clearTimeout(timer); clearTimeout(exit); },
  };
}
