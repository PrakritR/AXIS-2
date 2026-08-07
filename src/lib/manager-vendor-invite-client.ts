import type {
  NotificationConfirmDraft,
  NotificationDeliveryChannels,
} from "@/components/portal/portal-notification-preview-modal";
import { deliverPortalInboxMessage } from "@/lib/portal-message-delivery";

export type ManagerVendorInvitePreview = {
  vendorId: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  body: string;
};

export async function fetchManagerVendorInviteDraft(input: {
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
}): Promise<{ ok: true; preview: ManagerVendorInvitePreview } | { ok: false; error: string }> {
  const email = input.vendorEmail.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(email)) {
    return { ok: false, error: "A valid email is required to preview the vendor portal invite." };
  }
  try {
    const res = await fetch("/api/portal/vendor-invite-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        vendorId: input.vendorId,
        vendorName: input.vendorName,
        vendorEmail: email,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      subject?: string;
      body?: string;
      error?: string;
    };
    if (!res.ok || !data.subject?.trim() || !data.body?.trim()) {
      return { ok: false, error: data.error ?? "Could not prepare the vendor onboarding message." };
    }
    return {
      ok: true,
      preview: {
        vendorId: input.vendorId,
        name: input.vendorName,
        email,
        phone: "",
        subject: data.subject,
        body: data.body,
      },
    };
  } catch {
    return { ok: false, error: "Could not prepare the vendor onboarding message." };
  }
}

export async function deliverManagerVendorInvite(
  preview: ManagerVendorInvitePreview,
  skipMessage: boolean,
  channels?: NotificationDeliveryChannels,
  messageDraft?: NotificationConfirmDraft,
): Promise<{ ok: boolean; message: string }> {
  if (skipMessage) {
    return { ok: true, message: "" };
  }

  const subject = messageDraft?.subject?.trim() || preview.subject;
  const body = messageDraft?.body?.trim() || preview.body;
  const viaEmail = channels?.viaEmail !== false;
  const viaSms = channels?.viaSms === true;

  if (messageDraft?.scheduleAt) {
    const response = await fetch("/api/portal/scheduled-inbox-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        subject,
        body,
        sendAt: messageDraft.scheduleAt,
        deliverViaEmail: viaEmail,
        deliverViaSms: viaSms,
        recipientEmail: preview.email,
        recipientName: preview.name.trim(),
        senderPortal: "manager",
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, message: data.error ?? "The invite could not be scheduled." };
    }
    return { ok: true, message: `Portal invite scheduled for ${preview.email}.` };
  }

  const notice = await deliverPortalInboxMessage({
    eventCategory: "messages",
    toEmails: [preview.email],
    subject,
    text: body,
    deliverViaEmail: viaEmail,
    deliverViaSms: viaSms,
  });
  if (notice.ok) {
    return {
      ok: true,
      message: notice.skipped
        ? `Invite saved to PropLane inbox for ${preview.email}.`
        : `Portal invite sent to ${preview.email}.`,
    };
  }
  return {
    ok: false,
    message: notice.error ? `Invite failed: ${notice.error}` : "The invite could not be sent.",
  };
}
