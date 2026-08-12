import { sendInboundMessage } from "@/lib/mock/orchestrator";
import type { ApiTurnResult } from "@/lib/mock/orchestrator.types";
import type { LeadChannel } from "../types/lead.types";
import {
  fetchMessagingAccounts,
  startMessagingConversation,
} from "@/features/inbox/services/messaging.service";

export type ContactLeadResult =
  | { kind: "agent"; result: ApiTurnResult }
  | { kind: "messaging"; conversationId?: string };

function providerForChannel(
  channel: LeadChannel["channel"],
): "linkedin" | "whatsapp" | "instagram" | "telegram" | undefined {
  if (
    channel === "linkedin" ||
    channel === "whatsapp" ||
    channel === "instagram" ||
    channel === "telegram"
  )
    return channel;
  return undefined;
}

/** Start a real provider conversation when the lead's channel is connected.
 * Email/voice continue through the orchestrator because those are separate
 * backend planes in the current API. */
export async function contactLead(
  leadChannel: LeadChannel,
  text: string,
): Promise<ContactLeadResult> {
  const provider = providerForChannel(leadChannel.channel);
  if (!provider) {
    return {
      kind: "agent",
      result: await sendInboundMessage({
        channel: leadChannel.channel,
        externalContactId: leadChannel.externalId,
        text,
      }),
    };
  }

  const accounts = await fetchMessagingAccounts();
  const account = accounts.find(
    (candidate) =>
      candidate.provider === provider &&
      candidate.enabled &&
      candidate.status === "connected",
  );
  if (!account) {
    throw new Error(`Connect ${provider} before contacting this lead.`);
  }

  const accountType = account.providerAccountType?.toLowerCase() ?? "";
  const linkedinProduct = accountType.includes("recruiter")
    ? "recruiter"
    : accountType.includes("sales")
      ? "sales_navigator"
      : "classic";
  const response = await startMessagingConversation({
    accountId: account.id,
    participantIds: [leadChannel.externalId],
    text,
    ...(provider === "linkedin"
      ? {
          linkedinProduct,
          ...(linkedinProduct !== "classic"
            ? {
                inmailSubject: "Following up",
                ...(linkedinProduct === "recruiter"
                  ? { inmailSignature: account.displayName ?? "Plucia" }
                  : {}),
              }
            : {}),
        }
      : {}),
  });
  const data = (
    response as {
      data?: {
        id?: string;
        conversationId?: string;
        threadId?: string;
      };
    }
  ).data;
  return {
    kind: "messaging",
    conversationId: data?.threadId ?? data?.id ?? data?.conversationId,
  };
}
