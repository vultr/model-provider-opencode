import type { Hooks } from "@opencode-ai/plugin";
import { acceptsInput, isChatModel, pricePerMillion, type CatalogModel } from "@vultr/model-catalog";

type ModelsHook = NonNullable<NonNullable<Hooks["provider"]>["models"]>;
export type OpenCodeModel = Awaited<ReturnType<ModelsHook>>[string];

export const PROVIDER = "vultr";
export const NPM = "@ai-sdk/openai-compatible";

export function isUsable(model: CatalogModel): boolean {
  return isChatModel(model) && model.isReady && model.contextWindow !== null;
}

// OpenCode offers a model's reasoning efforts as variants. "none" is the off switch.
export function variants(model: CatalogModel): OpenCodeModel["variants"] {
  const efforts = model.reasoning?.supportedEfforts;
  if (!efforts) {
    return undefined;
  }
  const levels = model.reasoning?.mandatory ? efforts : ["none", ...efforts];
  return Object.fromEntries(levels.map((effort) => [effort, { reasoningEffort: effort }]));
}

export function toOpenCodeModel(model: CatalogModel, baseUrl: string): OpenCodeModel {
  const price = pricePerMillion(model);
  const contextWindow = model.contextWindow ?? 0;
  const levels = variants(model);
  return {
    id: model.id,
    providerID: PROVIDER,
    api: { id: model.id, url: baseUrl, npm: NPM },
    name: model.name,
    capabilities: {
      temperature: model.supportedParameters.includes("temperature"),
      reasoning: model.reasoning !== null,
      attachment: ["image", "video", "audio", "file"].some((modality) => acceptsInput(model, modality)),
      toolcall: model.tools,
      input: {
        text: acceptsInput(model, "text"),
        audio: acceptsInput(model, "audio"),
        image: acceptsInput(model, "image"),
        video: acceptsInput(model, "video"),
        pdf: acceptsInput(model, "file"),
      },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: {
      input: price.prompt ?? 0,
      output: price.completion ?? 0,
      cache: { read: price.cachedPrompt ?? 0, write: price.cacheWrite ?? 0 },
    },
    limit: { context: contextWindow, output: model.maxOutputTokens ?? contextWindow },
    status: model.deprecationDate ? "deprecated" : "active",
    options: {},
    headers: {},
    release_date: model.created ? new Date(model.created * 1000).toISOString().slice(0, 10) : "",
    ...(levels ? { variants: levels } : {}),
  };
}

export function toOpenCodeModels(models: CatalogModel[], baseUrl: string): Record<string, OpenCodeModel> {
  return Object.fromEntries(models.filter(isUsable).map((model) => [model.id, toOpenCodeModel(model, baseUrl)]));
}
