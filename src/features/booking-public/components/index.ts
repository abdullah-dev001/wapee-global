/**
 * Presentational components for the customer-facing booking flow.
 *
 * Built in step 4 for the settings LIVE PREVIEW, and reused unchanged by step 5
 * for the real public page at `(public)/[slug]`. They take the view models in
 * `../types.ts` and no query hooks, which is what lets the preview feed them
 * sample data while the real page feeds them `get_slots` output.
 */
export { ServiceList, type ServiceListProps } from './ServiceList';
export { StaffChoice, type StaffChoiceProps } from './StaffChoice';
export { SlotGrid, type SlotGridProps } from './SlotGrid';
export { BookingFormPreview, type BookingFormPreviewProps } from './BookingFormPreview';
export { HoneypotField, type HoneypotFieldProps } from './HoneypotField';
export { BookingFlow, type BookingFlowProps } from './BookingFlow';
