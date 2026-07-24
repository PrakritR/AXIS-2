/**
 * Signed reply addresses for outbound portal conversation emails.
 *
 * Every conversation email gets a per-recipient `Reply-To` of the form
 *
 *   reply+<sender uuid hex>.<mac hex>@${RESEND_REPLY_DOMAIN}
 *
 * Both halves are lowercase hex ON PURPOSE: mail software (including our own
 * parseEmailAddress) freely lowercases address local parts, so a case-sensitive
 * encoding would be corrupted in transit.
 *
 * so an emailed reply comes back through Resend Inbound and can be routed into
 * the sender's portal thread. The MAC binds the PAIR (sender user id, recipient
 * email): a leaked address only lets mail be injected into that one thread, as
 * that one counterparty — the counterparty is re-derived from the reply's From
 * and verified against the MAC, and anything that fails verification falls
 * through to the admin support inbox instead of being trusted (or lost).
 *
 * Zero storage: both halves are recomputable, so no schema change and no token
 * table. Key material is RESEND_INBOUND_WEBHOOK_SECRET (already required for
 * inbound to work at all) with a domain-separated HMAC input. The feature is
 * dark until RESEND_REPLY_DOMAIN is set — buildReplyAddress returns null and no
 * token ever validates.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const REPLY_LOCAL_PREFIX = "reply+";
const MAC_INPUT_PREFIX = "email-reply:v1";
const MAC_LENGTH = 16; // hex chars = 64 bits — plenty for this threat model

function replyDomain(): string {
  return process.env.RESEND_REPLY_DOMAIN?.trim().toLowerCase() ?? "";
}

function secretKey(): Buffer | null {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) return null;
  // Svix secrets are `whsec_<base64>`; use the decoded bytes like the
  // signature verifier does.
  return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
}

function uuidToHex(uuid: string): string | null {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? hex : null;
}

function hexToUuid(hex: string): string | null {
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pairMac(key: Buffer, senderUserId: string, recipientEmail: string): string {
  return createHmac("sha256", key)
    .update(`${MAC_INPUT_PREFIX}:${senderUserId.toLowerCase()}:${recipientEmail.trim().toLowerCase()}`, "utf8")
    .digest("hex")
    .slice(0, MAC_LENGTH);
}

/**
 * Reply address for one (sender, recipient) pair, or null when the feature is
 * dark (RESEND_REPLY_DOMAIN / secret unset) or the sender id is not a uuid.
 */
export function buildReplyAddress(senderUserId: string, recipientEmail: string): string | null {
  const domain = replyDomain();
  const key = secretKey();
  if (!domain || !key) return null;
  const encoded = uuidToHex(senderUserId);
  if (!encoded || !recipientEmail.includes("@")) return null;
  const local = `${REPLY_LOCAL_PREFIX}${encoded}.${pairMac(key, senderUserId, recipientEmail)}`;
  if (local.length > 64) return null; // RFC local-part bound; unreachable for uuid ids
  return `${local}@${domain}`;
}

/**
 * Find a valid reply token among an inbound email's To addresses and verify it
 * against the sender's From. Returns the token owner's user id (the portal user
 * whose thread the reply belongs to) or null when nothing verifies — callers
 * fall back to the admin support ingest.
 */
export function parseReplyAddress(
  toEmails: string[],
  fromEmail: string,
): { ownerUserId: string } | null {
  const domain = replyDomain();
  const key = secretKey();
  if (!domain || !key) return null;
  const from = fromEmail.trim().toLowerCase();
  if (!from.includes("@")) return null;

  for (const raw of toEmails) {
    const address = raw.trim().toLowerCase();
    const at = address.lastIndexOf("@");
    if (at <= 0 || address.slice(at + 1) !== domain) continue;
    const local = address.slice(0, at);
    if (!local.startsWith(REPLY_LOCAL_PREFIX)) continue;
    const [encoded, mac] = local.slice(REPLY_LOCAL_PREFIX.length).split(".");
    if (!encoded || !mac || mac.length !== MAC_LENGTH) continue;
    const ownerUserId = hexToUuid(encoded);
    if (!ownerUserId) continue;
    const expected = Buffer.from(pairMac(key, ownerUserId, from), "utf8");
    const provided = Buffer.from(mac, "utf8");
    if (expected.length === provided.length && timingSafeEqual(expected, provided)) {
      return { ownerUserId };
    }
  }
  return null;
}

/**
 * Deterministic synthetic anchor shared by every conversation email for one
 * (sender, recipient) pair, set as References/In-Reply-To so the recipient's
 * mail client groups the back-and-forth without us persisting any Message-ID
 * chain (the GitHub-notifications pattern).
 */
export function conversationAnchorMessageId(
  senderUserId: string,
  recipientEmail: string,
  fromDomain: string,
): string {
  const digest = createHmac("sha256", "pl-anchor")
    .update(`${senderUserId.toLowerCase()}:${recipientEmail.trim().toLowerCase()}`, "utf8")
    .digest("hex")
    .slice(0, 24);
  return `<pl-anchor-${digest}@${fromDomain}>`;
}
