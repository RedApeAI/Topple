import type { MessagingProvider, NormalizedParticipant } from "./contracts.js";

export type ContactIdentifier = {
  provider: MessagingProvider;
  identifierType:
    | "email"
    | "phone"
    | "linkedin"
    | "instagram"
    | "telegram"
    | "whatsapp"
    | "provider_participant";
  normalizedValue: string;
};

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

export function normalizePhone(value: string): string | null {
  const normalized = value.trim().replace(/[()\s.-]/g, "");
  if (!/^\+?[0-9]{7,20}$/.test(normalized)) return null;
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export function normalizeProviderIdentifier(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 512 ? normalized : null;
}

export function participantIdentifiers(
  provider: MessagingProvider,
  participant: NormalizedParticipant,
): ContactIdentifier[] {
  const identifiers: ContactIdentifier[] = [];
  const add = (
    identifierType: ContactIdentifier["identifierType"],
    value: string | null,
    lower = false,
  ) => {
    const normalizedValue = value
      ? lower
        ? normalizeProviderIdentifier(value)
        : value
      : null;
    if (normalizedValue)
      identifiers.push({ provider, identifierType, normalizedValue });
  };
  const email = participant.emailAddress
    ? normalizeEmail(participant.emailAddress)
    : null;
  const phone = participant.phoneNumber
    ? normalizePhone(participant.phoneNumber)
    : null;
  add("email", email);
  add("phone", phone);
  add("linkedin", participant.linkedinPublicIdentifier, true);
  add("instagram", participant.instagramIdentifier, true);
  add("telegram", participant.telegramIdentifier, true);
  add("whatsapp", phone, false);
  add("provider_participant", participant.providerParticipantId, true);
  return identifiers;
}
