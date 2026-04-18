// process.env.OPENROUTER_API_KEY is replaced with the literal key string
// by webpack DefinePlugin at build time. The declare below is scoped to this
// module so it does not widen the global type environment.
declare const process: { env: { OPENROUTER_API_KEY?: string } };

export const BUNDLED_OPENROUTER_KEY: string =
  process.env.OPENROUTER_API_KEY ?? "";
