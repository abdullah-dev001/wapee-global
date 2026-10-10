/**
 * Which branch does the public booking page work with? Pure: no Deno, no I/O, unit-tested.
 *
 * Input is the business's BOOKABLE branches (from `get_bookable_branches`, which applies
 * `branch_is_bookable`) and an optional reference from the link: `?branch=<id or short code>`.
 *
 *   - a reference that matches a bookable branch by id or code (case-insensitive) -> that branch
 *   - no reference, or one that matches nothing:
 *       0 bookable branches -> `none`   (the page says "not available")
 *       1 bookable branch   -> `one`    (nothing to choose: old links keep working)
 *       2+                  -> `choose` (the page shows a picker)
 *
 * An unknown reference is NOT an error: a branch of another business, an archived branch and a
 * typo all behave the same, so a link never reveals which ids exist.
 */

export type BookableBranch = {
  id: string;
  name: string;
  address: string | null;
  timezone: string;
  currency: string;
  countryCode: string;
  isPrimary: boolean;
  /** The branch's invoice prefix: unique per business, used as the short code in links. */
  code: string;
};

export type BranchChoice =
  | { kind: 'none' }
  | { kind: 'one'; branch: BookableBranch }
  | { kind: 'choose'; branches: readonly BookableBranch[] };

export function chooseBranch(
  branches: readonly BookableBranch[],
  ref: string | null | undefined,
): BranchChoice {
  const wanted = ref?.trim().toLowerCase() ?? '';
  if (wanted) {
    const hit = branches.find(
      (branch) => branch.id.toLowerCase() === wanted || branch.code.toLowerCase() === wanted,
    );
    if (hit) return { kind: 'one', branch: hit };
  }
  const [first, ...rest] = branches;
  if (!first) return { kind: 'none' };
  if (rest.length === 0) return { kind: 'one', branch: first };
  return { kind: 'choose', branches };
}
