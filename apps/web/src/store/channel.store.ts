import { create } from "zustand";
import {
  connectWhatsAppCredentials,
  disconnectChannel,
  fetchChannelStatus,
  fetchConnectUrl,
  type WhatsAppCredentialsInput,
} from "@/features/channels/services/zernio.service";
import {
  isZernioOAuthResult,
  ZERNIO_OAUTH_CHANNEL,
  ZERNIO_OAUTH_POPUP,
  type ZernioOAuthResult,
} from "@/features/channels/lib/oauth-popup";
import type {
  ChannelStatus,
  ConnectablePlatform,
  ConnectedChannelAccount,
} from "@/features/channels/types/zernio.types";

interface ChannelStore {
  status?: ChannelStatus;
  loading: boolean;
  connecting?: ConnectablePlatform;
  disconnecting?: ConnectablePlatform;
  error?: unknown;
  load: (force?: boolean) => Promise<void>;
  connect: (platform: "linkedin") => Promise<void>;
  connectWhatsAppWithCredentials: (
    input: WhatsAppCredentialsInput,
  ) => Promise<void>;
  disconnect: (
    platform: ConnectablePlatform,
    accountId: string,
  ) => Promise<void>;
  accountFor: (
    platform: ConnectablePlatform,
  ) => ConnectedChannelAccount | undefined;
}

let statusRequest: Promise<void> | undefined;

function openConnectionPopup(): Window {
  const width = 560;
  const height = Math.min(780, window.screen.availHeight - 40);
  const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
  const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);
  const popup = window.open(
    "about:blank",
    ZERNIO_OAUTH_POPUP,
    `popup=yes,width=${width},height=${height},left=${Math.round(left)},top=${Math.round(top)}`,
  );
  if (!popup) {
    throw new Error("Allow popups for Plucia to connect this account");
  }

  popup.document.title = "Connecting account — Plucia";
  popup.document.body.style.cssText =
    "margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f0ee;color:#292929;font:14px system-ui,sans-serif";
  popup.document.body.textContent = "Opening secure account connection…";
  return popup;
}

function waitForOAuthResult(
  popup: Window,
  platform: ConnectablePlatform,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const channel =
      "BroadcastChannel" in window
        ? new BroadcastChannel(ZERNIO_OAUTH_CHANNEL)
        : undefined;

    const cleanup = () => {
      window.removeEventListener("message", onWindowMessage);
      channel?.close();
      window.clearInterval(closedTimer);
      window.clearTimeout(timeoutTimer);
    };
    const settle = (result: ZernioOAuthResult) => {
      if (settled || result.platform !== platform) return;
      settled = true;
      cleanup();
      if (result.success) {
        popup.close();
        window.focus();
        resolve();
      } else {
        reject(
          new Error(result.message || "Account connection was not completed"),
        );
      }
    };
    const onWindowMessage = (event: MessageEvent<unknown>) => {
      if (
        event.origin === window.location.origin &&
        isZernioOAuthResult(event.data)
      ) {
        settle(event.data);
      }
    };

    window.addEventListener("message", onWindowMessage);
    if (channel) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (isZernioOAuthResult(event.data)) settle(event.data);
      };
    }

    const closedTimer = window.setInterval(() => {
      if (!settled && popup.closed) {
        settled = true;
        cleanup();
        reject(
          new Error("The connection window was closed before setup finished"),
        );
      }
    }, 500);
    const timeoutTimer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      popup.close();
      reject(new Error("The account connection timed out. Please try again"));
    }, 10 * 60_000);
  });
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
  loading: false,

  load: async (force = false) => {
    if (!force && get().status) return;
    if (statusRequest) return statusRequest;

    statusRequest = (async () => {
      set({ loading: true, error: undefined });
      try {
        set({ status: await fetchChannelStatus() });
      } catch (error) {
        set({ error });
        throw error;
      } finally {
        set({ loading: false });
        statusRequest = undefined;
      }
    })();
    return statusRequest;
  },

  connect: async (platform) => {
    set({ connecting: platform, error: undefined });
    let popup: Window | undefined;
    try {
      // This must happen synchronously during the click so popup blockers
      // permit it while the API retrieves the provider authorization URL.
      popup = openConnectionPopup();
      popup.location.assign(await fetchConnectUrl(platform));
      await waitForOAuthResult(popup, platform);
      await get().load(true);
      set({ connecting: undefined });
    } catch (error) {
      popup?.close();
      set({ error, connecting: undefined });
      throw error;
    }
  },

  connectWhatsAppWithCredentials: async (input) => {
    set({ connecting: "whatsapp", error: undefined });
    try {
      await connectWhatsAppCredentials(input);
      await get().load(true);
      set({ connecting: undefined });
    } catch (error) {
      set({ error, connecting: undefined });
      throw error;
    }
  },

  disconnect: async (platform, accountId) => {
    set({ disconnecting: platform, error: undefined });
    try {
      await disconnectChannel(platform, accountId);
      await get().load(true);
      set({ disconnecting: undefined });
    } catch (error) {
      set({ error, disconnecting: undefined });
      throw error;
    }
  },

  accountFor: (platform) =>
    get().status?.accounts.find(
      (account) => account.platform === platform && account.status === "active",
    ),
}));
