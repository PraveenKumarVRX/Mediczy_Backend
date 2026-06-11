function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function resolveSibBaseUrl() {
  return trimTrailingSlash(
    process.env.SIB_URL
      || process.env.SIB_API_URL
      || process.env.SIB_FASTAPI_URL
      || 'http://localhost:8001'
  );
}

export function resolveOfflineScribeUrl() {
  return trimTrailingSlash(
    process.env.OFFLINE_SCRIBE_URL
      || process.env.SCRIBE_SERVICE_URL
      || process.env.SCRIBE_URL
      || 'http://localhost:8006'
  );
}

export function resolveLiveKitUrl() {
  return trimTrailingSlash(process.env.LIVEKIT_URL || '');
}

export function isLiveKitCloudUrl(url = resolveLiveKitUrl()) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.hostname.endsWith('.livekit.cloud') || parsed.hostname === 'livekit.cloud';
  } catch {
    return false;
  }
}

export function resolveLiveKitHealthUrl() {
  if (process.env.LIVEKIT_HEALTH_URL) {
    return trimTrailingSlash(process.env.LIVEKIT_HEALTH_URL);
  }

  const liveKitUrl = resolveLiveKitUrl();
  if (!liveKitUrl || isLiveKitCloudUrl(liveKitUrl)) {
    return null;
  }

  try {
    const parsed = new URL(liveKitUrl);
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : parsed.protocol === 'ws:' ? 'http:' : parsed.protocol;
    parsed.pathname = '/';
    parsed.search = '';
    parsed.hash = '';
    return trimTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
}

export function getAIServiceConfig() {
  const liveKitUrl = resolveLiveKitUrl();
  return {
    sibUrl: resolveSibBaseUrl(),
    offlineScribeUrl: resolveOfflineScribeUrl(),
    liveKitUrl,
    liveKitHealthUrl: resolveLiveKitHealthUrl(),
    liveKitUsesCloud: isLiveKitCloudUrl(liveKitUrl),
  };
}

export default getAIServiceConfig;
