// Cache busting script to force browser refresh
(function() {
    // Force reload if this is a cached version
    const currentTimestamp = Date.now();
    const lastKnownTimestamp = localStorage.getItem('mediczy_last_update');
    
    // If this is a new deployment or cache is old, force refresh
    if (!lastKnownTimestamp || (currentTimestamp - parseInt(lastKnownTimestamp)) > 300000) {
        localStorage.setItem('mediczy_last_update', currentTimestamp.toString());
        
        // Unregister service worker to clear cache
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        }
        
        // Clear browser cache
        if ('caches' in window) {
            caches.keys().then(function(names) {
                names.forEach(function(name) {
                    caches.delete(name);
                });
            });
        }
        
        console.log('🔄 Mediczy cache cleared for fresh update');
    }
})();