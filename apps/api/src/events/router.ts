import type { ZernioWebhookPayload } from "../services/zernio.service.js";
import type { Tenant } from "../services/zernio.service.js";

export interface ProcessedEvent {
  id: string;
  type: string;
  tenant: Tenant;
  payload: ZernioWebhookPayload;
  timestamp: string;
}

export type EventHandler<T extends ProcessedEvent = ProcessedEvent> = (
  event: T,
) => Promise<void> | void;

export interface EventRouter {
  route(event: ProcessedEvent): Promise<void>;
  register(type: string, handler: EventHandler): void;
}

export class ZernioEventRouter implements EventRouter {
  private handlers: Map<string, Set<EventHandler>> = new Map();

  register(type: string, handler: EventHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  async route(event: ProcessedEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (!handlers || handlers.size === 0) {
      console.debug(`No handlers registered for event type: ${event.type}`);
      return;
    }

    const errors: Error[] = [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    if (errors.length > 0) {
      console.error(
        `Handler errors for event ${event.id}:`,
        errors.map((e) => e.message),
      );
    }
  }
}

export const eventRouter = new ZernioEventRouter();
