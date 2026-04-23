// Compile-time constants injected by webpack DefinePlugin from .env.
// Both values are required; the build will warn if they are absent.
declare const process: {
  env: {
    AUTOMESSAGE_PROXY_URL?: string;
    AUTOMESSAGE_SHARED_TOKEN?: string;
  };
};

export const PROXY_URL: string = process.env.AUTOMESSAGE_PROXY_URL ?? "";
export const SHARED_TOKEN: string = process.env.AUTOMESSAGE_SHARED_TOKEN ?? "";
