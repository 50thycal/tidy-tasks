/**
 * Invalidate all service worker caches and reload the app
 */
export async function invalidateAndReload(): Promise<void> {
  if (typeof window === 'undefined') return;

  // If no service worker support, just reload
  if (!('serviceWorker' in navigator)) {
    location.reload();
    return;
  }

  try {
    // Get the service worker registration
    const reg = await navigator.serviceWorker.getRegistration();

    // Delete all caches
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map(key => caches.delete(key)));

    // If there's a waiting worker, tell it to skip waiting and activate immediately
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // Give it a moment to process, then reload
    setTimeout(() => {
      location.reload();
    }, 150);
  } catch (error) {
    console.error('Error invalidating cache:', error);
    // Even if there's an error, try to reload
    location.reload();
  }
}
