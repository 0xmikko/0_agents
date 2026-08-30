import { Inject, Injectable } from "@nestjs/common";

import { CommandsService } from "./commands.service";

import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type { TelegramSender, TelegramUpdate } from "./telegram-client";

export const TELEGRAM_BOT_CLIENT = Symbol("TELEGRAM_BOT_CLIENT");

export interface TelegramBotClient extends TelegramSender {
  getUpdates(offset: number, signal: AbortSignal): Promise<readonly TelegramUpdate[]>;
}

function retryDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1_000);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  readonly #abort = new AbortController();
  #loop: Promise<void> | null = null;
  #offset = 0;

  constructor(
    @Inject(TELEGRAM_BOT_CLIENT) private readonly client: TelegramBotClient,
    private readonly commands: CommandsService,
  ) {}

  onModuleInit(): void {
    this.#loop = this.#poll();
  }

  async onModuleDestroy(): Promise<void> {
    this.#abort.abort();
    await this.#loop;
    this.#loop = null;
  }

  async #poll(): Promise<void> {
    while (!this.#abort.signal.aborted) {
      try {
        const updates = await this.client.getUpdates(this.#offset, this.#abort.signal);
        for (const update of updates) {
          const reply = this.commands.handle(update);
          if (reply !== null) await this.client.sendMessage(update.chatId, reply);
          this.#offset = Math.max(this.#offset, update.updateId + 1);
        }
      } catch {
        if (!this.#abort.signal.aborted) await retryDelay(this.#abort.signal);
      }
    }
  }
}
