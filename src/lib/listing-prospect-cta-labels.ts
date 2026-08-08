/** Shared renter CTA copy on public listing surfaces (browsers, modals, sidebars). */

export function listingApplyLabel(textEnabled: boolean): string {
  return textEnabled ? "Text to apply" : "Apply online";
}

export function listingMessageLabel(textEnabled: boolean): string {
  return textEnabled ? "Text a message" : "Send message";
}
