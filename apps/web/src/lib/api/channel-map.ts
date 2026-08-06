import type { ChannelKey } from "@/types/channel.types";
import type { OrchestratorChannel } from "@/lib/mock/orchestrator.types";

/**
 * The UI and the orchestrator name two channels differently: the sidebar says
 * "mail" and "call" where the pipeline says "email" and "voice". Every crossing
 * of that boundary goes through this module so the mapping lives in one place.
 */

const UI_TO_API: Record<ChannelKey, OrchestratorChannel | null> = {
  whatsapp: "whatsapp",
  mail: "email",
  call: "voice",
  instagram: "instagram",
  // Stored on contacts as an identity, but `schemas.envelope.Channel` doesn't
  // accept it — there is no LinkedIn turn pipeline yet.
  linkedin: null,
};

const API_TO_UI: Record<OrchestratorChannel, ChannelKey> = {
  whatsapp: "whatsapp",
  email: "mail",
  voice: "call",
  instagram: "instagram",
};

/** UI channel → turn channel, or `null` when the orchestrator can't run it. */
export function toApiChannel(channel: ChannelKey): OrchestratorChannel | null {
  return UI_TO_API[channel] ?? null;
}

/** Turn channel → UI channel. Unknown values pass through as "whatsapp". */
export function toUiChannel(channel: OrchestratorChannel | string): ChannelKey {
  return API_TO_UI[channel as OrchestratorChannel] ?? "whatsapp";
}

/**
 * Identity channel → UI channel. Contact identities carry one channel the turn
 * pipeline doesn't serve ("linkedin"), so this accepts a wider set than
 * `toUiChannel` and returns `null` for anything unrecognized — a lead imported
 * with a field we've since dropped shouldn't render as a bogus badge.
 */
export function identityChannelToUi(channel: string): ChannelKey | null {
  if (channel === "linkedin") return "linkedin";
  return API_TO_UI[channel as OrchestratorChannel] ?? null;
}
