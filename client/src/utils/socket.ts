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
  // Deliberately does NOT fall back to VITE_API_URL: that's an axios baseURL
  // and is commonly a relative path like "/api" (fine for HTTP requests).
  // socket.io-client treats any pathname in the connection URL as a
  // *namespace* to join, not a path prefix — "/api" becomes a request to
  // join the "/api" namespace, which the server never registers, producing
  // "Invalid namespace" and an endless reconnect loop. window.location.origin
  // has no pathname, so it's always a safe same-origin fallback.
  const socketUrl =
    import.meta.env.VITE_SOCKET_URL ||
    window.location.origin;

  return normalizeSocketUrl(socketUrl);
}
