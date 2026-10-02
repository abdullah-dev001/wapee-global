/**
 * Stub for `lucide-react-native` in unit tests.
 *
 * `config/navigation.ts` imports icons, and the real package pulls in
 * react-native, which cannot load in plain Node. Tests only ever read the nav
 * items' ids, routes and permissions, so a placeholder component is enough.
 */

const Icon = () => null;

export type LucideIcon = typeof Icon;

export const CalendarDays = Icon;
export const LayoutDashboard = Icon;
export const Package = Icon;
export const Receipt = Icon;
export const Scissors = Icon;
export const Settings = Icon;
export const Star = Icon;
export const Users = Icon;
