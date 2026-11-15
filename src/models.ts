import type { Hooks } from "@opencode-ai/plugin";
import type { Model } from "@opencode/plugin";
import { acceptsInput, isAgentModel, pricePerMillion, type CatalogModel } from "@vultr/model-catalog";

type ModelsHook = NonNullable<NonNullable<Hooks["provider"]>["models"]>;
export type OpenCodeModel = Awaited<ReturnType<ModelsHook>>[string];

export const PROVIDER = "vultr";
export const NPM = "@ai-sdk/openai-compatible";

// OpenCode 2's model record. Its ids and prices are branded, so plain values are cast where they enter.
export type OpenCodeV2Model = Model.Info;
type Cost = OpenCodeV2Model["cost"][number];
type Variant = OpenCodeV2Model["variants"][number];
const modelId = (id: string) => id as OpenCodeV2Model["id"];
const usd = (price: number | null | undefined) => (price ?? 0) as Cost["input"];

export function isUsable(model: CatalogModel): boolean {
  return isAgentModel(model);
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

// OpenCode 2 names input kinds the way models.dev does: `pdf` for files.
const V2_INPUTS = [
  ["text", "text"],
  ["image", "image"],
  ["video", "video"],
  ["audio", "audio"],
  ["file", "pdf"],
] as const;

// OpenCode 2 builds no variants for a plugin's models, so the efforts are listed here.
export function v2Variants(model: CatalogModel): OpenCodeV2Model["variants"] {
  const levels = variants(model);
  return Object.entries(levels ?? {}).map(([id, settings]): Variant => ({ id: id as Variant["id"], settings }));
}

export function toOpenCodeV2Model(model: CatalogModel, baseUrl: string): OpenCodeV2Model {
  const price = pricePerMillion(model);
  const contextWindow = model.contextWindow ?? 0;
  return {
    id: modelId(model.id),
    modelID: modelId(model.id),
    providerID: PROVIDER as OpenCodeV2Model["providerID"],
    name: model.name,
    // `provider` names the host to the openai-compatible package, as models.dev does.
    settings: { provider: PROVIDER, baseURL: baseUrl },
    // What OpenCode 1 sends through @ai-sdk/openai-compatible; OpenCode 2 would send max_completion_tokens.
    compatibility: { maxTokensField: "max_tokens" },
    capabilities: {
      tools: model.tools,
      input: V2_INPUTS.filter(([modality]) => acceptsInput(model, modality)).map(([, kind]) => kind),
      output: ["text"],
      temperature: model.supportedParameters.includes("temperature"),
    },
    variants: v2Variants(model),
    time: { released: model.created ? model.created * 1000 : 0 },
    cost: [
      {
        input: usd(price.prompt),
        output: usd(price.completion),
        cache: { read: usd(price.cachedPrompt), write: usd(price.cacheWrite) },
      },
    ],
    status: model.deprecationDate ? "deprecated" : "active",
    enabled: true,
    limit: { context: contextWindow, output: model.maxOutputTokens ?? contextWindow },
  };
}

export function toOpenCodeV2Models(models: CatalogModel[], baseUrl: string): OpenCodeV2Model[] {
  return models.filter(isUsable).map((model) => toOpenCodeV2Model(model, baseUrl));
}
