import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeModel, type ModelDocument } from "@vultr/model-catalog";

import { isUsable, toOpenCodeModel, toOpenCodeModels, variants } from "../src/models.ts";

const BASE_URL = "https://api.vultrinference.com/v1";

function document(overrides: Partial<ModelDocument> = {}): ModelDocument {
  return {
    schema_version: "2.4",
    id: "glm-5.3",
    name: "GLM 5.3",
    created: 1_786_979_709,
    input_modalities: [
      {
        type: "text",
        supported_inputs: { max_context_length: { value: 1_048_576, unit: "token" } },
        pricing: [
          { type: "prompt", unit: "token", cost_usd: "0.0000006" },
          { type: "cached_prompt", unit: "token", cost_usd: "0.0000001" },
        ],
      },
      { type: "image" },
      { type: "video" },
    ],
    output_modalities: [
      {
        type: "text",
        max_length: { value: 131_072, unit: "token" },
        supported_parameters: { temperature: { type: "range", min: 0, max: 2 }, tools: { type: "boolean" } },
        pricing: [{ type: "completion", unit: "token", cost_usd: "0.0000022" }],
      },
    ],
    reasoning: { mandatory: false, supported_efforts: ["max", "high", "low"], supports_max_tokens: true },
    ...overrides,
  };
}

test("a catalog model becomes an OpenCode model", () => {
  assert.deepEqual(toOpenCodeModel(normalizeModel(document()), BASE_URL), {
    id: "glm-5.3",
    providerID: "vultr",
    api: { id: "glm-5.3", url: BASE_URL, npm: "@ai-sdk/openai-compatible" },
    name: "GLM 5.3",
    capabilities: {
      temperature: true,
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: true, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0.6, output: 2.2, cache: { read: 0.1, write: 0 } },
    limit: { context: 1_048_576, output: 131_072 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-08-17",
    variants: {
      none: { reasoningEffort: "none" },
      max: { reasoningEffort: "max" },
      high: { reasoningEffort: "high" },
      low: { reasoningEffort: "low" },
    },
  });
});

test("variants follow the reasoning block", () => {
  const of = (reasoning: ModelDocument["reasoning"] & {} | null) => variants(normalizeModel(document({ reasoning })));
  assert.equal(of(null), undefined);
  // No allowlist: OpenCode's own defaults stand.
  assert.equal(of({ mandatory: false, supported_efforts: null }), undefined);
  // Mandatory reasoning has no off switch.
  assert.deepEqual(of({ mandatory: true, supported_efforts: ["high"] }), { high: { reasoningEffort: "high" } });
});

test("a plain text model maps without capabilities it does not have", () => {
  const model = toOpenCodeModel(
    normalizeModel(
      document({
        reasoning: null,
        deprecation_date: "2027-01-01",
        input_modalities: [{ type: "text", supported_inputs: { max_context_length: { value: 8_192 } } }],
        output_modalities: [{ type: "text", supported_parameters: {} }],
      }),
    ),
    BASE_URL,
  );
  assert.equal(model.capabilities.reasoning, false);
  assert.equal(model.capabilities.attachment, false);
  assert.equal(model.capabilities.toolcall, false);
  assert.equal(model.capabilities.temperature, false);
  assert.deepEqual(model.cost, { input: 0, output: 0, cache: { read: 0, write: 0 } });
  assert.deepEqual(model.limit, { context: 8_192, output: 8_192 });
  assert.equal(model.status, "deprecated");
  assert.equal("variants" in model, false);
});

test("only ready chat models with a context window are offered", () => {
  const reranker = document({ id: "rerank", output_modalities: [{ type: "rerank", supported_parameters: {} }] });
  const unready = document({ id: "unready", is_ready: false });
  const blind = document({ id: "no-context", input_modalities: [{ type: "text" }] });
  const models = [document(), reranker, unready, blind].map(normalizeModel);
  assert.deepEqual(models.map(isUsable), [true, false, false, false]);
  assert.deepEqual(Object.keys(toOpenCodeModels(models, BASE_URL)), ["glm-5.3"]);
});
