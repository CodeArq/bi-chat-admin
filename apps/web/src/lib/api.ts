// Bridge fetch is now provided by BridgeContext.
// This file is kept for backwards compatibility during migration.
// Import { useBridge } from '../context/BridgeContext' instead.

export type FetchWithAuth = (url: string, options?: RequestInit) => Promise<Response>
