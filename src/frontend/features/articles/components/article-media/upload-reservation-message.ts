export function uploadReservationMessage(code: string) {
  if (code === "rate_limited")
    return "Too many upload attempts. Wait a minute, then retry the same file.";
  if (code === "forbidden" || code === "not_found")
    return "This article is no longer available for image uploads. Reload the article to check your access.";
  return "Image upload could not start. Retry the same file.";
}
