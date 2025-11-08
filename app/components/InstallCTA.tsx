'use client';

import { useEffect, useState } from 'react';

export default function InstallCTA() {
  const [deferred, setDeferred] = useState<any>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const isStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      // iOS
      ('standalone' in window.navigator && (window.navigator as any).standalone === true);
    if (isStandalone) return; // already installed

    const dismissed = localStorage.getItem('tidy.install.dismissed') === '1';
    if (dismissed) return;

    const handler = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!visible || !deferred) return null;

  return (
    <div className="mx-4 my-3 rounded-xl border border-white/15 bg-white/5 p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
      <span>Install Tidy for quicker access and offline use.</span>
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          style={{ padding: "0.5rem 1rem" }}
          onClick={async () => {
            deferred.prompt();
            const { outcome } = await deferred.userChoice;
            setVisible(false);
            if (outcome !== 'accepted') {
              localStorage.setItem('tidy.install.dismissed', '1');
            }
          }}
        >
          Install
        </button>
        <button
          className="btn btn-muted"
          style={{ padding: "0.5rem 1rem" }}
          onClick={() => {
            localStorage.setItem('tidy.install.dismissed', '1');
            setVisible(false);
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
