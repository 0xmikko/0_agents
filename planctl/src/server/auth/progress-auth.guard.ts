import { Injectable, UnauthorizedException } from "@nestjs/common";

import { MachineAuthGuard } from "./machine-auth.guard";

import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedMachineRequest } from "./machine-auth.guard";

@Injectable()
export class ProgressAuthGuard implements CanActivate {
  constructor(private readonly machineAuth: MachineAuthGuard) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedMachineRequest>();
    const header = request.headers["x-planctl-machine-id"];
    if (typeof header !== "string" || header === "") {
      throw new UnauthorizedException("machine identity or credential is invalid");
    }
    request.machineSubject = this.machineAuth.authorize(header, request.headers.authorization);
    return true;
  }
}
