import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Plugin as V1Plugin, PluginModule as V1PluginModule } from "@opencode-ai/plugin";
import type { Plugin as V2 } from "@opencode/plugin";
import { DEFAULT_BASE_URL, loadCatalog, type Catalog } from "@vultr/model-catalog";

import { PROVIDER, toOpenCodeModels, toOpenCodeV2Models, type OpenCodeV2Model } from "./models.ts";

// One default export serves both hosts: OpenCode 1 calls `server`, OpenCode 2 calls `setup`.
// It stays the only export, and nothing from either SDK is imported at runtime.
const ID = "vultr.model-provider";
const API_KEY_ENV = "VULTR_INFERENCE_API_KEY";
const BASE_URL_ENV = "VULTR_INFERENCE_BASE_URL";

// Goes in front of the catalog library's own User-Agent. OpenCode loads this source from the package.
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const USER_AGENT = `vultr-model-provider-opencode/${version}`;

const cachePath = () =>
  join(process.env["XDG_CACHE_HOME"] || join(homedir(), ".cache"), "opencode", "vultr-model-catalog.json");

const baseUrl = () => process.env[BASE_URL_ENV] || DEFAULT_BASE_URL;

const catalog = (url: string): Promise<Catalog> =>
  loadCatalog({ baseUrl: url, userAgent: USER_AGENT, timeoutMs: 5_000, cachePath: cachePath() });

// OpenCode 1 knows the vultr provider from models.dev, with a hand-written model list.
// This replaces that list with the live catalog.
const server: V1Plugin = async () => ({
  // models.dev gives provider `vultr` its env var; point the credential at ours.
  // An env a user set on the provider is kept.
  config: async (config) => {
    const vultr = config.provider?.[PROVIDER];
    config.provider = { ...config.provider, [PROVIDER]: { ...vultr, env: vultr?.env ?? [API_KEY_ENV] } };
  },
  provider: {
    id: PROVIDER,
    models: async (provider) => {
      const url = baseUrl();
      try {
        return toOpenCodeModels((await catalog(url)).models, url);
      } catch {
        // No network and no cache: keep what OpenCode already has.
        return provider.models;
      }
    },
  },
});

// OpenCode 2 waits only a few seconds for plugins to start, so the catalog loads in the background
// and the transforms are replayed once it arrives. Until then, and if it never does, models.dev's list stands.
const setup: V2.Plugin["setup"] = async (ctx) => {
  let models: OpenCodeV2Model[] = [];

  // Ours goes first; env names already there, from models.dev or the user's config, keep working.
  await ctx.integration.transform((editor) => {
    if (!editor.get(PROVIDER)) {
      return;
    }
    const names = editor.method
      .list(PROVIDER)
      .flatMap((method) => (method.type === "env" ? method.names : []))
      .filter((name) => name !== API_KEY_ENV);
    editor.method.update({ integrationID: PROVIDER, method: { type: "env", names: [API_KEY_ENV, ...names] } });
  });

  await ctx.provider.transform((editor) => {
    // Only extend the models.dev provider; never create one without its package and base URL.
    if (models.length > 0 && editor.get(PROVIDER)) {
      editor.models.set(PROVIDER, models);
    }
  });

  const url = baseUrl();
  catalog(url)
    .then((loaded) => {
      models = toOpenCodeV2Models(loaded.models, url);
      return models.length > 0 ? ctx.provider.reload() : undefined;
    })
    .catch(() => {
      // No network and no cache: keep what OpenCode already has.
    });
};

export default { id: ID, server, setup } satisfies V1PluginModule & V2.Plugin;
