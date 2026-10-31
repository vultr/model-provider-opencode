import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import type { PluginInput, ProviderHook } from "@opencode-ai/plugin";

import { VultrModelProvider } from "../src/index.ts";

type Models = NonNullable<ProviderHook["models"]>;

let server: Server;
const agents: (string | undefined)[] = [];

before(async () => {
  server = createServer((req, res) => {
    agents.push(req.headers["user-agent"]);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: [] }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  process.env["VULTR_INFERENCE_BASE_URL"] = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env["XDG_CACHE_HOME"] = mkdtempSync(join(tmpdir(), "vultr-opencode-"));
});

after(() => server.close());

test("the catalog request names the plugin and its version", async () => {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  const hooks = await VultrModelProvider({} as PluginInput);
  await hooks.provider?.models?.(...([{ models: {} }, {}] as unknown as Parameters<Models>));
  assert.equal(agents.length, 1);
  assert.ok(agents[0]?.startsWith(`vultr-model-provider-opencode/${version} vultr-model-catalog/`), agents[0]);
});
