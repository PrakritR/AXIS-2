/** Whether a failed vendor documents list fetch should surface a toast (vs. silent empty state). */
export function shouldNotifyVendorDocumentsLoadFailure(httpStatus: number): boolean {
  return httpStatus !== 401 && httpStatus !== 403;
}
