import { Module } from "@nestjs/common";

import { ProgressModule } from "../server/progress/progress.module";
import { ProgressService } from "../server/progress/progress.service";
import { BotService, TELEGRAM_BOT_CLIENT } from "./bot.service";
import { CommandsService, PROGRESS_READER, TELEGRAM_COMMAND_OPTIONS } from "./commands.service";
import {
  NotifierService,
  TELEGRAM_NOTIFIER_OPTIONS,
  TELEGRAM_SENDER,
} from "./notifier.service";
import { TelegramClient } from "./telegram-client";

import type { DynamicModule } from "@nestjs/common";
import type { TelegramFetch } from "./telegram-client";

export interface TelegramModuleOptions {
  readonly token: string;
  readonly allowedUserIds: readonly number[];
  readonly defaultChatId: number;
  readonly longPollSeconds: number;
  readonly claimLeaseSeconds: number;
  readonly notifierScanMilliseconds: number;
  readonly fetch: TelegramFetch;
  readonly now: () => string;
}

@Module({})
export class TelegramModule {
  static register(options: TelegramModuleOptions): DynamicModule {
    return {
      module: TelegramModule,
      imports: [ProgressModule],
      providers: [
        { provide: PROGRESS_READER, useExisting: ProgressService },
        { provide: TELEGRAM_COMMAND_OPTIONS, useValue: { allowedUserIds: options.allowedUserIds } },
        {
          provide: TELEGRAM_BOT_CLIENT,
          useFactory: (): TelegramClient => new TelegramClient({
            token: options.token,
            longPollSeconds: options.longPollSeconds,
            fetch: options.fetch,
          }),
        },
        { provide: TELEGRAM_SENDER, useExisting: TELEGRAM_BOT_CLIENT },
        {
          provide: TELEGRAM_NOTIFIER_OPTIONS,
          useValue: {
            defaultChatId: options.defaultChatId,
            claimLeaseSeconds: options.claimLeaseSeconds,
            scanMilliseconds: options.notifierScanMilliseconds,
            now: options.now,
          },
        },
        CommandsService,
        BotService,
        NotifierService,
      ],
      exports: [CommandsService, NotifierService],
    };
  }
}
