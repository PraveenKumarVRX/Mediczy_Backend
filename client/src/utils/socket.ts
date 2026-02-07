/**
 * Normalize a URL for Socket.io connection
 * Ensures proper protocol (wss for https, ws for http) and removes trailing slashes
 */
export function normalizeSocketUrl(url: string): string {
  if (!url) {
    return window.location.origin;
  }

  try {
    // Parse the URL
    const urlObj = new URL(url, window.location.origin);
    
    // Determine the protocol
    let protocol = urlObj.protocol;
    if (protocol === 'https:') {
      protocol = 'wss:';
    } else if (protocol === 'http:') {
      protocol = 'ws:';
    }

    // Build the normalized URL without trailing slash
    let normalizedUrl = `${protocol}//${urlObj.host}`;
    if (urlObj.pathname && urlObj.pathname !== '/') {
      normalizedUrl += urlObj.pathname.replace(/\/$/, ''); // Remove trailing slash if any
    }

    return normalizedUrl;
  } catch {
    // If URL parsing fails, return the origin
    return window.location.origin;
  }
}

/**
 * Get the socket URL for the current environment
 */
export function getSocketUrl(): string {
  const socketUrl =
    import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_URL ||
    window.location.origin;

  return normalizeSocketUrl(socketUrl);
}
