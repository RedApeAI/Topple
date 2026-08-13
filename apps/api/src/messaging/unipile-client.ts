import type { AppBindings } from "../types.js";
import { env } from "../lib/env.js";
import { AppError } from "../lib/errors.js";
import { getChannelCapabilities } from "./capabilities.js";
import type {
  MessagingConnectChannel,
  MessagingProvider,
} from "./contracts.js";
import { validateUnipilePage } from "./unipile-schemas.js";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 30_000;
const OUTBOUND_TIMEOUT_MS = 90_000;

type UnipileMessageFile = {
  filename: string;
  content_type: string;
  content: string;
};

export type UnipileClientConfig = {
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  hostedAuthDomain?: string;
};

export class UnipileProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly providerCode?: string,
    public readonly retryAfterSeconds?: number,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = "UnipileProviderError";
  }

  get retryable(): boolean {
    return RETRYABLE_STATUSES.has(this.status);
  }
}

function configuredValue(
  bindings: AppBindings | undefined,
  key: keyof UnipileClientConfig,
): string | undefined {
  if (key === "apiKey") return bindings?.UNIPILE_API_KEY ?? env.UNIPILE_API_KEY;
  if (key === "baseUrl")
    return bindings?.UNIPILE_BASE_URL ?? env.UNIPILE_BASE_URL;
  if (key === "apiVersion")
    return bindings?.UNIPILE_API_VERSION ?? env.UNIPILE_API_VERSION;
  return bindings?.UNIPILE_HOSTED_AUTH_DOMAIN ?? env.UNIPILE_HOSTED_AUTH_DOMAIN;
}

export function getUnipileConfig(bindings?: AppBindings): UnipileClientConfig {
  const apiKey = configuredValue(bindings, "apiKey");
  if (!apiKey) {
    throw new AppError(
      503,
      "UNIPILE_NOT_CONFIGURED",
      "Messaging provider is not configured",
    );
  }
  return {
    apiKey,
    baseUrl: configuredValue(bindings, "baseUrl") ?? "https://api.unipile.com",
    apiVersion: configuredValue(bindings, "apiVersion") ?? "v2",
    hostedAuthDomain: configuredValue(bindings, "hostedAuthDomain"),
  };
}

function apiRoot(config: UnipileClientConfig): string {
  const base = config.baseUrl.replace(/\/+$/, "");
  return /\/v[0-9]+$/i.test(base) ? base : `${base}/${config.apiVersion}`;
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

function retryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function responseProviderCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;
  const code =
    record.type ??
    record.code ??
    record.error_code ??
    nested?.type ??
    nested?.code;
  return typeof code === "string" ? code : undefined;
}

function isMessageFile(value: unknown): value is UnipileMessageFile {
  return (
    typeof value === "object" &&
    value !== null &&
    "filename" in value &&
    "content_type" in value &&
    "content" in value
  );
}

function base64Bytes(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return buffer;
}

function appendMultipartField(
  form: FormData,
  key: string,
  value: unknown,
): void {
  if (value === undefined || value === null) return;
  if (isMessageFile(value)) {
    form.append(
      key,
      new Blob([base64Bytes(value.content)], { type: value.content_type }),
      value.filename,
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      appendMultipartField(form, `${key}[${index}]`, item),
    );
    return;
  }
  if (typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    ))
      appendMultipartField(form, `${key}[${nestedKey}]`, nestedValue);
    return;
  }
  form.append(key, String(value));
}

function multipartBody(value: unknown): FormData {
  const form = new FormData();
  for (const [key, item] of Object.entries(value as Record<string, unknown>))
    appendMultipartField(form, key, item);
  return form;
}

async function responseError(
  response: Response,
): Promise<{ message: string; code?: string }> {
  try {
    const value = (await response.json()) as unknown;
    return {
      message:
        responseProviderCode(value) ??
        `Unipile request failed with HTTP ${response.status}`,
      code: responseProviderCode(value),
    };
  } catch {
    return { message: `Unipile request failed with HTTP ${response.status}` };
  }
}

export class UnipileClient {
  private readonly root: string;

