import { sendInboundMessage } from "@/lib/mock/orchestrator";
import type { ApiTurnResult } from "@/lib/mock/orchestrator.types";
import type { LeadChannel } from "../types/lead.types";

/**
 * Start (or continue) a conversation with a lead on one of their channels.
 * There's no outbound-first endpoint on the orchestrator — the only way to
 * create a turn is to feed in a message as if the contact sent it, same
 * mechanic the inbox composer uses. This is the CRM's entry point into that
 * same flow, for a contact who may not have an existing conversation yet.
 */
export function contactLead(
  leadChannel: LeadChannel,
  text: string,
): Promise<ApiTurnResult> {
  return sendInboundMessage({
    channel: leadChannel.channel,
    externalContactId: leadChannel.externalId,
    text,
  });
}
