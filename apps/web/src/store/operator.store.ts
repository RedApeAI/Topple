import { create } from "zustand";
import {
  listOperatorMessages,
  listOperatorThreads,
  postOperatorCommand,
} from "@/lib/mock/operator-agent";
import { approveDraft, discardDraft } from "@/lib/mock/orchestrator";
import type {
  ApiOperatorActionResult,
  ApiOperatorMessage,
} from "@/lib/mock/orchestrator.types";
import {
  fetchOperatorHistory,
  fetchOperatorThreads,
  fetchOperatorTranscript,
} from "@/features/operator/services/operator.service";
import type {
  OperatorMessage,
  OperatorThread,
} from "@/features/operator/types/operator.types";
import type { ApiOperatorThread } from "@/lib/mock/orchestrator.types";
import type { ChannelKey } from "@/types/channel.types";
import { useInboxStore } from "./inbox.store";
import { useUIStore } from "./ui.store";

function toOperatorMessage(message: ApiOperatorMessage): OperatorMessage {
  return {
    id: message._id,
    role: message.role,
    text: message.text,
    status: "done",
    steps: message.steps,
    action: message.action,
  };
}

interface OperatorStore {
  threads?: OperatorThread[];
  threadsLoading: boolean;
  history?: OperatorThread[];
  historyLoading: boolean;
  transcripts: Record<string, OperatorMessage[] | undefined>;
  transcriptLoading: Record<string, boolean>;
  agentMessages: OperatorMessage[];
  agentThreadId?: string;
  agentLoading: boolean;
  /** Past Operator chats for the signed-in user, most recently used first. */
  chats?: ApiOperatorThread[];
  chatsLoading: boolean;
  sendPending: boolean;
  sendError?: unknown;
  draftPending: boolean;
  loadAgentThread: (force?: boolean) => Promise<void>;
  openChat: (threadId: string) => Promise<void>;
  loadChats: (force?: boolean) => Promise<void>;
  startNewChat: () => void;
  loadThreads: (force?: boolean) => Promise<void>;
  loadHistory: (force?: boolean) => Promise<void>;
  loadTranscript: (conversationId: string, force?: boolean) => Promise<void>;
  sendCommand: (text: string, channel: ChannelKey) => Promise<void>;
  patchActionStatus: (
    messageId: string,
    status: ApiOperatorActionResult["status"],
  ) => void;
  approve: (messageId: string) => Promise<void>;
  discard: (messageId: string) => Promise<void>;
}

let threadsRequest: Promise<void> | undefined;
let historyRequest: Promise<void> | undefined;
let agentRequest: Promise<void> | undefined;
let chatsRequest: Promise<void> | undefined;
const transcriptRequests = new Map<string, Promise<void>>();

