export function assertNever(
  value: never,
  message = 'Unhandled exhaustive switch case',
): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}
