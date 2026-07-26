import { describe, expect, it } from "vitest";

import {
  bankSenderIsAllowed,
  extractReceiptPayerName,
  parsePaymentReceiptEmail,
  parseResidentReceiptContext,
  parseWorkOrderPaymentReceiptEmail,
} from "@/lib/payment-receipt-email/parse-receipt";
import {
  extractPaymentInboxToken,
  paymentInboxAddress,
} from "@/lib/payment-receipt-email/payment-inbox";

describe("payment inbox addressing", () => {
  it("builds payments+token addresses", () => {
    expect(paymentInboxAddress("abc123token")).toMatch(/^payments\+abc123token@/);
  });

  it("extracts token from plus addressing", () => {
    expect(
      extractPaymentInboxToken(["payments+mytoken12@prop-lane.space", "other@example.com"]),
    ).toBe("mytoken12");
  });

  it("ignores non-payment local parts", () => {
    expect(extractPaymentInboxToken(["support@prop-lane.space"])).toBeNull();
  });
});

describe("parsePaymentReceiptEmail", () => {
  it("parses a Venmo receipt with PL- reference", () => {
    const parsed = parsePaymentReceiptEmail({
      fromEmail: "notify@venmo.com",
      subject: "You paid Alex $150.00",
      body: "Memo: PL-ABC123 for rent",
    });
    expect(parsed).toEqual({
      channel: "venmo",
      amountCents: 15000,
      paymentReference: "PL-ABC123",
      referenceKind: "resident_charge",
    });
  });

  it("parses a Zelle receipt", () => {
    const parsed = parsePaymentReceiptEmail({
      fromEmail: "noreply@zellepay.com",
      subject: "You sent $75.50 with Zelle",
      body: "Message: PL-Z9X8Y7",
    });
    expect(parsed).toEqual({
      channel: "zelle",
      amountCents: 7550,
      paymentReference: "PL-Z9X8Y7",
      referenceKind: "resident_charge",
    });
  });

  it("rejects messages without a PL- code", () => {
    expect(
      parsePaymentReceiptEmail({
        fromEmail: "notify@venmo.com",
        subject: "You paid $50.00",
        body: "Thanks!",
      }),
    ).toBeNull();
  });

  it("rejects untrusted senders without channel hints", () => {
    expect(
      parsePaymentReceiptEmail({
        fromEmail: "spam@evil.com",
        subject: "You paid $50.00",
        body: "PL-ABC123",
      }),
    ).toBeNull();
  });
});

describe("extractReceiptPayerName", () => {
  it("pulls the payer from a Venmo 'X paid you' subject", () => {
    expect(extractReceiptPayerName("Junaid Mohammed paid you $50.00", "")).toBe("Junaid Mohammed");
  });

  it("pulls the payer from a 'You received $X from Y' line", () => {
    expect(
      extractReceiptPayerName("You received money", "You received $50.00 from Junaid Mohammed with Zelle"),
    ).toBe("Junaid Mohammed");
  });

  it("returns null when no payer can be isolated", () => {
    expect(extractReceiptPayerName("Payment received", "Thanks for your payment")).toBeNull();
  });
});

describe("parseResidentReceiptContext — reference-less real receipts", () => {
  it("parses the captain's real Venmo receipt (no PL- code)", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "venmo@venmo.com",
      subject: "Junaid Mohammed paid you $50.00",
      body: "Junaid Mohammed paid you $50.00\nApplication fee for room 5 at 5257 Brooklyn avenue",
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.channel).toBe("venmo");
    expect(ctx?.amountCents).toBe(5000);
    expect(ctx?.paymentReference).toBeNull();
    expect(ctx?.payerName).toBe("Junaid Mohammed");
    expect(ctx?.memoText).toContain("5257 Brooklyn avenue");
  });

  it("still captures the PL- code when the resident included one", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "venmo@venmo.com",
      subject: "Jane Doe paid you $150.00",
      body: "Memo: PL-ABC123",
    });
    expect(ctx?.paymentReference).toBe("PL-ABC123");
    expect(ctx?.amountCents).toBe(15000);
  });

  it("rejects an untrusted sender even with an amount", () => {
    expect(
      parseResidentReceiptContext({
        fromEmail: "spam@evil.com",
        subject: "You got paid $50.00",
        body: "5257 Brooklyn avenue",
      }),
    ).toBeNull();
  });
});

