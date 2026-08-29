export type TelegramFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface TelegramUpdate {
  readonly updateId: number;
  readonly userId: number;
  readonly chatId: number;
  readonly text: string;
}

export interface TelegramSender {
  sendMessage(chatId: number, text: string): Promise<void>;
}

export interface TelegramClientOptions {
  readonly token: string;
  readonly longPollSeconds: number;
  readonly fetch: TelegramFetch;
}

function record(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Readonly<Record<string, unknown>>;
}

function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function decodeUpdates(input: unknown): readonly TelegramUpdate[] {
  const envelope = record(input, "Telegram response");
  if (envelope.ok !== true || !Array.isArray(envelope.result)) throw new Error("Telegram getUpdates response is invalid");
  return envelope.result.flatMap((entry): readonly TelegramUpdate[] => {
    const update = record(entry, "Telegram update");
    const rawMessage = update.message;
    if (typeof rawMessage !== "object" || rawMessage === null || Array.isArray(rawMessage)) return [];
    const message = rawMessage as Readonly<Record<string, unknown>>;
    const rawFrom = message.from;
    const rawChat = message.chat;
    if (typeof rawFrom !== "object" || rawFrom === null || Array.isArray(rawFrom)
      || typeof rawChat !== "object" || rawChat === null || Array.isArray(rawChat)
      || typeof message.text !== "string") return [];
    const from = rawFrom as Readonly<Record<string, unknown>>;
    const chat = rawChat as Readonly<Record<string, unknown>>;
    return [{
      updateId: integer(update.update_id, "Telegram update_id"),
      userId: integer(from.id, "Telegram user id"),
      chatId: integer(chat.id, "Telegram chat id"),
      text: message.text,
    }];
  });
}

export class TelegramClient implements TelegramSender {
  readonly #baseUrl: string;

  constructor(private readonly options: TelegramClientOptions) {
    if (!Number.isSafeInteger(options.longPollSeconds) || options.longPollSeconds <= 0) {
      throw new Error("Telegram longPollSeconds must be a positive integer");
    }
    if (options.token.trim() === "" || /\s/.test(options.token)) throw new Error("Telegram token is invalid");
    this.#baseUrl = `https://api.telegram.org/bot${options.token}`;
  }

  /** @tested-by: tst_svc_planctl_telegram_001 */
  async getUpdates(offset: number, signal: AbortSignal): Promise<readonly TelegramUpdate[]> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Telegram update offset is invalid");
    const response = await this.options.fetch(`${this.#baseUrl}/getUpdates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offset, timeout: this.options.longPollSeconds, allowed_updates: ["message"] }),
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout((this.options.longPollSeconds + 5) * 1_000),
      ]),
    });
    if (!response.ok) throw new Error(`Telegram getUpdates failed with HTTP ${response.status}`);
    const body: unknown = await response.json();
    return decodeUpdates(body);
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    if (!Number.isSafeInteger(chatId)) throw new Error("Telegram chatId must be an integer");
    if (text === "" || text.length > 4_096) throw new Error("Telegram message length is invalid");
    const response = await this.options.fetch(`${this.#baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
    const body: unknown = await response.json();
    const envelope = record(body, "Telegram response");
    if (envelope.ok !== true) throw new Error("Telegram sendMessage response is invalid");
  }
}
