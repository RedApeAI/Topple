import { identityChannelToUi } from "@/lib/api/channel-map";
import { listContacts } from "@/lib/api/orchestrator";
import type { ApiContact } from "@/lib/api/orchestrator.types";
import type { Lead, LeadChannel } from "../types/lead.types";

function toLead(contact: ApiContact): Lead {
  const channels: LeadChannel[] = [];
  for (const identity of contact.identities) {
    const channel = identityChannelToUi(identity.channel);
    if (channel) channels.push({ channel, externalId: identity.external_id });
  }
  return {
    id: contact._id,
    name: contact.profile?.name || channels[0]?.externalId || "Unknown",
    channels,
    qualificationScore: Number(contact.lead?.qualification_score ?? 0),
    createdAt: contact.created_at,
  };
}

/** Every contact for the tenant — the CRM lead list. No fixture fallback:
 * there's no meaningful placeholder for a tenant's actual leads. */
export async function fetchLeads(): Promise<Lead[]> {
  const contacts = await listContacts();
  return contacts.map(toLead);
}
