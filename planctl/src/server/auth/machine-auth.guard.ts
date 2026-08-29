import { Injectable, UnauthorizedException } from "@nestjs/common";

import { MachineAdminService } from "../admin/machine-admin.service";

import type { CanActivate, ExecutionContext } from "@nestjs/common";

export interface AuthenticatedMachineRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly params: Readonly<Record<string, string | undefined>>;
  machineSubject?: string;
}

function bearerToken(authorization: string | readonly string[] | undefined): string {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    throw new UnauthorizedException("machine identity or credential is invalid");
  }
  const token = authorization.slice("Bearer ".length);
  if (token === "" || token.includes(" ")) {
    throw new UnauthorizedException("machine identity or credential is invalid");
  }
  return token;
}

@Injectable()
export class MachineAuthGuard implements CanActivate {
  constructor(private readonly admin: MachineAdminService) {}

  /**
   * @tested-by: tst_int_planctl_ingest_001
   * @invariant: CTL-003 a route machine identity is usable only with that machine's hashed bearer credential.
   */
  authorize(machineId: string, authorization: string | readonly string[] | undefined): string {
    const token = bearerToken(authorization);
    if (!this.admin.authenticate(machineId, token)) {
      throw new UnauthorizedException("machine identity or credential is invalid");
    }
    return machineId;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedMachineRequest>();
    const machineId = request.params.machineId;
    if (machineId === undefined) throw new UnauthorizedException("machine identity is missing");
    request.machineSubject = this.authorize(machineId, request.headers.authorization);
    return true;
  }
}
