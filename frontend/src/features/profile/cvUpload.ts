import { apiRequest } from '../../lib/api';
import { ApiError } from '../../lib/api-types';

// Shared by the CV page and the Today start card so both show the same checks and messages.
export const uploadMessages: Record<string, string> = {
  scanned_pdf_unsupported: 'errors.scanned_pdf_unsupported', document_encrypted: 'errors.document_encrypted', document_invalid: 'errors.document_invalid', empty_input: 'errors.empty_input',
  document_expansion_limit: 'errors.document_limits', document_too_many_pages: 'errors.document_too_many_pages', extracted_text_limit: 'errors.document_limits', input_size_invalid: 'pages.uploadTooLarge', upload_too_large: 'pages.uploadTooLarge',
  unsupported_input: 'pages.uploadInvalidType', unsupported_media_type: 'pages.uploadInvalidType', document_parse_timeout: 'errors.document_parse_timeout', ocr_unavailable: 'errors.ocr_unavailable', network_error: 'errors.network_error',
};
export const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

/** i18n key of the problem with `file`, or null when it may be uploaded. */
export function cvFileError(file: File): string | null {
  if (file.size > 20 * 1024 * 1024) return 'pages.uploadTooLarge';
  const extension = file.name.split('.').pop()?.toLowerCase();
  return !extension || !['pdf', 'docx', 'txt'].includes(extension) ? 'pages.uploadInvalidType' : null;
}

/** Upload `file` as a CV (or as a new version when `path` is a revisions path). Returns an i18n error key, or null on success. */
export async function uploadCvFile(projectId: string, file: File, path = '/cvs', name?: string): Promise<string | null> {
  const invalid = cvFileError(file);
  if (invalid) return invalid;
  try {
    const body = new FormData(); body.set('file', file); if (name) body.set('name', name);
    await apiRequest(`/projects/${projectId}${path}`, { method: 'POST', body });
    return null;
  } catch (error) { return error instanceof ApiError ? uploadMessages[error.code] ?? 'pages.loadError' : 'pages.loadError'; }
}
