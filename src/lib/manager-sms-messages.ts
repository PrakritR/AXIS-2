/** Client-safe types for manager Communication → SMS. */

export type ManagerSmsMessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  fromPhone: string | null;
  toPhone: string;
  messageSid: string | null;
  source: "work_number" | "relay" | "automated";
  createdAt: string;
};

export type ManagerSmsResidentConversation = {
  residentUserId: string | null;
  residentEmail: string | null;
  name: string;
  phone: string | null;
  propertyLabel: string | null;
  /** Approved resident vs pending applicant for a house. */
  tenancyStatus?: "resident" | "applicant";
  /**
   * Work-number owner for this thread. Own account or linked owner when the
   * viewer is a co-manager with Communication (inbox) access.
   */
  ownerManagerUserId?: string | null;
  messages: ManagerSmsMessageRow[];
};

/** How the Communication → SMS list is ordered (replaces Unopened/Opened/Sent folders). */
export type ManagerSmsSortId = "newest" | "oldest" | "name" | "house";

export type ManagerSmsViewFilter = "all" | "unread";

export const MANAGER_SMS_SORT_OPTIONS: { value: ManagerSmsSortId; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "house", label: "House" },
];

export type ManagerSmsConversationsPayload = {
  workNumber: string | null;
  personalPhone: string | null;
  phoneVerified: boolean;
  forwardInbound: boolean;
  smsConfigured: boolean;
  residents: ManagerSmsResidentConversation[];
};

/** @deprecated Kept for route redirects from old SMS folder URLs. */
export type ManagerSmsBucketId = "unopened" | "opened" | "schedule" | "sent" | "all";

export type RoleSmsConversationPayload = {
  messages: ManagerSmsMessageRow[];
  smsConfigured: boolean;
};

export function normalizeRoleSmsPayload(
  payload: Partial<RoleSmsConversationPayload> | null | undefined,
): RoleSmsConversationPayload {
  return {
    messages: Array.isArray(payload?.messages) ? payload.messages : [],
    smsConfigured: Boolean(payload?.smsConfigured),
  };
}

export function smsMessageBucket(
  message: ManagerSmsMessageRow,
  openedIds: ReadonlySet<string>,
): ManagerSmsBucketId {
  if (message.direction === "outbound") return "sent";
  return openedIds.has(message.id) ? "opened" : "unopened";
}

/** Legacy folder labels — SMS UI now uses All/Unread + sort instead. */
export const MANAGER_SMS_TAB_DEFS: { id: ManagerSmsBucketId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unopened", label: "Unread" },
];

export function normalizeManagerSmsConversationsPayload(
  payload: Partial<ManagerSmsConversationsPayload> | null | undefined,
): ManagerSmsConversationsPayload {
  const residents = Array.isArray(payload?.residents)
    ? payload.residents.map((resident) => ({
        residentUserId: resident?.residentUserId ?? null,
        residentEmail: resident?.residentEmail ?? null,
        name: resident?.name?.trim() || resident?.phone || resident?.residentEmail || "Resident",
        phone: resident?.phone ?? null,
        propertyLabel: resident?.propertyLabel ?? null,
        tenancyStatus: resident?.tenancyStatus === "applicant" ? ("applicant" as const) : ("resident" as const),
        ownerManagerUserId: resident?.ownerManagerUserId ?? null,
        messages: Array.isArray(resident?.messages) ? resident.messages : [],
      }))
    : [];
  return {
    workNumber: payload?.workNumber ?? null,
    personalPhone: payload?.personalPhone ?? null,
    phoneVerified: Boolean(payload?.phoneVerified),
    forwardInbound: payload?.forwardInbound !== false,
    smsConfigured: Boolean(payload?.smsConfigured),
    residents,
  };
}

export function smsThreadHasUnread(
  messages: ManagerSmsMessageRow[],
  openedInboundIds: ReadonlySet<string>,
): boolean {
  return messages.some((m) => m.direction === "inbound" && !openedInboundIds.has(m.id));
}

export function smsThreadBucketForLatestMessage(
  latestMessage: ManagerSmsMessageRow | null | undefined,
  openedInboundIds: ReadonlySet<string>,
): ManagerSmsBucketId | null {
  if (!latestMessage) return null;
  if (latestMessage.direction === "outbound") return "sent";
  return openedInboundIds.has(latestMessage.id) ? "opened" : "unopened";
}

export function sortSmsConversationRows<
  T extends {
    lastMessage: ManagerSmsMessageRow | null;
    resident: Pick<ManagerSmsResidentConversation, "name" | "propertyLabel" | "phone">;
  },
>(rows: T[], sort: ManagerSmsSortId): T[] {
  return [...rows].sort((a, b) => {
    if (sort === "name") {
      return (a.resident.name || "").localeCompare(b.resident.name || "", undefined, {
        sensitivity: "base",
      });
    }
    if (sort === "house") {
      const byHouse = (a.resident.propertyLabel || "\uffff").localeCompare(
        b.resident.propertyLabel || "\uffff",
        undefined,
        { sensitivity: "base" },
      );
      if (byHouse !== 0) return byHouse;
      return (a.resident.name || "").localeCompare(b.resident.name || "", undefined, {
        sensitivity: "base",
      });
    }
    const aTs = a.lastMessage?.createdAt ?? "";
    const bTs = b.lastMessage?.createdAt ?? "";
    if (!aTs && !bTs) {
      return (a.resident.phone || a.resident.name || "").localeCompare(
        b.resident.phone || b.resident.name || "",
      );
    }
    if (!aTs) return 1;
    if (!bTs) return -1;
    return sort === "oldest" ? aTs.localeCompare(bTs) : bTs.localeCompare(aTs);
  });
}

/** @deprecated Prefer {@link sortSmsConversationRows}. */
export function sortSmsRowsByLatestMessage<
  T extends { lastMessage: ManagerSmsMessageRow | null },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aTs = a.lastMessage?.createdAt ?? "";
    const bTs = b.lastMessage?.createdAt ?? "";
    return bTs.localeCompare(aTs);
  });
}
