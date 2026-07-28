export function mapProviderStatusToErrorCategory(status: number) {
  if (status >= 500) {
    return "infrastructure"
  }

  if (status === 400) {
    return "validation"
  }

  return "business"
}
