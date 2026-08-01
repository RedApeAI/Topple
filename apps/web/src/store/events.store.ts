import { create } from "zustand";

interface EventsState {
  /** True while the SSE stream to the orchestrator's event bus is live.
   * Polling hooks use this to switch off their fallback intervals. */
  eventsConnected: boolean;
  setEventsConnected: (connected: boolean) => void;
}

export const useEventsStore = create<EventsState>((set) => ({
  eventsConnected: false,
  setEventsConnected: (connected) => set({ eventsConnected: connected }),
}));
