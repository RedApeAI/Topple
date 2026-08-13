import { create } from "zustand";
import {
  fetchChannelNav,
  fetchConversations,
} from "@/features/inbox/services/conversation.service";
import {
  fetchChatDetail,
  sendContactMessage,
} from "@/features/inbox/services/chat.service";
import { approveDraft, discardDraft } from "@/lib/mock/orchestrator";
import type {
  ChatDetail,
  ChatMessage,
} from "@/features/inbox/types/chat.types";
import type {
  Conversation,
  InboxScope,
} from "@/features/inbox/types/conversation.types";
import type { ChannelNavItem } from "@/types/channel.types";
import {
  formatMessageTime,
  formatRelativeTime,
} from "@/lib/format-relative-time";

/** Pull the normalized message id out of a send endpoint response. */
function extractSentMessageId(response: unknown): string | undefined {
  const responseData = response as {
    data?: {
      data?: { messageId?: unknown; id?: unknown };
      message?: { id?: unknown };
    };
  };
  const data = responseData?.data?.data;
  if (typeof data?.messageId === "string" && data.messageId)
    return data.messageId;
  if (typeof data?.id === "string" && data.id) return data.id;
  const messageId = responseData?.data?.message?.id;
  return typeof messageId === "string" && messageId ? messageId : undefined;
}

type ScopeMap<T> = Partial<Record<InboxScope, T>>;

interface InboxStore {
  conversations: ScopeMap<Conversation[]>;
  conversationLoading: ScopeMap<boolean>;
  conversationErrors: ScopeMap<unknown>;
  channelNav?: ChannelNavItem[];
  channelNavLoading: boolean;
  chats: Record<string, ChatDetail | undefined>;
  chatLoading: Record<string, boolean>;
  chatErrors: Record<string, unknown>;
  sendPending: boolean;
  sendError?: unknown;
  draftPending: boolean;
  loadConversations: (scope: InboxScope, force?: boolean) => Promise<void>;
  loadChannelNav: (force?: boolean) => Promise<void>;
  loadChat: (
    conversation: Conversation | string,
    force?: boolean,
  ) => Promise<void>;
  mergeChat: (conversation: Conversation) => Promise<void>;
  sendMessage: (
    chat: ChatDetail,
    text: string,
    attachmentIds?: string[],
  ) => Promise<void>;
  appendMessageToChat: (conversationId: string, message: ChatMessage) => void;
  updateMessageStatus: (
    conversationId: string,
    messageId: string,
    status: ChatMessage["status"],
  ) => void;
  bumpConversation: (
    conversationId: string,
    preview: string,
    unread: boolean,
  ) => void;
  approveDraft: (conversationId: string, messageId: string) => Promise<void>;
  discardDraft: (conversationId: string, messageId: string) => Promise<void>;
  refreshInbox: () => Promise<void>;
}

const conversationRequests = new Map<InboxScope, Promise<void>>();
const chatRequests = new Map<string, Promise<void>>();
let navRequest: Promise<void> | undefined;

