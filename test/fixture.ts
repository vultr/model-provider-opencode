import type { ModelDocument } from "@vultr/model-catalog";

export function document(overrides: Partial<ModelDocument> = {}): ModelDocument {
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
