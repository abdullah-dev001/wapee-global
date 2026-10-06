export const REPORT_ERROR_KEYS = {
  forbidden: 'advReports.errors.forbidden',
  feature_unavailable: 'advReports.errors.feature_unavailable',
  invalid_period: 'advReports.errors.invalid_period',
  invalid_date: 'advReports.errors.invalid_date',
  invalid_range: 'advReports.errors.invalid_range',
  range_too_large: 'advReports.errors.range_too_large',
  invalid_section: 'advReports.errors.invalid_section',
  invalid_branch: 'advReports.errors.invalid_branch',
  unknown: 'advReports.errors.unknown',
} as const;

export type ReportErrorCode = keyof typeof REPORT_ERROR_KEYS;

export function reportErrorKey(code: string | null): (typeof REPORT_ERROR_KEYS)[ReportErrorCode] {
  if (code && Object.prototype.hasOwnProperty.call(REPORT_ERROR_KEYS, code)) {
    return REPORT_ERROR_KEYS[code as ReportErrorCode];
  }
  return REPORT_ERROR_KEYS.unknown;
}
