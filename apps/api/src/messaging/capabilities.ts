import type {
  MessagingCapability,
  MessagingConnectChannel,
  MessagingProvider,
} from "./contracts.js";

export type ChannelCapabilities = Readonly<
  Record<MessagingCapability, boolean>
>;

const disabled = {
  reactions: false,
  typingIndicators: false,
  editMessages: false,
  deleteMessages: false,
  scheduling: false,
  messageSearch: false,
} as const;

const chatDefaults = {
  reply: true,
  startConversation: true,
  attachments: true,
  htmlEmail: false,
  readReceipts: false,
  archive: true,
  labels: false,
  ...disabled,
} as const;

const channelCapabilities: Record<MessagingProvider, ChannelCapabilities> = {
  linkedin: {
    ...chatDefaults,
    // LinkedIn attachments and new-chat behavior vary by account product. The
    // adapter still checks the account metadata before attempting the call.
    attachments: true,
  },
  whatsapp: {
    ...chatDefaults,
    readReceipts: true,
    archive: false,
  },
  instagram: {
    ...chatDefaults,
    attachments: false,
    archive: false,
  },
  telegram: {
    ...chatDefaults,
    readReceipts: true,
  },
  // Plucia already owns the Gmail/Outlook/IMAP mail path. These entries are
  // intentionally descriptive so a future Unipile mail adapter cannot make
  // chat routes silently send email through the wrong integration.
  google: {
    ...chatDefaults,
    htmlEmail: true,
    labels: true,
  },
  outlook: {
    ...chatDefaults,
    htmlEmail: true,
    labels: true,
  },
  imap: {
    ...chatDefaults,
    htmlEmail: true,
    labels: false,
  },
};

export function getChannelCapabilities(
  provider: MessagingProvider,
  channel?: MessagingConnectChannel | null,
): ChannelCapabilities {
  const base = channelCapabilities[provider];
  if (provider !== "linkedin" || !channel) return base;

  // The three LinkedIn products share the normalized provider but are kept in
  // metadata so the UI can display the exact account product. Recruiter and
  // Sales Navigator are not treated as interchangeable provider threads.
  return base;
}

export function supportsCapability(
  provider: MessagingProvider,
  capability: MessagingCapability,
  channel?: MessagingConnectChannel | null,
): boolean {
  return getChannelCapabilities(provider, channel)[capability];
}

export function capabilityErrorMessage(
  capability: MessagingCapability,
): string {
  switch (capability) {
    case "startConversation":
      return "This channel does not support starting a new conversation";
    case "reply":
      return "This connected account cannot send messages";
    case "htmlEmail":
      return "HTML email is not supported by this channel";
    case "attachments":
      return "Attachments are not supported by this channel";
    case "archive":
      return "Archiving is not supported by this channel";
    default:
      return `The ${capability} capability is not supported by this channel`;
  }
}
