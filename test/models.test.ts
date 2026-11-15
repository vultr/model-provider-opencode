import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeModel, type ModelDocument } from "@vultr/model-catalog";

import {
  isUsable,
  toOpenCodeModel,
  toOpenCodeModels,
  toOpenCodeV2Model,
  toOpenCodeV2Models,
  v2Variants,
  variants,
} from "../src/models.ts";
import { document } from "./fixture.ts";

const BASE_URL = "https://api.vultrinference.com/v1";

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

test("only ready chat models with tools and a context window are offered", () => {
  const reranker = document({ id: "rerank", output_modalities: [{ type: "rerank", supported_parameters: {} }] });
  const unready = document({ id: "unready", is_ready: false });
  const blind = document({ id: "no-context", input_modalities: [{ type: "text" }] });
  const toolless = document({ id: "no-tools", output_modalities: [{ type: "text", supported_parameters: {} }] });
  const models = [document(), reranker, unready, blind, toolless].map(normalizeModel);
  assert.deepEqual(models.map(isUsable), [true, false, false, false, false]);
  assert.deepEqual(Object.keys(toOpenCodeModels(models, BASE_URL)), ["glm-5.3"]);
});

test("a catalog model becomes an OpenCode 2 model", () => {
  assert.deepEqual(toOpenCodeV2Model(normalizeModel(document()), BASE_URL), {
    id: "glm-5.3",
    modelID: "glm-5.3",
    providerID: "vultr",
    name: "GLM 5.3",
    settings: { provider: "vultr", baseURL: BASE_URL },
    compatibility: { maxTokensField: "max_tokens" },
    capabilities: { tools: true, input: ["text", "image", "video"], output: ["text"], temperature: true },
    variants: [
      { id: "none", settings: { reasoningEffort: "none" } },
      { id: "max", settings: { reasoningEffort: "max" } },
      { id: "high", settings: { reasoningEffort: "high" } },
      { id: "low", settings: { reasoningEffort: "low" } },
    ],
    time: { released: 1_786_979_709_000 },
    cost: [{ input: 0.6, output: 2.2, cache: { read: 0.1, write: 0 } }],
    status: "active",
    enabled: true,
    limit: { context: 1_048_576, output: 131_072 },
  });
});

test("OpenCode 2 variants follow the reasoning block", () => {
  const of = (reasoning: ModelDocument["reasoning"] & {} | null) => v2Variants(normalizeModel(document({ reasoning })));
  assert.deepEqual(of(null), []);
  assert.deepEqual(of({ mandatory: true, supported_efforts: ["high"] }), [{ id: "high", settings: { reasoningEffort: "high" } }]);
});

test("a plain text model maps to OpenCode 2 without capabilities it does not have", () => {
  const plain = document({
    reasoning: null,
    deprecation_date: "2027-01-01",
    input_modalities: [{ type: "text", supported_inputs: { max_context_length: { value: 8_192 } } }, { type: "file" }],
    output_modalities: [{ type: "text", supported_parameters: {} }],
  });
  delete plain.created;
  const model = toOpenCodeV2Model(normalizeModel(plain), BASE_URL);
  assert.deepEqual(model.capabilities, { tools: false, input: ["text", "pdf"], output: ["text"], temperature: false });
  assert.deepEqual(model.cost, [{ input: 0, output: 0, cache: { read: 0, write: 0 } }]);
  assert.deepEqual(model.limit, { context: 8_192, output: 8_192 });
  assert.deepEqual(model.time, { released: 0 });
  assert.equal(model.status, "deprecated");
  assert.deepEqual(model.variants, []);
});

test("OpenCode 2 is offered the same models as OpenCode 1", () => {
  const reranker = document({ id: "rerank", output_modalities: [{ type: "rerank", supported_parameters: {} }] });
  const models = [document(), reranker].map(normalizeModel);
  assert.deepEqual(toOpenCodeV2Models(models, BASE_URL).map((model) => model.id), ["glm-5.3"]);
});
