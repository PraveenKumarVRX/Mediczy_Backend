export type CommunicationPortal = 'admin' | 'team' | 'crm';

/** Portal authority is explicit: a missing token must never fall back to another login. */
export function communicationSession(portal: CommunicationPortal, storage: Pick<Storage, 'getItem'>) {
  return { portal, token: storage.getItem(`${portal}Token`) };
}

export function communicationRequestOptions(token: string | null, options: any = {}, portal?: CommunicationPortal) {
  return {
    ...options,
    ...(portal ? { communicationPortal: portal } : {}),
    // Explicit empty authority also prevents the global API interceptor selecting another login.
    headers: { ...options.headers, Authorization: token ? `Bearer ${token}` : 'Bearer unavailable' },
  };
}
