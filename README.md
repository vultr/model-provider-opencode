# @vultr/model-provider-opencode

Replaces the model list [OpenCode](https://opencode.ai) has for Vultr Inference with the live `GET /v1/models` catalog. OpenCode already knows the `vultr` provider from models.dev, but that list is written by hand and its ids no longer match what the API serves.

## Install

OpenCode installs plugins from npm by the name in `opencode.json`. Until
this package is on a registry, point `plugin` at a local checkout. OpenCode
loads it in place, so the checkout needs its own `node_modules`:

```bash
git clone https://github.com/vultr/model-provider-opencode.git ~/src/vultr/model-provider-opencode
cd ~/src/vultr/model-provider-opencode && npm install
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/home/me/src/vultr/model-provider-opencode"]
}
```

```bash
export VULTR_INFERENCE_API_KEY=...
opencode models vultr
opencode run -m vultr/glm-5.3 --variant high "hello"
```

An absolute path, a `file://` URL to the directory and a `file://` URL to
`src/index.ts` all work.

## How it works

`src/index.ts` exports a plugin with two hooks. `config` points provider
`vultr` at `VULTR_INFERENCE_API_KEY`; an `env` a user set on the provider is
kept. `provider.models` replaces the model list: OpenCode calls it with the
provider it built from models.dev and uses the returned record as that
provider's models.

The rest of the provider (name, `@ai-sdk/openai-compatible`, the base URL)
still comes from models.dev, so there is nothing else to configure. OpenCode
enables the provider from its credential, so `VULTR_INFERENCE_API_KEY` is what
turns it on.

The last good catalog is kept in `$XDG_CACHE_HOME/opencode/vultr-model-catalog.json`
and served when the network fails. With neither, the hook returns the models
OpenCode already had.

## Mapping

| OpenCode | Catalog |
| --- | --- |
| `limit.context`, `limit.output` | `contextWindow`, `maxOutputTokens` |
| `cost` (USD per million) | `pricePerMillion`: prompt, completion, `cache.read`, `cache.write` |
| `capabilities.input` | `text`, `image`, `video`, `audio`; `pdf` from `file` |
| `capabilities.attachment` | any non-text input |
| `capabilities.toolcall`, `reasoning`, `temperature` | `tools`, the `reasoning` block, `temperature` in `supportedParameters` |
| `variants` | one per entry of `supportedEfforts` as `{ reasoningEffort }`, plus `none` unless reasoning is mandatory. No allowlist: OpenCode's defaults |
| `status` | `deprecated` when `deprecationDate` is set, else `active` |
| `release_date` | `created` |
| `api` | `@ai-sdk/openai-compatible` at the base URL |

OpenCode caps a request's `max_tokens` itself (32000), so the published output
limit is passed through unchanged.

## Environment

| Variable | Meaning |
| --- | --- |
| `VULTR_INFERENCE_API_KEY` | Makes OpenCode enable the `vultr` provider |
| `VULTR_INFERENCE_BASE_URL` | Overrides `https://api.vultrinference.com/v1` for the catalog and for requests |

## Development

```bash
npm install
npm run typecheck
npm test
```

Verifying against the real harness needs no API key: serve
`model-catalog-typescript/fixtures/vultr-catalog.json` at `/v1/models` from a
local server that records `POST /v1/chat/completions` and answers with a short
SSE stream, then set `VULTR_INFERENCE_BASE_URL` to it and `VULTR_INFERENCE_API_KEY` to
any value. Read the recorded request body: that is what Vultr would receive.
