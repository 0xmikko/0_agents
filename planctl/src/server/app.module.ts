import { Module } from "@nestjs/common";

import { IngestModule } from "./ingest/ingest.module";
import { ServerPersistenceModule } from "./persistence/server-store";
import { ProgressModule } from "./progress/progress.module";

import type { DynamicModule } from "@nestjs/common";
import type { ServerStoreOptions } from "./persistence/server-store";

@Module({})
export class ServerAppModule {
  static register(options: ServerStoreOptions): DynamicModule {
    return {
      module: ServerAppModule,
      imports: [ServerPersistenceModule.register(options), IngestModule, ProgressModule],
    };
  }
}