describe("parseResidentReceiptContext — direction guard (money must have been RECEIVED)", () => {
  it("rejects a Venmo payment REQUEST from a trusted sender", () => {
    expect(
      parseResidentReceiptContext({
        fromEmail: "venmo@venmo.com",
        subject: "Junaid Mohammed requests $50.00",
        body: "Junaid Mohammed requests $50.00\nApplication fee for room 5 at 5257 Brooklyn avenue",
      }),
    ).toBeNull();
  });

  it("rejects a Zelle payment-request phrasing that mimics 'received … from'", () => {
    expect(
      parseResidentReceiptContext({
        fromEmail: "noreply@zellepay.com",
        subject: "You have received a payment request",
        body: "You have received a payment request from Junaid Mohammed for $50.00\n5257 Brooklyn avenue",
      }),
    ).toBeNull();
  });

  it("rejects an OUTBOUND 'You paid' send even when the memo names the property", () => {
    expect(
      parseResidentReceiptContext({
        fromEmail: "venmo@venmo.com",
        subject: "You paid Junaid Mohammed $50.00",
        body: "You paid Junaid Mohammed $50.00\nRefund — Application fee at 5257 Brooklyn avenue",
      }),
    ).toBeNull();
  });

  it("rejects an outbound send, request reminder, and statement even with a PL- code", () => {
    for (const email of [
      { subject: "You sent $50.00 with Zelle", body: "Memo: PL-ABC123" },
      { subject: "Reminder: Junaid Mohammed requests $50.00", body: "PL-ABC123" },
      { subject: "Your Venmo statement", body: "Junaid Mohammed paid you $50.00 · statement · PL-ABC123" },
    ]) {
      expect(parseResidentReceiptContext({ fromEmail: "venmo@venmo.com", ...email })).toBeNull();
    }
  });

  it("still accepts a genuine receipt whose BODY contains reject-word boilerplate", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "venmo@venmo.com",
      subject: "Junaid Mohammed paid you $50.00",
      body: [
        "Junaid Mohammed paid you $50.00",
        "Application fee for room 5 at 5257 Brooklyn avenue",
        "If you did not request this transfer, contact us.",
        "View your statement online.",
        "Send and request money with Venmo.",
      ].join("\n"),
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.amountCents).toBe(5000);
    expect(ctx?.payerName).toBe("Junaid Mohammed");
  });

  it("accepts a Venmo 'X paid you' receipt", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "venmo@venmo.com",
      subject: "Junaid Mohammed paid you $50.00",
      body: "Junaid Mohammed paid you $50.00\nApplication fee for room 5 at 5257 Brooklyn avenue",
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.channel).toBe("venmo");
    expect(ctx?.payerName).toBe("Junaid Mohammed");
  });

  it("accepts Wells Fargo's \"You've received money with Zelle®\" from an allow-listed bank sender", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "alerts@notify.wellsfargo.com",
      subject: "You've received money with Zelle®",
      body: "You've received $500.00 from Junaid Mohammed with Zelle\nRent for 5257 Brooklyn Avenue",
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.channel).toBe("zelle");
    expect(ctx?.amountCents).toBe(50000);
    expect(ctx?.payerName).toBe("Junaid Mohammed");
  });

  it("accepts the 'you have received' contraction-free bank phrasing", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "no.reply.alerts@chase.com",
      subject: "You have received money with Zelle®",
      body: "You have received $50.00 from JUNAID MOHAMMED\nZelle payment for 5257 Brooklyn avenue",
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.channel).toBe("zelle");
    expect(ctx?.amountCents).toBe(5000);
  });

  it("accepts a 'You received $X from Y' Zelle receipt", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "noreply@zellepay.com",
      subject: "You received $50.00 from Junaid Mohammed",
      body: "You received $50.00 from Junaid Mohammed\nApplication fee for room 5 at 5257 Brooklyn avenue",
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.channel).toBe("zelle");
    expect(ctx?.payerName).toBe("Junaid Mohammed");
  });

  it("accepts a Venmo request COMPLETION — 'X paid your $50.00 request' is money received", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "venmo@venmo.com",
      subject: "Junaid Mohammed paid your $50.00 request",
      body: "Junaid Mohammed paid your $50.00 request\nApplication fee for room 5 at 5257 Brooklyn avenue",
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.amountCents).toBe(5000);
    expect(ctx?.payerName).toBe("Junaid Mohammed");
  });

  it("accepts a 'X completed your request' completion notice", () => {
    const ctx = parseResidentReceiptContext({
      fromEmail: "venmo@venmo.com",
      subject: "Junaid Mohammed completed your request",
      body: "Junaid Mohammed completed your request for $50.00\nApplication fee for room 5 at 5257 Brooklyn avenue",
    });
    expect(ctx).not.toBeNull();
    expect(ctx?.amountCents).toBe(5000);
    expect(ctx?.payerName).toBe("Junaid Mohammed");
  });

  it("does not accept an email whose only inbound phrasing is buried deep in the footer", () => {
    const filler = "Lorem ipsum dolor sit amet. ".repeat(120);
    expect(
      parseResidentReceiptContext({
        fromEmail: "venmo@venmo.com",
        subject: "News from Venmo — $50.00 offers inside",
        body: `${filler}\nA friend paid you before? Invite more friends!`,
      }),
    ).toBeNull();
  });
});

