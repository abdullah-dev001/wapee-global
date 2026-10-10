/**
 * Line icons for the landing page, drawn on a 24px grid in the app's icon style
 * (stroke 1.75, round caps; styled by the `.icon` class). Decorative: always aria-hidden.
 */
const paths = {
  scissors:
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  sparkles:
    '<path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 11l5.7-2z"/><path d="M19 3v4M17 5h4M5 17v3M3.5 18.5h3"/>',
  clinic:
    '<path d="M12 21s-8-4.6-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.4-8 11-8 11z"/><path d="M7.5 12h2.5l1-2 2 4 1-2h2.5"/>',
  fitness: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  tutoring:
    '<path d="M2.5 5h6a3.5 3.5 0 0 1 3.5 3.5V20a2.5 2.5 0 0 0-2.5-2.5h-7z"/><path d="M21.5 5h-6A3.5 3.5 0 0 0 12 8.5V20a2.5 2.5 0 0 1 2.5-2.5h7z"/>',
  repair:
    '<path d="M14.5 6.5a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.4-3.4a5.5 5.5 0 0 1-7.3 7.3l-6.3 6.3a2 2 0 0 1-2.9-2.9l6.3-6.3a5.5 5.5 0 0 1 7.3-7.3z"/>',
  booking:
    '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3.5 10h17"/><path d="m9 15 2 2 4-4"/>',
  calendar:
    '<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3.5 10h17M9.5 10v10.5M15 10v10.5"/>',
  clients:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6"/>',
  invoice:
    '<path d="M5.5 2.5h13v19l-3-2-3.5 2-3.5-2-3 2z"/><path d="M9 7.5h6M9 11.5h6M9 15.5h3.5"/>',
  reports: '<path d="M3.5 3.5v17h17"/><path d="M8 16v-4M12.5 16V8M17 16v-6.5"/>',
  website:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  team: '<path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.4 7.5 10 4.3-1.6 7.5-5.4 7.5-10v-6z"/><path d="m9 12 2 2 4-4"/>',
  phone:
    '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/><path d="M9.5 7.5h5M9.5 11h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
} as const;

export type IconName = keyof typeof paths;

export function icon(name: IconName, className = 'icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}

/** Brand mark: a calendar tile with a check, in the primary + accent colours. */
export function logoMark(primary: string, accent: string): string {
  return `<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect x="1" y="3" width="30" height="28" rx="8" fill="${primary}"/><rect x="7" y="0.5" width="3.5" height="7" rx="1.75" fill="${primary}"/><rect x="21.5" y="0.5" width="3.5" height="7" rx="1.75" fill="${primary}"/><path d="m9.5 17.5 4.5 4.5 8.5-9" fill="none" stroke="${accent}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
