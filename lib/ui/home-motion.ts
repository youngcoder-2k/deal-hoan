/** Match explicit scroll actions to the same accessibility preference as reveals. */
export function homeScrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** Progressive enhancement: markup is never hidden while waiting for JavaScript. */
export function setupHomeMotion(root: HTMLElement | null): () => void {
  if (!root || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return () => {};

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobile = window.matchMedia("(max-width: 767px)");
  const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-motion]"));
  const entered = new Set<HTMLElement>();
  const animations = new Map<HTMLElement, Animation>();
  let observer: IntersectionObserver | undefined;

  const settle = (element: HTMLElement) => {
    entered.add(element);
    element.dataset.motionState = "entered";
    observer?.unobserve(element);
    animations.get(element)?.cancel();
    animations.delete(element);
  };

  const reveal = (element: HTMLElement) => {
    if (entered.has(element)) return;
    settle(element);
    // Keyboard users never wait for a reveal or stagger to finish.
    if (element.contains(document.activeElement) || typeof element.animate !== "function") return;
    const distance = mobile.matches ? 16 : 28;
    const direction = mobile.matches ? "rise" : element.dataset.motion;
    const transform = direction === "left" ? `translate3d(-${distance}px, 0, 0)`
      : direction === "right" ? `translate3d(${distance}px, 0, 0)`
      : direction === "zoom" ? "translate3d(0, 16px, 0) scale(.96)"
      : `translate3d(0, ${distance}px, 0)`;
    const animation = element.animate([
      { opacity: 0, transform },
      { opacity: 1, transform: "none" },
    ], {
      duration: mobile.matches ? 520 : 740,
      delay: Math.min(Number(element.dataset.motionDelay) || 0, mobile.matches ? 120 : 240),
      easing: "cubic-bezier(.2, .75, .25, 1)",
      fill: "backwards",
    });
    animations.set(element, animation);
    void animation.finished.then(() => {
      // Release the animation effect so existing hover transforms keep working.
      if (animations.get(element) === animation) {
        animation.cancel();
        animations.delete(element);
      }
    }).catch(() => {}); // Cancellation is expected on focus, preference change or unmount.
  };

  const stop = () => {
    observer?.disconnect();
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    root.dataset.homeMotion = "off";
  };

  const start = () => {
    stop();
    if (reducedMotion.matches) return;
    root.dataset.homeMotion = "on";
    observer = new IntersectionObserver(entries => {
      if (reducedMotion.matches) return;
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(entry.target as HTMLElement);
      }
    }, { threshold: 0, rootMargin: "0px 0px -36px 0px" });

    for (const element of targets) {
      const rect = element.getBoundingClientRect();
      // Don't replay above-the-fold, restored-scroll or already-viewed content.
      if (entered.has(element) || (rect.top < window.innerHeight && rect.bottom > 0) || rect.bottom <= 0) {
        settle(element);
      } else {
        element.dataset.motionState = "waiting";
        observer.observe(element);
      }
    }
  };

  const onFocus = (event: FocusEvent) => {
    for (const element of targets) {
      if (element.contains(event.target as Node)) settle(element);
    }
  };
  root.addEventListener("focusin", onFocus);
  reducedMotion.addEventListener("change", start);
  start();

  return () => {
    stop();
    root.removeEventListener("focusin", onFocus);
    reducedMotion.removeEventListener("change", start);
    delete root.dataset.homeMotion;
    for (const element of targets) delete element.dataset.motionState;
  };
}
