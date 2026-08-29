#!/usr/bin/env bun

import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { defaultPlanctlConfigPath, loadPlanctlConfig } from "../config/config";
import { MachineAdminService } from "./admin/machine-admin.service";
import { ServerAppModule } from "./app.module";

import type { INestApplication, INestApplicationContext } from "@nestjs/common";
import type { ServerConfig } from "../config/config";

function option(args: readonly string[], name: string): string | undefined {
  const position = args.indexOf(name);
  if (position === -1) return undefined;
  const value = args[position + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function serverConfig(args: readonly string[]): ServerConfig {
  const configPath = option(args, "--config") ?? defaultPlanctlConfigPath("server");
  const config = loadPlanctlConfig(configPath, "server");
  if (config.role !== "server") throw new Error("server configuration has the wrong role");
  return config;
}

function address(bind: string): { readonly host: string; readonly port: number } {
  const match = /^(?:\[([^\]]+)\]|([^:]+)):([1-9]\d{0,4})$/.exec(bind);
  const host = match?.[1] ?? match?.[2];
  const rawPort = match?.[3];
  if (host === undefined || rawPort === undefined) throw new Error("server bind is invalid");
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port > 65_535) throw new Error("server bind port is invalid");
  return { host, port };
}

function moduleFor(config: ServerConfig): ReturnType<typeof ServerAppModule.register> {
  return ServerAppModule.register({
    databasePath: config.database,
    machineOfflineAfterSeconds: config.machineOfflineAfterSeconds,
    transitionScanMs: 5_000,
    now: () => new Date().toISOString(),
  });
}

export async function createServerApplication(config: ServerConfig): Promise<INestApplication> {
  return await NestFactory.create(moduleFor(config));
}

async function createServerContext(config: ServerConfig): Promise<INestApplicationContext> {
  return await NestFactory.createApplicationContext(moduleFor(config));
}

export async function runServer(args: readonly string[]): Promise<void> {
  const config = serverConfig(args);
  const app = await createServerApplication(config);
  const bind = address(config.bind);
  await app.listen(bind.port, bind.host);
}

async function createMachine(args: readonly string[]): Promise<void> {
  const machineId = args[2];
  if (machineId === undefined) throw new Error("machine create requires machineId");
  const config = serverConfig(args.slice(3));
  const app = await createServerContext(config);
  try {
    const enrollment = app.get(MachineAdminService).createMachine(machineId);
    process.stdout.write(`${enrollment.token}\n`);
  } finally {
    await app.close();
  }
}

async function main(args: readonly string[]): Promise<void> {
  if (args[0] === "machine" && args[1] === "create") {
    await createMachine(args);
    return;
  }
  if (args[0] === "--help" || args[0] === "-h") {
    process.stdout.write([
      "Usage: planctl-server [--config <server.toml>]",
      "       planctl-server machine create <machineId> [--config <server.toml>]",
      "",
    ].join("\n"));
    return;
  }
  await runServer(args);
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`planctl-server: ${message}\n`);
    process.exitCode = 1;
  });
}
