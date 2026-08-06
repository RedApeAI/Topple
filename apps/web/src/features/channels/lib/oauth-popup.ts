import type { ConnectablePlatform } from "../types/zernio.types";

/**
 * Handshake between the OAuth popup and the dashboard that opened it.
 *
 * The provider redirects the popup to `/dashboard/zernio/callback`, which has
 * no reference to the opener's React state — it reports the outcome back over
 * two channels and lets the opener decide what to do. Both are used because
 * neither is sufficient alone: `postMessage` needs a live `window.opener`
 * (lost if the provider redirect chain replaced it), and `BroadcastChannel`
 * isn't available in every browser we support.
 */

/** `window.open` target name — also how the callback knows it's in a popup. */
export const ZERNIO_OAUTH_POPUP = "plucia-zernio-oauth";

export const ZERNIO_OAUTH_CHANNEL = "plucia:zernio-oauth";

const RESULT_TYPE = "plucia:zernio-oauth";

export interface ZernioOAuthResult {
  type: typeof RESULT_TYPE;
  /** Guards against a stale result from an earlier attempt settling this one. */
  timestamp: number;
  platform: ConnectablePlatform;
  success: boolean;
  message?: string;
}

/** Narrow an untrusted `MessageEvent.data` to our own result payload. */
export function isZernioOAuthResult(
  value: unknown,
): value is ZernioOAuthResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ZernioOAuthResult>;
  return (
    candidate.type === RESULT_TYPE &&
    typeof candidate.success === "boolean" &&
    (candidate.platform === "whatsapp" || candidate.platform === "linkedin")
  );
}

/** True when this document is the connection popup rather than the dashboard. */
export function isOAuthPopup(): boolean {
  try {
    return window.name === ZERNIO_OAUTH_POPUP && Boolean(window.opener);
  } catch {
    // Cross-origin opener access can throw; treat it as "not our popup".
    return false;
  }
}

/** Announce the outcome to whoever is waiting. Never throws. */
export function publishOAuthResult(result: ZernioOAuthResult): void {
  try {
    window.opener?.postMessage(result, window.location.origin);
  } catch {
    // Opener gone or cross-origin — the BroadcastChannel below still covers it.
  }

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(ZERNIO_OAUTH_CHANNEL);
      channel.postMessage(result);
      channel.close();
    }
  } catch {
    // Nothing left to try; the opener's popup-closed watchdog takes over.
  }
}
