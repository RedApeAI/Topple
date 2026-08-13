import { AppError } from "../lib/errors.js";

export type MessagingCallbackErrorInput = {
  type?: string;
  title?: string;
  detail?: string;
};

/**
 * Convert Unipile Hosted Auth callback errors into stable API errors.
 *
 * Unipile can redirect an error without a state or account id. These errors
 * therefore need to be handled before the successful callback state checks.
 */
export function mapMessagingCallbackError(
  input: MessagingCallbackErrorInput,
): AppError {
  const type = input.type?.trim().toLowerCase();
  const detail = input.detail?.trim();

  switch (type) {
    case "api/account_restricted":
      return new AppError(
        403,
        "MESSAGING_ACCOUNT_RESTRICTED",
        detail
          ? `Unipile does not allow this account to be linked. ${detail}`
          : "Unipile does not allow this account to be linked. Contact Unipile support if you believe this is a mistake.",
      );
    case "api/already_exists":
      return new AppError(
        409,
        "MESSAGING_ACCOUNT_ALREADY_CONNECTED",
        "This provider account is already connected to the Unipile application.",
      );
    case "api/inactive_subscription":
      return new AppError(
        503,
        "UNIPILE_SUBSCRIPTION_INACTIVE",
        "The Unipile subscription is inactive. Activate the organization subscription before connecting messaging accounts.",
      );
    case "api/expired_link":
      return new AppError(
        400,
        "MESSAGING_CONNECTION_LINK_EXPIRED",
        "This messaging connection link has expired. Start the connection again.",
      );
    case "provider/invalid_credentials":
      return new AppError(
        401,
        "MESSAGING_PROVIDER_AUTH_FAILED",
        "The provider rejected the account credentials. Check the account details and try again.",
      );
    case "provider/unknown_authentication_context":
      return new AppError(
        400,
        "MESSAGING_PROVIDER_AUTH_REQUIRED",
        "The provider requires an additional authentication step. Start the connection again and complete it in the provider window.",
      );
    default: {
      const explanation = detail || input.title?.trim();
      return new AppError(
        400,
        "MESSAGING_CONNECTION_FAILED",
        explanation
          ? `The messaging account could not be connected. ${explanation}`
          : "The messaging account could not be connected. Please try again.",
      );
    }
  }
}
