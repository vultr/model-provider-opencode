# AGENTS.md - vultr/model-provider-opencode

An OpenCode plugin for OpenCode 1 and OpenCode 2. It points the `vultr` provider at `VULTR_INFERENCE_API_KEY` and swaps the hand-written models.dev list for the live catalog. `src/index.ts` is the plugin: `server` holds the OpenCode 1 hooks (`config`, `provider.models`) and `setup` the OpenCode 2 transforms (integration env, provider models). `src/models.ts` is the mapping for both and is what the tests cover.

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
  with the output limit before changing how it is mapped: OpenCode 1 caps it
  at 32000, OpenCode 2 at what is left of the context window. OpenCode 2 is
  told to send `max_tokens`, as OpenCode 1 does
- **OpenCode 2 must start fast.** Its server waits about 5 seconds for plugins.
  `setup` registers its transforms, loads the catalog in the background and
  calls `ctx.provider.reload()` when it arrives; it never awaits the network
- **Reasoning travels as top-level `reasoning_effort`,** limited to the
  model's `supported_efforts`; `none` switches it off unless reasoning is
  mandatory.
- **Extend, do not duplicate.** models.dev defines provider `vultr` with its name, SDK and env var. Keep the id `vultr`; override only the credential env var and the models. On OpenCode 1 an `env` a user set directly on the provider is kept; on OpenCode 2 ours goes first and the env names already there keep working. A second provider would split credentials and confuse the picker

## Validation

Fast (inner loop):
- `node --test test/<name>.test.ts` - one test file (`test/models.test.ts`
  takes well under a second). `npm test -- <path>` does not narrow: the
  script's glob still runs every file
- `node --test --test-name-pattern "<name>" test/<name>.test.ts` - one test
- `npm run typecheck` - types only, a couple of seconds

Full (once, before calling a change complete):
- `npm run typecheck` and `npm test` must pass

Heavy (never in the inner loop; run once at the end in the background):
- `opencode models vultr --print-logs` from a scratch directory, with
  OpenCode 1 and with OpenCode 2 (below)

## Working here

- Types come from the real
  `@opencode-ai/plugin` (OpenCode 1) and `@opencode/plugin` (OpenCode 2)
  packages, pinned to the versions tested against; derive the model types from
  them, do not redeclare them
- Both SDKs are imported as types only. OpenCode 2 refuses a plugin that loads
  its own copy of `@opencode/plugin`, and OpenCode 1 does not have it
- The default export `{ id, server, setup }` is the only export of
  `src/index.ts`, and it stays that way. With an `id` OpenCode 1 reads only
  `default.server`; OpenCode 2 reads only `default.id` and `default.setup`.
  Never add `tui`: OpenCode 1 refuses an object with both `server` and `tui`.
  OpenCode 1.19 also hosts OpenCode 2 plugins and calls `setup` alongside
  `server`, so `setup` must be harmless there.
  `opencode models vultr --print-logs` shows a load failure, a stale model
  list is the only other symptom
- OpenCode runs plugins on Bun and loads the `.ts` sources as they are; the
  tests run them on Node's type stripping. Keep the source erasable and keep
  `.ts` on relative imports
- `@vultr/model-catalog` comes from the npm registry with its `dist` built.
  Both OpenCode versions install plugins with lifecycle scripts off, so no
  dependency may need a build step at install time
- To test, make a scratch directory whose `opencode.json` has
  `"plugin": ["<absolute path to this tree>"]` and run
  `opencode models vultr --print-logs` there, with OpenCode 1 and with
  OpenCode 2 (which reads the same entry; the path must be a directory). Live
  ids such as `vultr/glm-5.3` mean the plugin loaded; ids with a vendor prefix
  are the models.dev list
- Verify against the installed OpenCode, not only the unit tests. The
  README describes the key-free capture setup
