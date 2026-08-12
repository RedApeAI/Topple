import { create } from "zustand";
import {
  connectMessagingAccount,
  disconnectMessagingAccount,
  fetchMessagingAccounts,
  reconnectMessagingAccount,
  shareMessagingAccount,
  syncMessagingAccount,
  type MessagingAccount,
} from "@/features/inbox/services/messaging.service";
import type {
  ChannelStatus,
  ConnectableChannel,
} from "@/features/channels/types/messaging.types";

interface ChannelStore {
  status?: ChannelStatus;
  loading: boolean;
  connecting?: ConnectableChannel;
  disconnecting?: string;
  error?: unknown;
  load: (force?: boolean) => Promise<void>;
  connect: (channel: ConnectableChannel) => Promise<void>;
  reconnect: (account: MessagingAccount) => Promise<void>;
  share: (accountId: string, shared: boolean) => Promise<void>;
  disconnect: (accountId: string) => Promise<void>;
  sync: (accountId: string) => Promise<void>;
  accountFor: (channel: ConnectableChannel) => MessagingAccount | undefined;
}

let statusRequest: Promise<void> | undefined;

function statusFrom(accounts: MessagingAccount[]): ChannelStatus {
  return { accounts };
}

export const useChannelStore = create<ChannelStore>((set, get) => ({
  loading: false,

  load: async (force = false) => {
    if (!force && get().status) return;
    if (statusRequest) return statusRequest;

    statusRequest = (async () => {
      set({ loading: true, error: undefined });
      try {
        set({ status: statusFrom(await fetchMessagingAccounts()) });
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

  connect: async (channel) => {
    set({ connecting: channel, error: undefined });
    try {
      const url = await connectMessagingAccount(channel, "/dashboard/inbox");
      // The API completes the hosted-auth callback and redirects back to the
      // dashboard. There is no legacy provider popup/callback handshake here.
      window.location.assign(url);
    } catch (error) {
      set({ error, connecting: undefined });
      throw error;
    }
  },

  reconnect: async (account) => {
    set({
      connecting: account.provider as ConnectableChannel,
      error: undefined,
    });
    try {
      const result = await reconnectMessagingAccount(account.id);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      await get().load(true);
    } catch (error) {
      set({ error });
      throw error;
    } finally {
      set({ connecting: undefined });
    }
  },

  share: async (accountId, shared) => {
    set({ error: undefined });
    try {
      const updated = await shareMessagingAccount(accountId, shared);
      set((state) => ({
        status: state.status
          ? {
              ...state.status,
              accounts: state.status.accounts.map((account) =>
                account.id === updated.id ? updated : account,
              ),
            }
          : state.status,
      }));
    } catch (error) {
      set({ error });
      throw error;
    }
  },

  disconnect: async (accountId) => {
    set({ disconnecting: accountId, error: undefined });
    try {
      await disconnectMessagingAccount(accountId);
      await get().load(true);
    } catch (error) {
      set({ error });
      throw error;
    } finally {
      set({ disconnecting: undefined });
    }
  },

  sync: async (accountId) => {
    set({ error: undefined });
    try {
      await syncMessagingAccount(accountId);
      await get().load(true);
    } catch (error) {
      set({ error });
      throw error;
    }
  },

  accountFor: (channel) => {
    const accounts = get().status?.accounts ?? [];
    return accounts.find((account) => {
      if (!account.enabled) return false;
      if (channel.startsWith("linkedin"))
        return account.provider === "linkedin";
      return account.provider === channel;
    });
  },
}));
