/** Thrown by helper skeletons whose logic is not built yet. Remove usages as helpers are implemented. */
export function notImplemented(name: string): never {
  throw new Error(`${name} is not implemented yet.`);
}
