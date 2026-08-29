import { Module } from "@nestjs/common";

import { IngestModule } from "./ingest/ingest.module";
import { ServerPersistenceModule } from "./persistence/server-store";
import { ProgressModule } from "./progress/progress.module";
import { TelegramModule } from "../telegram/telegram.module";

import type { DynamicModule } from "@nestjs/common";
import type { ServerStoreOptions } from "./persistence/server-store";
import type { TelegramModuleOptions } from "../telegram/telegram.module";

@Module({})
export class ServerAppModule {
  static register(options: ServerStoreOptions): DynamicModule {
    return this.compose(options, []);
  }

  static registerWithTelegram(options: ServerStoreOptions, telegram: TelegramModuleOptions): DynamicModule {
    return this.compose(options, [TelegramModule.register(telegram)]);
  }

  static compose(options: ServerStoreOptions, telegramImports: readonly DynamicModule[]): DynamicModule {
    return {
      module: ServerAppModule,
      imports: [ServerPersistenceModule.register(options), IngestModule, ProgressModule, ...telegramImports],
    };
  }
}
