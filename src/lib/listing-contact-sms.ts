import type { MockProperty } from "@/data/types";
import { managerContactSmsPhoneForPublicCta } from "@/lib/claw-leasing-links";

/** Attach manager Twilio work number so listing CTAs match the public browse page. */
export function withListingContactSmsPhone(
  property: MockProperty,
  contactSmsPhone: string | null | undefined,
): MockProperty {
  const phone = managerContactSmsPhoneForPublicCta(contactSmsPhone);
  if (!phone) return property;
  if (property.contactSmsPhone?.trim() === phone) return property;
  return { ...property, contactSmsPhone: phone };
}

export function isLiveListingIdForContactSms(listingId: string | null | undefined): boolean {
  const id = listingId?.trim() ?? "";
  return Boolean(id && !id.startsWith("preview-") && !id.startsWith("demo-"));
}
