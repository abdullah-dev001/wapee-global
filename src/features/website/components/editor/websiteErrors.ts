import { type TFunction } from 'i18next';

import { ImageUploadError } from '../../api/useWebsiteAdmin';
import { WebsiteRpcError } from '../../adminTypes';

/** A user-facing message for any editor failure. Never a database string. */
export function websiteErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof WebsiteRpcError) return t(`websiteEditor.errors.rpc.${error.code}`);
  if (error instanceof ImageUploadError) return t(`websiteEditor.image.errors.${error.problem}`);
  return t('websiteEditor.errors.generic');
}
