#!/usr/bin/env bun

import "reflect-metadata";

import { resolve } from "node:path";

import { NestFactory } from "@nestjs/core";

import { defaultPlanctlConfigPath, loadPlanctlConfig } from "../config/config";
import { MachineAppModule } from "./app.module";
import { CollectorService } from "./collector.service";

function configPath(args: readonly string[]): string {
  const index = args.indexOf("--config");
  if (index === -1) return defaultPlanctlConfigPath("machine");
  const path = args[index + 1];
  if (path === undefined || path.startsWith("--")) throw new Error("--config requires a path");
  return resolve(path);
}

async function main(): Promise<void> {
  const loaded = loadPlanctlConfig(configPath(process.argv.slice(2)), "machine");
  if (loaded.role !== "machine") throw new Error("planctld requires machine configuration");
  const app = await NestFactory.createApplicationContext(MachineAppModule.register(loaded), { logger: false });
  app.enableShutdownHooks();
  const health = app.get(CollectorService).health();
  console.log(JSON.stringify({ service: "planctld", machineId: loaded.machineId, ...health }));
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "planctld failed");
  process.exitCode = 1;
}