export const useOperatorStore = create<OperatorStore>((set, get) => ({
  threadsLoading: false,
  historyLoading: false,
  transcripts: {},
  transcriptLoading: {},
  agentMessages: [],
  agentLoading: false,
  chatsLoading: false,
  sendPending: false,
  draftPending: false,

  /**
   * Reopen the salesperson's most recent Operator conversation.
   *
   * The chat is server state — the orchestrator persists every exchange to
   * `operator_messages` — but the store is in-memory, so without this a refresh
   * loses it. Restoring `agentThreadId` matters as much as the transcript: the
   * next command posts that id, so the agent keeps the thread history it
   * reasons over instead of starting cold on a brand-new thread.
   */
  loadAgentThread: async (force = false) => {
    if (!force && (get().agentThreadId || get().agentMessages.length > 0))
      return;
    if (agentRequest) return agentRequest;

    agentRequest = (async () => {
      set({ agentLoading: true });
      try {
        const [latest] = await listOperatorThreads(1);
        if (!latest) return;
        const messages = await listOperatorMessages(latest._id);
        set({
          agentThreadId: latest._id,
          agentMessages: messages.map(toOperatorMessage),
        });
      } catch {
        // The orchestrator may be unreachable. An empty chat is a reasonable
        // resting state — never block opening the panel on this.
      } finally {
        set({ agentLoading: false });
        agentRequest = undefined;
      }
    })();
    return agentRequest;
  },

  /**
   * The list of past chats. Server-scoped to this user, so it is safe to show
   * every thread it returns.
   */
  loadChats: async (force = false) => {
    if (!force && get().chats) return;
    if (chatsRequest) return chatsRequest;

    chatsRequest = (async () => {
      set({ chatsLoading: true });
      try {
        set({ chats: await listOperatorThreads(30) });
      } catch {
        set({ chats: [] });
      } finally {
        set({ chatsLoading: false });
        chatsRequest = undefined;
      }
    })();
    return chatsRequest;
  },

  /** Reopen a specific past chat, replacing whatever is on screen. */
  openChat: async (threadId) => {
    if (get().agentThreadId === threadId && get().agentMessages.length > 0) {
      return;
    }
    set({ agentLoading: true, sendError: undefined });
    try {
      const messages = await listOperatorMessages(threadId);
      set({
        agentThreadId: threadId,
        agentMessages: messages.map(toOperatorMessage),
      });
    } catch (error) {
      set({ sendError: error });
    } finally {
      set({ agentLoading: false });
    }
  },

  /** Drop the restored thread so the next command opens a fresh one. */
  startNewChat: () =>
    set({ agentMessages: [], agentThreadId: undefined, sendError: undefined }),

  loadThreads: async (force = false) => {
    if (!force && get().threads) return;
    if (threadsRequest) return threadsRequest;
    threadsRequest = (async () => {
      set({ threadsLoading: true });
      try {
        set({ threads: await fetchOperatorThreads() });
      } finally {
        set({ threadsLoading: false });
        threadsRequest = undefined;
      }
    })();
    return threadsRequest;
  },

  loadHistory: async (force = false) => {
    if (!force && get().history) return;
    if (historyRequest) return historyRequest;
    historyRequest = (async () => {
      set({ historyLoading: true });
      try {
        set({ history: await fetchOperatorHistory() });
      } finally {
        set({ historyLoading: false });
        historyRequest = undefined;
      }
    })();
    return historyRequest;
  },

  loadTranscript: async (conversationId, force = false) => {
    if (!force && get().transcripts[conversationId]) return;
    const existing = transcriptRequests.get(conversationId);
    if (existing) return existing;
    const request = (async () => {
      set((state) => ({
        transcriptLoading: {
          ...state.transcriptLoading,
          [conversationId]: true,
        },
      }));
      try {
        const messages = await fetchOperatorTranscript(conversationId);
        set((state) => ({
          transcripts: { ...state.transcripts, [conversationId]: messages },
        }));
      } finally {
        set((state) => ({
          transcriptLoading: {
            ...state.transcriptLoading,
            [conversationId]: false,
          },
        }));
        transcriptRequests.delete(conversationId);
      }
    })();
    transcriptRequests.set(conversationId, request);
    return request;
  },

  sendCommand: async (text, channel) => {
    const localMessage: OperatorMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      text,
      status: "done",
    };
    set((state) => ({
      agentMessages: [...state.agentMessages, localMessage],
      sendPending: true,
      sendError: undefined,
    }));
    try {
      const response = await postOperatorCommand({
        text,
        mode: useUIStore.getState().operatorMode,
        threadId: get().agentThreadId,
        preferredChannel: channel,
      });
      set((state) => ({
        agentThreadId: response.thread_id,
        agentMessages: [
          ...state.agentMessages,
          toOperatorMessage(response.message),
        ],
      }));
      await Promise.all([
        get().loadThreads(true),
        get().loadChats(true),
        useInboxStore.getState().refreshInbox(),
      ]);
    } catch (error) {
      set({ sendError: error });
    } finally {
      set({ sendPending: false });
    }
  },

  patchActionStatus: (messageId, status) => {
    set((state) => ({
      agentMessages: state.agentMessages.map((message) =>
        message.id === messageId && message.action
          ? { ...message, action: { ...message.action, status } }
          : message,
      ),
    }));
  },

  approve: async (messageId) => {
    set({ draftPending: true });
    try {
      await approveDraft(messageId);
      await Promise.all([
        get().loadThreads(true),
        useInboxStore.getState().refreshInbox(),
      ]);
    } finally {
      set({ draftPending: false });
    }
  },

  discard: async (messageId) => {
    set({ draftPending: true });
    try {
      await discardDraft(messageId);
      await Promise.all([
        get().loadThreads(true),
        useInboxStore.getState().refreshInbox(),
      ]);
    } finally {
      set({ draftPending: false });
    }
  },
}));
