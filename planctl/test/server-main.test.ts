import { afterEach, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BotService } from "../src/telegram/bot.service";
import { CommandsService } from "../src/telegram/commands.service";
import { NotifierService } from "../src/telegram/notifier.service";
import { loadPlanctlConfig } from "../src/config/config";
import { createServerApplication } from "../src/server/main";

import type { ServerConfig } from "../src/config/config";
import type { TelegramFetch } from "../src/telegram/telegram-client";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): ServerConfig {
  const root = mkdtempSync(join(tmpdir(), "planctl-server-main-"));
  roots.push(root);
  mkdirSync(join(root, "state"), { recursive: true });
  const token = join(root, "telegram.token");
  writeFileSync(token, "fixture-bot-token\n", { mode: 0o600 });
  chmodSync(token, 0o600);
  const config = join(root, "server.toml");
  writeFileSync(config, `
version = 1
bind = "127.0.0.1:4789"
external_url = "https://planctl.example.test"
database = "${join(root, "state/server.sqlite")}"
machine_offline_after_seconds = 60
history_retention_days = 90

[telegram]
bot_token_file = "${token}"
allowed_user_ids = [101]
default_chat_id = 101
long_poll_seconds = 30
claim_lease_seconds = 60
notifier_scan_milliseconds = 5000
`);
  const loaded = loadPlanctlConfig(config, "server");
  if (loaded.role !== "server") throw new Error("server fixture decoded as machine");
  return loaded;
}

/**
 * @test-id: tst_int_planctl_server_bootstrap_001
 * @scenario: scn_planctl_server_bootstrap_001
 * @covers: planctl/src/server/main.ts::createServerApplication
 * @deterministic: yes
 * @fixtures: temporary server TOML, SQLite and mode-0600 bot token
 *
 * Test environment: real production Nest composition
 * Clients: injected Telegram fetch and Nest provider lookup
 * Mocks: Telegram HTTP transport and fixed clock only
 * Data: one authorized /progress update and no live network
 */
it("tst_int_planctl_server_bootstrap_001 activates configured Telegram commands and alerts", async () => {
  const calls: string[] = [];
  let delivered = false;
  let resolveSent: (() => void) | undefined;
  const sent = new Promise<void>((resolve) => {
    resolveSent = resolve;
  });
  const telegramFetch: TelegramFetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/getUpdates") && !delivered) {
      delivered = true;
      return new Response(JSON.stringify({
        ok: true,
        result: [{
          update_id: 1,
          message: { from: { id: 101 }, chat: { id: 101 }, text: "/progress" },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/sendMessage")) {
      resolveSent?.();
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const signal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      const abort = (): void => reject(new DOMException("aborted", "AbortError"));
      if (signal?.aborted === true) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    });
  };

  const app = await createServerApplication(fixture(), {
    telegramFetch,
    now: () => "2026-08-30T00:00:00.000Z",
  });
  try {
    await app.init();
    expect(app.get(BotService)).toBeInstanceOf(BotService);
    expect(app.get(CommandsService)).toBeInstanceOf(CommandsService);
    expect(app.get(NotifierService)).toBeInstanceOf(NotifierService);
    await sent;
    expect(calls.some((url) => url.includes("fixture-bot-token/getUpdates"))).toBeTrue();
    expect(calls.some((url) => url.endsWith("/sendMessage"))).toBeTrue();
  } finally {
    await app.close();
  }
});
