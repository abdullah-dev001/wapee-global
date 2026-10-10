/**
 * Node file access for tests that read source / migration files. There is no
 * @types/node in this project, so the modules are imported dynamically with a
 * minimal typed shape (same approach as `lib/query/keys.test.ts`).
 */
export type NodeFs = {
  readdirSync: (dir: string) => string[];
  readFileSync: (file: string, enc: 'utf8') => string;
  statSync: (file: string) => { isDirectory: () => boolean };
  join: (...parts: string[]) => string;
  /** The repo root (vitest runs from it). */
  root: string;
};

export async function loadNodeFs(): Promise<NodeFs> {
  const fsName = 'node:fs';
  const pathName = 'node:path';
  const fs = (await import(/* @vite-ignore */ fsName)) as Omit<NodeFs, 'join' | 'root'>;
  const path = (await import(/* @vite-ignore */ pathName)) as Pick<NodeFs, 'join'>;
  return {
    readdirSync: fs.readdirSync,
    readFileSync: fs.readFileSync,
    statSync: fs.statSync,
    join: path.join,
    root: process.cwd(),
  };
}

/** Every file under `dir` (relative to the repo root) whose name matches `pattern`. */
export function listFiles(nodeFs: NodeFs, dir: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of nodeFs.readdirSync(current)) {
      const full = nodeFs.join(current, name);
      if (nodeFs.statSync(full).isDirectory()) walk(full);
      else if (pattern.test(name)) out.push(full);
    }
  };
  walk(nodeFs.join(nodeFs.root, dir));
  return out;
}