  constructor(
    private readonly config: UnipileClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.root = apiRoot(config);
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "DELETE";
      query?: Record<string, string | number | undefined>;
      body?: unknown;
      multipart?: boolean;
      timeoutMs?: number;
      retry?: boolean;
    } = {},
  ): Promise<T> {
    const url = new URL(
      `${this.root}${path.startsWith("/") ? path : `/${path}`}`,
    );
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const correlationId = crypto.randomUUID();
    const attempts =
      options.retry === false ||
      options.method === "POST" ||
      options.method === "PATCH" ||
      options.method === "DELETE"
        ? 1
        : 3;
    let lastError: UnipileProviderError | null = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      try {
        const response = await this.fetchImpl(url, {
          method: options.method ?? "GET",
          headers: {
            Accept: "application/json",
            "X-API-KEY": this.config.apiKey,
            ...(options.multipart
              ? {}
              : { "Content-Type": "application/json" }),
            "X-Request-Id": correlationId,
          },
          ...(options.body === undefined
            ? {}
            : {
                body: options.multipart
                  ? multipartBody(options.body)
                  : JSON.stringify(options.body),
              }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = await responseError(response);
          throw new UnipileProviderError(
            error.message,
            response.status,
            error.code,
            retryAfter(response),
            correlationId,
          );
        }
        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof UnipileProviderError) {
          lastError = error;
          if (!error.retryable || attempt === attempts - 1) throw error;
          const delay = Math.min(
            5_000,
            (error.retryAfterSeconds ?? 2 ** attempt) * 1000,
          );
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          continue;
        }
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Unipile request timed out"
            : "Unipile request failed";
        throw new UnipileProviderError(
          message,
          504,
          "UNIPILE_NETWORK_ERROR",
          undefined,
          correlationId,
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw (
      lastError ??
      new UnipileProviderError(
        "Unipile request failed",
        502,
        undefined,
        undefined,
        correlationId,
      )
    );
  }

  async getAccount(accountId: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/accounts/${encodePath(accountId)}`,
    );
  }

  async listAccounts(): Promise<Record<string, unknown>[]> {
    const page = validateUnipilePage(
      await this.request<unknown>("/accounts", { query: { limit: 250 } }),
    );
    return (page.data.length > 0 ? page.data : (page.items ?? [])).filter(
      (item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
    ) as Record<string, unknown>[];
  }

  async createAuthLink(input: {
    providers: MessagingConnectChannel | MessagingConnectChannel[];
    redirectUri: string;
    expiresOn: string;
    state: string;
    config?: Record<string, unknown>;
  }): Promise<string> {
    const result = await this.request<unknown>("/auth/link", {
      method: "POST",
      retry: false,
      body: {
        providers: input.providers,
        redirect_uri: input.redirectUri,
        expires_on: input.expiresOn,
        state: input.state,
        ...(this.config.hostedAuthDomain
          ? { domain: this.config.hostedAuthDomain }
          : {}),
        ...(input.config ? { config: input.config } : {}),
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    if (!result || typeof result !== "object")
      throw new UnipileProviderError(
        "Malformed hosted authentication response",
        502,
      );
    const link =
      (result as Record<string, unknown>).link ??
      (result as Record<string, unknown>).url;
    if (typeof link !== "string" || !/^https:\/\//i.test(link))
      throw new UnipileProviderError(
        "Malformed hosted authentication response",
        502,
      );
    return link;
  }

  async createReconnectAuthLink(input: {
    accountId: string;
    redirectUri: string;
    expiresOn: string;
    state: string;
  }): Promise<string> {
    const result = await this.request<unknown>("/auth/link", {
      method: "POST",
      retry: false,
      body: {
        account_id: input.accountId,
        redirect_uri: input.redirectUri,
        expires_on: input.expiresOn,
        state: input.state,
        ...(this.config.hostedAuthDomain
          ? { domain: this.config.hostedAuthDomain }
          : {}),
      },
    });
    if (!result || typeof result !== "object")
      throw new UnipileProviderError(
        "Malformed hosted authentication response",
        502,
      );
    const link =
      (result as Record<string, unknown>).link ??
      (result as Record<string, unknown>).url;
    if (typeof link !== "string" || !/^https:\/\//i.test(link))
      throw new UnipileProviderError(
        "Malformed hosted authentication response",
        502,
      );
    return link;
  }

  async disconnectAccount(accountId: string): Promise<void> {
    await this.request<void>(`/accounts/${encodePath(accountId)}`, {
      method: "DELETE",
      retry: false,
    });
  }

  async listChats(input: {
    accountId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
    before?: string;
    after?: string;
  }): Promise<unknown> {
    return this.request<unknown>(`/${encodePath(input.accountId)}/chats`, {
      query: {
        cursor: input.cursor,
        offset: input.offset,
        limit: input.limit ?? 50,
        before: input.before,
        after: input.after,
      },
    });
  }

  async listInboxChats(input: {
    accountId: string;
    inboxId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
    before?: string;
    after?: string;
  }): Promise<unknown> {
    return this.request<unknown>(
      `/${encodePath(input.accountId)}/inboxes/${encodePath(input.inboxId)}/chats`,
      {
        query: {
          cursor: input.cursor,
          offset: input.offset,
          limit: input.limit ?? 25,
          before: input.before,
          after: input.after,
        },
      },
    );
  }

  async getChat(input: {
    accountId: string;
    chatId: string;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/${encodePath(input.accountId)}/chats/${encodePath(input.chatId)}`,
    );
  }

  async listMessages(input: {
    accountId: string;
    chatId: string;
    cursor?: string;
    offset?: number;
    limit?: number;
    before?: string;
    after?: string;
  }): Promise<unknown> {
    return this.request<unknown>(
      `/${encodePath(input.accountId)}/chats/${encodePath(input.chatId)}/messages`,
      {
        query: {
          cursor: input.cursor,
          offset: input.offset,
          limit: input.limit ?? 100,
          before: input.before,
          after: input.after,
        },
      },
    );
  }

  async listInboxes(input: { accountId: string }): Promise<unknown> {
    return this.request<unknown>(`/${encodePath(input.accountId)}/inboxes`, {
      query: { limit: 100 },
    });
  }

  async listParticipants(input: {
    accountId: string;
    chatId: string;
    cursor?: string;
    limit?: number;
  }): Promise<unknown> {
    return this.request<unknown>(
      `/${encodePath(input.accountId)}/chats/${encodePath(input.chatId)}/participants`,
      {
        query: { cursor: input.cursor, limit: input.limit ?? 100 },
      },
    );
  }

  async sendChatMessage(input: {
    accountId: string;
    chatId: string;
    text: string;
    attachments?: Array<Record<string, unknown>>;
  }): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/${encodePath(input.accountId)}/chats/${encodePath(input.chatId)}/messages/send`,
      {
        method: "POST",
        retry: false,
        timeoutMs: OUTBOUND_TIMEOUT_MS,
        body: {
          text: input.text,
          ...(input.attachments?.length
            ? { attachments: input.attachments }
            : {}),
        },
        // Messaging API v2 accepts JSON for this endpoint. The v1 adapter
        // used multipart/form-data, which produces api/not_implemented or
        // invalid-parameter responses against v2 accounts.
        multipart: false,
      },
    );
  }

  async startChat(input: {
    accountId: string;
    participantIds: string[];
    text: string;
    title?: string;
    attachments?: Array<Record<string, unknown>>;
    inboxId?: string;
    specifics?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const path = input.inboxId
      ? `/${encodePath(input.accountId)}/inboxes/${encodePath(input.inboxId)}/chats/send`
      : `/${encodePath(input.accountId)}/chats/send`;
    return this.request<Record<string, unknown>>(path, {
      method: "POST",
      retry: false,
      timeoutMs: OUTBOUND_TIMEOUT_MS,
      body: {
        users_ids: input.participantIds,
        text: input.text,
        ...(input.title ? { name: input.title } : {}),
        ...(input.specifics ? { specifics: input.specifics } : {}),
        ...(input.attachments?.length
          ? { attachments: input.attachments }
          : {}),
      },
      multipart: false,
    });
  }

  async updateChat(input: {
    accountId: string;
    chatId: string;
    archived?: boolean;
    read?: boolean;
  }): Promise<void> {
    await this.request<void>(
      `/${encodePath(input.accountId)}/chats/${encodePath(input.chatId)}`,
      {
        method: "PATCH",
        retry: false,
        body: {
          ...(input.archived === undefined
            ? {}
            : { archive_status: input.archived }),
          ...(input.read === undefined ? {} : { read_status: input.read }),
        },
      },
    );
  }

  async downloadAttachment(input: {
    accountId: string;
    chatId: string;
    messageId: string;
    attachmentId: string;
  }): Promise<Response> {
    const url = `${this.root}/${encodePath(input.accountId)}/chats/${encodePath(input.chatId)}/messages/${encodePath(input.messageId)}/attachments/${encodePath(input.attachmentId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          "X-API-KEY": this.config.apiKey,
          Accept: "*/*",
          "X-Request-Id": crypto.randomUUID(),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new UnipileProviderError(
          `Unipile attachment request failed with HTTP ${response.status}`,
          response.status,
        );
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  capabilities(provider: MessagingProvider) {
    return getChannelCapabilities(provider);
  }
}

export function createUnipileClient(bindings?: AppBindings): UnipileClient {
  return new UnipileClient(getUnipileConfig(bindings));
}
