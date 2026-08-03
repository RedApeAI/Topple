import { create } from "zustand";
import {
  fetchChannelNav,
  fetchConversations,
} from "@/features/inbox/services/conversation.service";
import {
  approveDraft,
  discardDraft,
  fetchChatDetail,
  sendContactMessage,
} from "@/features/inbox/services/chat.service";
import type { ChatDetail } from "@/features/inbox/types/chat.types";
import type {
  Conversation,
  InboxScope,
} from "@/features/inbox/types/conversation.types";
import type { ChannelNavItem } from "@/types/channel.types";

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
  sendVariables?: string;
  sendError?: unknown;
  draftPending: boolean;
  loadConversations: (scope: InboxScope, force?: boolean) => Promise<void>;
  loadChannelNav: (force?: boolean) => Promise<void>;
  loadChat: (
    conversation: Conversation | string,
    force?: boolean,
  ) => Promise<void>;
  sendMessage: (chat: ChatDetail, text: string) => Promise<void>;
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
      set((state) => ({
        conversationLoading: { ...state.conversationLoading, [scope]: true },
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
        set((state) => ({ chats: { ...state.chats, [conversationId]: chat } }));
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

  sendMessage: async (chat, text) => {
    set({ sendPending: true, sendVariables: text, sendError: undefined });
    try {
      await sendContactMessage(chat, text);
      const conversation: Conversation = {
        id: chat.id,
        name: chat.contactName,
        channel: chat.channel,
        source: chat.source,
        accountId: chat.accountId,
        externalContactId: chat.externalContactId,
        preview: text,
        timestamp: "",
      };
      await Promise.all([
        get().loadChat(conversation, true),
        get().refreshInbox(),
      ]);
    } catch (error) {
      set({ sendError: error });
      throw error;
    } finally {
      set({ sendPending: false, sendVariables: undefined });
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
