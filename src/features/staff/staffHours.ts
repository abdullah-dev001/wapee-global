import { type StaffListItem } from './api/useStaff';

/**
 * True when this person can be booked online at `branchId` on paper but has no
 * working hours there. `get_free_slots` has no fallback to the branch hours, so such
 * a person produces zero slots.
 */
export function hasNoWorkingHours(
  member: Pick<StaffListItem, 'isActive' | 'isBookableOnline' | 'branchIds' | 'hoursBranchIds'>,
  branchId: string | null,
): boolean {
  if (!branchId || !member.isActive || !member.isBookableOnline) return false;
  if (!member.branchIds.includes(branchId)) return false;
  return !member.hoursBranchIds.includes(branchId);
}
