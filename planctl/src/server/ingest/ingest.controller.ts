import { Body, Controller, HttpCode, Param, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";

import { MachineAuthGuard } from "../auth/machine-auth.guard";
import { IngestService } from "./ingest.service";

import type { AuthenticatedMachineRequest } from "../auth/machine-auth.guard";
import type { SnapshotAcknowledgement } from "./ingest.service";

@Controller("v1/machines")
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post(":machineId/snapshots")
  @HttpCode(200)
  @UseGuards(MachineAuthGuard)
  accept(
    @Param("machineId") machineId: string,
    @Body() input: unknown,
    @Req() request: AuthenticatedMachineRequest,
  ): SnapshotAcknowledgement {
    if (request.machineSubject === undefined) throw new UnauthorizedException("machine identity is missing");
    return this.ingest.accept(machineId, input, request.machineSubject);
  }
}
