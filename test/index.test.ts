import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

import type { PluginInput, ProviderHook } from "@opencode-ai/plugin";
import type { Plugin as V2 } from "@opencode/plugin";

import * as module from "../src/index.ts";
import { document } from "./fixture.ts";

const plugin = module.default;
type Models = NonNullable<ProviderHook["models"]>;
type Context = Parameters<V2.Plugin["setup"]>[0];
type EditorOf<D extends { transform: (cb: never) => unknown }> = Parameters<Parameters<D["transform"]>[0]>[0];
type ProviderEditor = EditorOf<Context["provider"]>;
type IntegrationEditor = EditorOf<Context["integration"]>;
type IntegrationMethod = ReturnType<IntegrationEditor["method"]["list"]>[number];

let server: Server;
let status = 200;
let data: unknown[] = [];
const agents: (string | undefined)[] = [];

before(async () => {
  server = createServer((req, res) => {
    agents.push(req.headers["user-agent"]);
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ object: "list", data }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  process.env["VULTR_INFERENCE_BASE_URL"] = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

// A fresh cache for each test, so one test's catalog is never served to the next.
beforeEach(() => {
  process.env["XDG_CACHE_HOME"] = mkdtempSync(join(tmpdir(), "vultr-opencode-"));
  agents.length = 0;
  status = 200;
  data = [];
});

after(() => server.close());

test("the module has one export that both OpenCode 1 and OpenCode 2 accept", () => {
  assert.deepEqual(Object.keys(module), ["default"]);
  assert.equal(typeof plugin.id, "string");
  assert.ok(plugin.id.length > 0);
  assert.equal(typeof plugin.server, "function");
  assert.equal(typeof plugin.setup, "function");
  // OpenCode 1 refuses an object with both server() and tui().
  assert.equal("tui" in plugin, false);
});

test("the catalog request names the plugin and its version", async () => {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  const hooks = await plugin.server({} as PluginInput);
  await hooks.provider?.models?.(...([{ models: {} }, {}] as unknown as Parameters<Models>));
  assert.equal(agents.length, 1);
  assert.ok(agents[0]?.startsWith(`vultr-model-provider-opencode/${version} vultr-model-catalog/`), agents[0]);
});

// Records the transforms setup() registers and replays them against small fake editors, as OpenCode 2 does.
function host(options: { provider?: boolean; env?: string[] } = {}) {
  const integrations: ((editor: IntegrationEditor) => void)[] = [];
  const providers: ((editor: ProviderEditor) => void)[] = [];
  let reloaded!: () => void;
  const reload = new Promise<void>((done) => (reloaded = done));
  const ctx = {
    integration: { transform: async (cb: (editor: IntegrationEditor) => void) => void integrations.push(cb) },
    provider: {
      transform: async (cb: (editor: ProviderEditor) => void) => void providers.push(cb),
      reload: async () => reloaded(),
    },
  } as unknown as Context;

  const present = options.provider ?? true;
  const methods: IntegrationMethod[] = [{ type: "env", names: options.env ?? ["VULTR_API_KEY"] }];
  const integration = () => {
    const updates: IntegrationMethod[] = [];
    const editor = {
      get: (id: string) => (present && id === "vultr" ? {} : undefined),
      method: { list: () => methods, update: (input: { method: IntegrationMethod }) => void updates.push(input.method) },
    } as unknown as IntegrationEditor;
    integrations.forEach((cb) => cb(editor));
    return updates;
  };
  const models = () => {
    const sets: { id: string; models: readonly { id: string }[] }[] = [];
    const editor = {
      get: (id: string) => (present && id === "vultr" ? {} : undefined),
      models: { set: (id: string, list: readonly { id: string }[]) => void sets.push({ id, models: list }) },
    } as unknown as ProviderEditor;
    providers.forEach((cb) => cb(editor));
    return sets;
  };
  return { ctx, reload, integration, models };
}

test("OpenCode 2: our env var goes first and the existing ones keep working", async () => {
  const h = host({ env: ["VULTR_API_KEY", "VULTR_INFERENCE_API_KEY"] });
  await plugin.setup(h.ctx);
  assert.deepEqual(h.integration(), [{ type: "env", names: ["VULTR_INFERENCE_API_KEY", "VULTR_API_KEY"] }]);
});

test("OpenCode 2: the catalog replaces the model list once it arrives", async () => {
  data = [document()];
  const h = host();
  await plugin.setup(h.ctx);
  await h.reload;
  const sets = h.models();
  assert.equal(sets.length, 1);
  assert.equal(sets[0]?.id, "vultr");
  assert.deepEqual(sets[0]?.models.map((model) => model.id), ["glm-5.3"]);
});

test("OpenCode 2: without the models.dev provider nothing is created", async () => {
  data = [document()];
  const h = host({ provider: false });
  await plugin.setup(h.ctx);
  await h.reload;
  assert.deepEqual(h.models(), []);
  assert.deepEqual(h.integration(), []);
});

test("OpenCode 2: a failing catalog leaves models.dev's list and does not reject", async () => {
  status = 500;
  const h = host();
  await plugin.setup(h.ctx);
  await new Promise((done) => setTimeout(done, 200));
  assert.ok(agents.length > 0);
  assert.deepEqual(h.models(), []);
});
