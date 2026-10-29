import * as env from '../env.ts';

/** P0/P8 can expose its existing env reader without changing any provider API. */
export function providerConfig(): Record<string, string | undefined> {
  const reader = (env as unknown as { providerVariables?: () => Record<string, string> }).providerVariables;
  // Until P8 exports the reader, only explicitly supplied process variables work.
  // Never duplicate reading the private env file in a provider adapter.
  return reader ? reader() : process.env;
}
