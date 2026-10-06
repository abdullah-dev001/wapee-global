import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react-native';

import { isRtl } from './direction';

/**
 * The "previous" and "next" chevrons for a language. In a right-to-left language
 * "previous" points right, so the pair swaps (same rule the Calendar follows).
 */
export function stepIcons(language: string): { Previous: LucideIcon; Next: LucideIcon } {
  return isRtl(language)
    ? { Previous: ChevronRight, Next: ChevronLeft }
    : { Previous: ChevronLeft, Next: ChevronRight };
}
