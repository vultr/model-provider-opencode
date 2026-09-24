# AGENTS.md - vultr/model-provider-opencode

An OpenCode plugin with two hooks: `config` points the `vultr` provider at `VULTR_INFERENCE_API_KEY`, and `provider.models` swaps the hand-written models.dev list for the live catalog. `src/index.ts` is the plugin; `src/models.ts` is the mapping and is what the tests cover.

Human overview, mapping table and install: `README.md`.

## What holds the design up

- **The catalog library does the reading.** `@vultr/model-catalog` fetches
  `GET /v1/models`, parses Model Document 2.4 and normalizes it. This repo
  only maps a normalized model onto what OpenCode has a place for. A parsing
  or normalization fix belongs in the library, not here
- **Nothing static.** No model id, context window or price is written in this
  repo. A model Vultr adds shows up without a release
- **Never break the host.** No network and no cache means the provider is
  absent or keeps what OpenCode already had. Startup, listing and requests
  must not raise because the catalog is down
- **Only usable models are offered:** text output, `is_ready`, and a context
  window. Rerankers, image generators and unready models are dropped
- **Requests must be accepted by the engine.** Vultr publishes `max_length`
  equal to the context window for most models. Sent as `max_tokens` that is
  always rejected (prompt + max_tokens > context). Check what OpenCode does
  with the output limit before changing how it is mapped
- **Reasoning travels as top-level `reasoning_effort`,** limited to the
  model's `supported_efforts`; `none` switches it off unless reasoning is
  mandatory.
- **Extend, do not duplicate.** models.dev defines provider `vultr` with its name, SDK and env var. Keep the id `vultr`; override only the credential env var (an `env` a user set directly on the provider is kept) and the models. A second provider would split credentials and confuse the picker

## Working here

- `npm run typecheck` and `npm test` must pass. Types come from the real
  `@opencode-ai/plugin` package, pinned to the OpenCode version tested
  against; derive the model type from the hook, do not redeclare it
- The plugin function is the only export of `src/index.ts`, and it stays that
  way. OpenCode treats every export of a plugin module as a plugin: one
  exported constant and the whole module fails with `Plugin export is not a
  function`; a second export of the same function would register it twice.
  `opencode models vultr --print-logs` shows a load failure, a stale model
  list is the only other symptom
- OpenCode runs plugins on Bun and loads the `.ts` sources as they are; the
  tests run them on Node's type stripping. Keep the source erasable and keep
  `.ts` on relative imports
- `@vultr/model-catalog` is a git dependency that builds in `prepare`. Bun
  does not run lifecycle scripts for untrusted dependencies, so an install by
  OpenCode from npm has not been proven. Settle this before publishing: put
  the library on a registry, or bundle it into this package
- To test, make a scratch directory whose `opencode.json` has
  `"plugin": ["<absolute path to this tree>"]` and run
  `opencode models vultr --print-logs` there. Live ids such as `vultr/glm-5.3`
  mean the plugin loaded; ids with a vendor prefix are the models.dev list
- Verify against the installed OpenCode, not only the unit tests. The
  README describes the key-free capture setup
- Put lasting explanation in `docs/` or the README, not in the source. If a
  comment is needed, make it short. Docs describe current behavior, not history
- Write commit messages to the Conventional Commits spec
- No em dashes or en dashes anywhere: prose, comments, commit messages and
  docs use plain hyphens, `·`, or `:`
- No AI trailers on commits (`Co-Authored-By`, `Generated with`, ...)
- Never force-push; never rewrite pushed history
