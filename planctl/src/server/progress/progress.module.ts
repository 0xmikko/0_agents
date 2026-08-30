import { Module } from "@nestjs/common";

import { IngestModule } from "../ingest/ingest.module";
import { ProgressAuthGuard } from "../auth/progress-auth.guard";
import { ProgressController } from "./progress.controller";
import { ProgressService } from "./progress.service";

@Module({
  imports: [IngestModule],
  controllers: [ProgressController],
  providers: [ProgressAuthGuard, ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