describe("bankSenderIsAllowed — hostname match, never substring (money-path auth)", () => {
  it("accepts an exact allowed bank domain", () => {
    expect(bankSenderIsAllowed("chase.com")).toBe(true);
    expect(bankSenderIsAllowed("alerts@chase.com")).toBe(true);
  });

  it("accepts a true subdomain of an allowed bank domain", () => {
    expect(bankSenderIsAllowed("secure.chase.com")).toBe(true);
    expect(bankSenderIsAllowed("noreply@email.bankofamerica.com")).toBe(true);
  });

  it("rejects a lookalike host that only prefixes the bank domain", () => {
    expect(bankSenderIsAllowed("chase.com.attacker.example")).toBe(false);
    expect(bankSenderIsAllowed("statements@chase.com.attacker.example")).toBe(false);
  });

  it("rejects a URL that merely mentions the bank domain in its path/query", () => {
    expect(bankSenderIsAllowed("attacker.example/?redirect=chase.com")).toBe(false);
    expect(bankSenderIsAllowed("https://attacker.example/chase.com")).toBe(false);
  });

  it("rejects an email whose real domain is not a bank domain", () => {
    expect(bankSenderIsAllowed("chase.com@attacker.example")).toBe(false);
    expect(bankSenderIsAllowed("spam@evil.com")).toBe(false);
  });

  it("rejects hostless / unparseable input rather than falling through to accept", () => {
    expect(bankSenderIsAllowed("")).toBe(false);
    expect(bankSenderIsAllowed("not an email or url")).toBe(false);
  });
});

describe("parsePaymentReceiptEmail — genuine bank-sent Zelle receipt still verifies", () => {
  it("accepts a real Chase Zelle receipt (channel from body, sender host verified)", () => {
    const parsed = parsePaymentReceiptEmail({
      fromEmail: "no.reply.alerts@chase.com",
      subject: "You sent money with Zelle®",
      body: "You sent $200.00 with Zelle. Memo: PL-ABC123",
    });
    expect(parsed).toEqual({
      channel: "zelle",
      amountCents: 20000,
      paymentReference: "PL-ABC123",
      referenceKind: "resident_charge",
    });
  });

  it("rejects a Zelle-looking receipt from a bank lookalike host", () => {
    expect(
      parsePaymentReceiptEmail({
        fromEmail: "alerts@chase.com.attacker.example",
        subject: "You sent money with Zelle®",
        body: "You sent $200.00 with Zelle. Memo: PL-ABC123",
      }),
    ).toBeNull();
  });

  it("parses adversarial comma-repetition input fast (no polynomial backtracking)", () => {
    const body = `You sent with Zelle. Memo: PL-ABC123 ${"$".repeat(1)}${",".repeat(100_000)}`;
    const start = performance.now();
    parsePaymentReceiptEmail({ fromEmail: "no.reply@chase.com", subject: "Zelle", body });
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe("parseWorkOrderPaymentReceiptEmail", () => {
  it("parses a Venmo payout with WO- reference", () => {
    const parsed = parseWorkOrderPaymentReceiptEmail({
      fromEmail: "notify@venmo.com",
      subject: "You received $250.00",
      body: "Note: WO-ABC123",
    });
    expect(parsed).toEqual({
      channel: "venmo",
      amountCents: 25000,
      paymentReference: "WO-ABC123",
      referenceKind: "work_order",
    });
  });

  it("rejects PL- codes for work-order parser", () => {
    expect(
      parseWorkOrderPaymentReceiptEmail({
        fromEmail: "notify@venmo.com",
        subject: "You received $50.00",
        body: "PL-ABC123",
      }),
    ).toBeNull();
  });
});
