# @vultr/model-provider-opencode

Replaces the model list [OpenCode](https://opencode.ai) has for Vultr Inference with the live `GET /v1/models` catalog. OpenCode already knows the `vultr` provider from models.dev, but that list is written by hand and its ids no longer match what the API serves.

One package works on OpenCode 1 (1.18 and newer) and OpenCode 2.

## Install

Add the package to `plugin` in `opencode.json`. OpenCode installs it from npm
on the next start:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@vultr/model-provider-opencode"]
}
```

OpenCode 2 reads the same `plugin` entry: it moves V1 entries into its own
`plugins` list. A config written only for OpenCode 2 can use `"plugins"`
directly; OpenCode 1 ignores that key.

The CLI can add the entry for you:

| | Command | Writes to |
| --- | --- | --- |
| OpenCode 1 | `opencode plugin @vultr/model-provider-opencode` | `.opencode/opencode.json` in the project (`-g` for the global config) |
| OpenCode 2 | `opencode plugin add @vultr/model-provider-opencode` | the global config |

Then set the key and check that the live models are listed:

```bash
export VULTR_INFERENCE_API_KEY=...
```

| | List models | Send a prompt |
| --- | --- | --- |
| OpenCode 1 | `opencode models vultr` | `opencode run -m vultr/glm-5.3 --variant high "hello"` |
| OpenCode 2 | `opencode models` | `opencode run -m 'vultr/glm-5.3#high' "hello"` |

Ids such as `vultr/glm-5.3` come from the live catalog.

### Updating

Both versions keep an installed plugin in their cache and do not fetch a
newer release of it on their own. To pick the version, pin it in the entry,
for example `"@vultr/model-provider-opencode@0.0.6"`. Changing the pinned
version installs that release on the next start.

### From a checkout

To run unreleased changes, point `plugin` at a local checkout instead.
OpenCode loads it in place, so the checkout needs its own `node_modules`:

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

An absolute path and a `file://` URL to the directory work on both. A
`file://` URL to `src/index.ts` works on OpenCode 1 only: OpenCode 2 loads a
configured path only when it is a directory.

## How it works

`src/index.ts` has one default export, `{ id, server, setup }`. OpenCode 1
calls `server`; OpenCode 2 calls `setup`. Each ignores the other's key.

### OpenCode 1

`server` returns two hooks. `config` points provider
`vultr` at `VULTR_INFERENCE_API_KEY`; an `env` a user set on the provider is
kept. `provider.models` replaces the model list: OpenCode calls it with the
provider it built from models.dev and uses the returned record as that
provider's models.

The rest of the provider (name, `@ai-sdk/openai-compatible`, the base URL)
still comes from models.dev, so there is nothing else to configure. OpenCode
enables the provider from its credential, so `VULTR_INFERENCE_API_KEY` is what
turns it on.

### OpenCode 2

`setup` registers two transforms:

- the `vultr` integration reads `VULTR_INFERENCE_API_KEY` first; env vars it
  already had, such as models.dev's `VULTR_API_KEY` or one set in config, still
  work
- the `vultr` provider's models are replaced with the catalog

OpenCode 2 gives plugins a few seconds to start, so the catalog loads in the
background and the provider is reloaded when it arrives. Until then the
models.dev list is shown. Neither transform creates the provider when
models.dev does not have it.

### Both

The last good catalog is kept in `$XDG_CACHE_HOME/opencode/vultr-model-catalog.json`
and served when the network fails. With neither, OpenCode keeps the models it
already had.

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

OpenCode 2 uses the same catalog fields with its own shapes: `cost` is a
one-entry list, `time.released` is in milliseconds, `variants` is a list of
`{ id, settings: { reasoningEffort } }`, input kinds are `text`, `image`,
`video`, `audio` and `pdf`, and `status` stays `deprecated` or `active`
(`enabled` is always true). Each model sets `settings.provider` to `vultr` and
`settings.baseURL` to the base URL, as models.dev does, and
`compatibility.maxTokensField` to `max_tokens`, the field OpenCode 1 sends.
OpenCode 2 limits a request's output to what is left of the context window.

## Environment

| Variable | Meaning |
| --- | --- |
| `VULTR_INFERENCE_API_KEY` | Makes OpenCode enable the `vultr` provider. On OpenCode 2, models.dev's `VULTR_API_KEY` also does |
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
