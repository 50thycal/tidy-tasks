'use client';

import { useEffect, useState } from 'react';

export default function SwListener() {
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready.then(r => {
      setReg(r);
      r.addEventListener('updatefound', () => {
        const sw = r.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            setShow(true);
          }
        });
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // page will be controlled by new SW; optional auto-reload
      // window.location.reload();
    });
  }, []);

  if (!show || !reg) return null;

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-white/15 bg-white/10 backdrop-blur px-4 py-2 text-sm flex gap-3 items-center">
      <span>Tidy updated. Reload to get the latest.</span>
      <button
        className="btn btn-primary"
        style={{ padding: "0.5rem 1rem" }}
        onClick={() => {
          reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        }}
      >
        Reload
      </button>
      <button
        className="btn btn-muted"
        style={{ padding: "0.5rem 1rem" }}
        onClick={() => setShow(false)}
      >
        Dismiss
      </button>
    </div>
  );
}
