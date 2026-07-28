import { create } from "zustand";

export type OperatorMode = "copilot" | "autopilot";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  operatorOpen: boolean;
  openOperator: () => void;
  closeOperator: () => void;
  toggleOperator: () => void;

  /** Co-pilot drafts replies for approval; autopilot acts on its own. */
  operatorMode: OperatorMode;
  setOperatorMode: (mode: OperatorMode) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  operatorOpen: false,
  openOperator: () => set({ operatorOpen: true }),
  closeOperator: () => set({ operatorOpen: false }),
  toggleOperator: () => set((state) => ({ operatorOpen: !state.operatorOpen })),

  operatorMode: "copilot",
  setOperatorMode: (mode) => set({ operatorMode: mode }),
}));
