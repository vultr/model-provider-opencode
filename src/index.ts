import { homedir } from "node:os";
import { join } from "node:path";

import type { Plugin } from "@opencode-ai/plugin";
import { DEFAULT_BASE_URL, loadCatalog } from "@vultr/model-catalog";

import { PROVIDER, toOpenCodeModels } from "./models.ts";

// OpenCode treats every export of this module as a plugin, so the plugin is the only export.
const API_KEY_ENV = "VULTR_INFERENCE_API_KEY";
const BASE_URL_ENV = "VULTR_INFERENCE_BASE_URL";

const cachePath = () =>
  join(process.env["XDG_CACHE_HOME"] || join(homedir(), ".cache"), "opencode", "vultr-model-catalog.json");

// OpenCode knows the vultr provider from models.dev, with a hand-written model list.
// This replaces that list with the live catalog.
export const VultrModelProvider: Plugin = async () => ({
  // models.dev gives provider `vultr` its env var; point the credential at ours.
  // An env a user set on the provider is kept.
  config: async (config) => {
    const vultr = config.provider?.[PROVIDER];
    config.provider = { ...config.provider, [PROVIDER]: { ...vultr, env: vultr?.env ?? [API_KEY_ENV] } };
  },
  provider: {
    id: PROVIDER,
    models: async (provider) => {
      const baseUrl = process.env[BASE_URL_ENV] || DEFAULT_BASE_URL;
      try {
        const catalog = await loadCatalog({ baseUrl, timeoutMs: 5_000, cachePath: cachePath() });
        return toOpenCodeModels(catalog.models, baseUrl);
      } catch {
        // No network and no cache: keep what OpenCode already has.
        return provider.models;
      }
    },
  },
});
