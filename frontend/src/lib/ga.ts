declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: [string, ...unknown[]]) => void;
  }
}

export function trackEvent(action: string, params?: Record<string, string | number>) {
  if (typeof window === 'undefined') return;

  if (typeof window.gtag === 'function') {
    window.gtag('event', action, params);
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(['event', action, params]);
}
