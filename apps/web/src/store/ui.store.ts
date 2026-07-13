import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  operatorOpen: boolean;
  openOperator: () => void;
  closeOperator: () => void;
  toggleOperator: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  operatorOpen: false,
  openOperator: () => set({ operatorOpen: true }),
  closeOperator: () => set({ operatorOpen: false }),
  toggleOperator: () => set((state) => ({ operatorOpen: !state.operatorOpen })),
}));
