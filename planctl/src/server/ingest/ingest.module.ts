import { Module } from "@nestjs/common";

import { MachineAdminService } from "../admin/machine-admin.service";
import { MachineAuthGuard } from "../auth/machine-auth.guard";
import { TransitionService } from "../transitions/transition.service";
import { IngestController } from "./ingest.controller";
import { IngestService } from "./ingest.service";

@Module({
  controllers: [IngestController],
  providers: [MachineAdminService, MachineAuthGuard, IngestService, TransitionService],
  exports: [MachineAdminService, MachineAuthGuard, IngestService, TransitionService],
})
export class IngestModule {}
