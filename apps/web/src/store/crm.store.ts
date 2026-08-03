import { create } from "zustand";
import { importLeads } from "@/lib/mock/orchestrator";
import type {
  ApiLeadImportResponse,
  ApiLeadImportRow,
  ApiTurnResult,
} from "@/lib/mock/orchestrator.types";
import { contactLead } from "@/features/crm/services/contact-lead.service";
import { fetchLeads } from "@/features/crm/services/lead.service";
import type { Lead, LeadChannel } from "@/features/crm/types/lead.types";
import { useInboxStore } from "./inbox.store";

interface CrmStore {
  leads?: Lead[];
  leadsLoading: boolean;
  leadsError?: unknown;
  importPending: boolean;
  importError?: unknown;
  contactPending: boolean;
  contactError?: unknown;
  contactResult?: ApiTurnResult;
  resetImport: () => void;
  resetContact: () => void;
  loadLeads: (force?: boolean) => Promise<void>;
  importRows: (rows: ApiLeadImportRow[]) => Promise<ApiLeadImportResponse>;
  contact: (leadChannel: LeadChannel, text: string) => Promise<ApiTurnResult>;
}

let leadsRequest: Promise<void> | undefined;

export const useCrmStore = create<CrmStore>((set, get) => ({
  leadsLoading: false,
  importPending: false,
  contactPending: false,
  resetImport: () => set({ importPending: false, importError: undefined }),
  resetContact: () =>
    set({
      contactPending: false,
      contactError: undefined,
      contactResult: undefined,
    }),

  loadLeads: async (force = false) => {
    if (!force && get().leads) return;
    if (leadsRequest) return leadsRequest;
    leadsRequest = (async () => {
      set({ leadsLoading: true, leadsError: undefined });
      try {
        set({ leads: await fetchLeads() });
      } catch (error) {
        set({ leadsError: error });
      } finally {
        set({ leadsLoading: false });
        leadsRequest = undefined;
      }
    })();
    return leadsRequest;
  },

  importRows: async (rows) => {
    set({ importPending: true, importError: undefined });
    try {
      const result = await importLeads(rows);
      await Promise.all([
        get().loadLeads(true),
        useInboxStore.getState().loadChannelNav(true),
      ]);
      return result;
    } catch (error) {
      set({ importError: error });
      throw error;
    } finally {
      set({ importPending: false });
    }
  },

  contact: async (leadChannel, text) => {
    set({
      contactPending: true,
      contactError: undefined,
      contactResult: undefined,
    });
    try {
      const result = await contactLead(leadChannel, text);
      set({ contactResult: result });
      await useInboxStore.getState().refreshInbox();
      return result;
    } catch (error) {
      set({ contactError: error });
      throw error;
    } finally {
      set({ contactPending: false });
    }
  },
}));
