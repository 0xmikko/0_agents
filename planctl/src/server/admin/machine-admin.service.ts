import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { ServerStore } from "../persistence/server-store";

export interface MachineEnrollment {
  readonly machineId: string;
  readonly token: string;
}

function validMachineId(machineId: string): void {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(machineId)) throw new Error("machineId is invalid");
}

function encodedCredential(token: string, salt: Buffer): string {
  if (token.length < 16) throw new Error("machine credential must contain at least 16 characters");
  const digest = scryptSync(token, salt, 32);
  return `scrypt$${salt.toString("hex")}$${digest.toString("hex")}`;
}

function verifyCredential(token: string, encoded: string): boolean {
  const [algorithm, saltHex, digestHex, extra] = encoded.split("$");
  if (algorithm !== "scrypt" || saltHex === undefined || digestHex === undefined || extra !== undefined) return false;
  const expected = Buffer.from(digestHex, "hex");
  if (expected.length !== 32) return false;
  const actual = scryptSync(token, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

@Injectable()
export class MachineAdminService {
  constructor(private readonly store: ServerStore) {}

  createMachine(machineId: string): MachineEnrollment {
    const token = randomBytes(32).toString("base64url");
    this.registerMachine(machineId, token);
    return { machineId, token };
  }

  registerMachine(machineId: string, token: string): void {
    validMachineId(machineId);
    const salt = scryptSync(machineId, "planctl-machine-credential-salt-v1", 16);
    this.store.registerMachine(machineId, encodedCredential(token, salt));
  }

  authenticate(machineId: string, token: string): boolean {
    const encoded = this.store.machineCredentialHash(machineId);
    return encoded !== null && verifyCredential(token, encoded);
  }
}