export const useInboxStore = create<InboxStore>((set, get) => ({
  conversations: {},
  conversationLoading: {},
  conversationErrors: {},
  channelNavLoading: false,
  chats: {},
  chatLoading: {},
  chatErrors: {},
  sendPending: false,
  draftPending: false,

  loadConversations: async (scope, force = false) => {
    if (!force && get().conversations[scope]) return;
    const existing = conversationRequests.get(scope);
    if (existing) return existing;

    const request = (async () => {
      const hasCachedConversations = get().conversations[scope] !== undefined;
      set((state) => ({
        // Keep the current list visible while a forced refresh is in flight.
        // Realtime updates should never replace a usable inbox with skeletons.
        conversationLoading: {
          ...state.conversationLoading,
          [scope]: !hasCachedConversations,
        },
        conversationErrors: { ...state.conversationErrors, [scope]: undefined },
      }));
      try {
        const conversations = await fetchConversations(scope);
        set((state) => ({
          conversations: { ...state.conversations, [scope]: conversations },
        }));
      } catch (error) {
        set((state) => ({
          conversationErrors: { ...state.conversationErrors, [scope]: error },
        }));
      } finally {
        set((state) => ({
          conversationLoading: { ...state.conversationLoading, [scope]: false },
        }));
        conversationRequests.delete(scope);
      }
    })();
    conversationRequests.set(scope, request);
    return request;
  },

  loadChannelNav: async (force = false) => {
    if (!force && get().channelNav) return;
    if (navRequest) return navRequest;
    navRequest = (async () => {
      set({ channelNavLoading: true });
      try {
        set({ channelNav: await fetchChannelNav() });
      } finally {
        set({ channelNavLoading: false });
        navRequest = undefined;
      }
    })();
    return navRequest;
  },

  loadChat: async (conversation, force = false) => {
    const conversationId =
      typeof conversation === "string" ? conversation : conversation.id;
    if (!force && get().chats[conversationId]) return;
    const existing = chatRequests.get(conversationId);
    if (existing) return existing;
    const request = (async () => {
      set((state) => ({
        chatLoading: { ...state.chatLoading, [conversationId]: true },
        chatErrors: { ...state.chatErrors, [conversationId]: undefined },
      }));
      try {
        const chat = await fetchChatDetail(conversation);
        set((state) => ({
          chats: { ...state.chats, [conversationId]: chat },
          // A provider send can finish after the browser's former 30-second
          // timeout. Once the authoritative thread reload succeeds, discard
          // that stale transport banner; message-level failures remain on the
          // individual bubble with their Retry action.
          sendError: undefined,
        }));
      } catch (error) {
        set((state) => ({
          chatErrors: { ...state.chatErrors, [conversationId]: error },
        }));
      } finally {
        set((state) => ({
          chatLoading: { ...state.chatLoading, [conversationId]: false },
        }));
        chatRequests.delete(conversationId);
      }
    })();
    chatRequests.set(conversationId, request);
    return request;
  },

  refreshInbox: async () => {
    const scopes = Object.keys(get().conversations) as InboxScope[];
    await Promise.all([
      ...scopes.map((scope) => get().loadConversations(scope, true)),
      get().loadChannelNav(true),
    ]);
  },

  sendMessage: async (chat, text, attachmentIds) => {
    const clientMessageId = crypto.randomUUID();
    const optimisticId = `local-${clientMessageId}`;
    set({ sendPending: true, sendError: undefined });
    set((state) => {
      const existing = state.chats[chat.id];
      const nextConversations = { ...state.conversations };
      for (const scope of Object.keys(nextConversations) as InboxScope[]) {
        const list = nextConversations[scope];
        if (!list) continue;
        nextConversations[scope] = list.map((c) =>
          c.id === chat.id
            ? {
                ...c,
                preview: text,
                unread: false,
                timestamp: formatRelativeTime(new Date().toISOString()),
              }
            : c,
        );
      }
      return {
        conversations: nextConversations,
        chats: existing
          ? {
              ...state.chats,
              [chat.id]: {
                ...existing,
                messages: [
                  ...existing.messages,
                  {
                    id: optimisticId,
                    direction: "outbound",
                    text,
                    status: "sent",
                    time: formatMessageTime(new Date().toISOString()),
                  },
                ],
              },
            }
          : state.chats,
      };
    });
    try {
      const response = await sendContactMessage(
        chat,
        text,
        clientMessageId,
        attachmentIds,
      );
      // Realtime delivery events carry the provider message id, so replace the optimistic
      // `local-` id with it once the server confirms the send. Otherwise the
      // status updates can never match the optimistic bubble.
      const realMessageId = extractSentMessageId(response);
      if (realMessageId) {
        set((state) => {
          const existing = state.chats[chat.id];
          if (!existing) return {};
          return {
            chats: {
              ...state.chats,
              [chat.id]: {
                ...existing,
                messages: existing.messages.map((m) =>
                  m.id === optimisticId ? { ...m, id: realMessageId } : m,
                ),
              },
            },
          };
        });
      }
    } catch (error) {
      set((state) => {
        const existing = state.chats[chat.id];
        if (!existing) return {};
        return {
          chats: {
            ...state.chats,
            [chat.id]: {
              ...existing,
              messages: existing.messages.map((m) =>
                m.id === optimisticId ? { ...m, status: "failed" } : m,
              ),
            },
          },
        };
      });
      set({ sendError: error });
      throw error;
    } finally {
      set({ sendPending: false });
    }
  },

  appendMessageToChat: (conversationId, message) => {
    set((state) => {
      const existing = state.chats[conversationId];
      if (!existing) return {};
      const ids = new Set(existing.messages.map((m) => m.id));
      if (ids.has(message.id)) return {};
      const nextConversations = { ...state.conversations };
      for (const scope of Object.keys(nextConversations) as InboxScope[]) {
        const list = nextConversations[scope];
        if (!list) continue;
        nextConversations[scope] = list.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                preview: message.text,
                timestamp: formatRelativeTime(new Date().toISOString()),
              }
            : c,
        );
      }
      return {
        conversations: nextConversations,
        chats: {
          ...state.chats,
          [conversationId]: {
            ...existing,
            messages: [...existing.messages, message],
          },
        },
      };
    });
  },

  updateMessageStatus: (conversationId, messageId, status) => {
    set((state) => {
      const existing = state.chats[conversationId];
      if (!existing) return {};
      const updatedMessages = existing.messages.map((msg) =>
        msg.id === messageId ? { ...msg, status } : msg,
      );
      return {
        chats: {
          ...state.chats,
          [conversationId]: {
            ...existing,
            messages: updatedMessages,
          },
        },
      };
    });
  },

  // Surgical list update for a realtime event: refresh only this row's preview
  // and unread state and move it to the top, without refetching every
  // conversation (which would re-render the whole inbox).
  bumpConversation: (conversationId, preview, unread) => {
    set((state) => {
      let changed = false;
      const nextConversations: ScopeMap<Conversation[]> = {};
      for (const scope of Object.keys(state.conversations) as InboxScope[]) {
        const list = state.conversations[scope];
        if (!list) continue;
        let updated = false;
        const nextList = list.map((c) => {
          if (c.id !== conversationId) return c;
          updated = true;
          return {
            ...c,
            preview,
            timestamp: formatRelativeTime(new Date().toISOString()),
            unread,
          };
        });
        if (!updated) continue;
        changed = true;
        // A new message makes this the most recent conversation.
        nextConversations[scope] = [
          nextList.find((c) => c.id === conversationId)!,
          ...nextList.filter((c) => c.id !== conversationId),
        ];
      }
      return changed ? { conversations: nextConversations } : {};
    });
  },

  mergeChat: async (conversation: Conversation) => {
    if (conversation.source !== "messaging") return;
    try {
      const fresh = await fetchChatDetail(conversation);
      set((state) => {
        const existing = state.chats[conversation.id];
        if (!existing) {
          return { chats: { ...state.chats, [conversation.id]: fresh } };
        }
        const existingIds = new Set(existing.messages.map((m) => m.id));
        const incoming = fresh.messages.filter((m) => !existingIds.has(m.id));
        const staleLocalIds = new Set(
          existing.messages
            .filter((m) => m.id.startsWith("local-"))
            .filter((m) =>
              fresh.messages.some(
                (f) => f.direction === "outbound" && f.text === m.text,
              ),
            )
            .map((m) => m.id),
        );
        if (incoming.length === 0 && staleLocalIds.size === 0) return {};
        return {
          chats: {
            ...state.chats,
            [conversation.id]: {
              ...existing,
              messages: [
                ...existing.messages.filter((m) => !staleLocalIds.has(m.id)),
                ...incoming,
              ],
            },
          },
        };
      });
    } catch {
      /* Realtime poll retries on its own tick. */
    }
  },

  approveDraft: async (conversationId, messageId) => {
    set({ draftPending: true });
    try {
      await approveDraft(messageId);
      await Promise.all([
        get().loadChat(conversationId, true),
        get().refreshInbox(),
      ]);
    } finally {
      set({ draftPending: false });
    }
  },

  discardDraft: async (conversationId, messageId) => {
    set({ draftPending: true });
    try {
      await discardDraft(messageId);
      await Promise.all([
        get().loadChat(conversationId, true),
        get().refreshInbox(),
      ]);
    } finally {
      set({ draftPending: false });
    }
  },
}));
