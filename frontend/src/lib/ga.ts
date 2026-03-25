declare global {
  interface Window {
    gtag?: (...args: [string, ...unknown[]]) => void;
  }
}

export function trackEvent(action: string, params?: Record<string, string | number>) {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', action, params);
  }
}
