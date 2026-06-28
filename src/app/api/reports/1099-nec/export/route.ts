import { NextResponse } from "next/server";
import { assertManagerFinancialsAccess, getReportsAuthContext } from "@/lib/reports/auth";
import { build1099NecPdf } from "@/lib/reports/export/form-1099-nec";
import { evaluateVendorTaxProfile } from "@/lib/reports/queries";
import { decryptTin } from "@/lib/reports/tin-crypto";

export const runtime = "nodejs";

async function vendorYearTotal(
  db: ReturnType<typeof import("@/lib/supabase/service").createSupabaseServiceRoleClient>,
  managerUserId: string,
  vendorId: string,
  taxYear: number,
): Promise<number> {
  const { data } = await db
    .from("manager_expense_entries")
    .select("amount_cents")
    .eq("manager_user_id", managerUserId)
    .eq("vendor_id", vendorId)
    .gte("expense_date", `${taxYear}-01-01`)
    .lte("expense_date", `${taxYear}-12-31`);

  return (data ?? []).reduce((sum, row) => sum + Number(row.amount_cents), 0);
}

export async function GET(req: Request) {
  try {
    const auth = await getReportsAuthContext();
    if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const gate = await assertManagerFinancialsAccess(auth);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { searchParams } = new URL(req.url);
    const vendorId = searchParams.get("vendorId")?.trim();
    const taxYear = Number(searchParams.get("taxYear") ?? new Date().getFullYear() - 1);
    const downloadAll = searchParams.get("all") === "1";

    const [{ data: managerProfile }, { data: managerTax }] = await Promise.all([
      auth.db.from("profiles").select("full_name, email").eq("id", auth.userId).maybeSingle(),
      auth.db.from("manager_tax_profiles").select("*").eq("manager_user_id", auth.userId).maybeSingle(),
    ]);

    if (!managerTax?.tin_ciphertext || !managerTax.legal_name?.trim()) {
      return NextResponse.json(
        { error: "Complete your payer tax profile (legal name and EIN/SSN) before generating 1099 forms." },
        { status: 400 },
      );
    }

    const payer = {
      name: managerTax.legal_name.trim(),
      addressLine1: managerTax.address_line1?.trim() || "",
      addressLine2: managerTax.address_line2?.trim() || undefined,
      city: managerTax.city?.trim() || "",
      state: managerTax.state?.trim() || "",
      zip: managerTax.zip?.trim() || "",
      tin: decryptTin(managerTax.tin_ciphertext),
      tinType: (managerTax.tin_type as "ein" | "ssn") ?? "ein",
    };

    if (downloadAll) {
      const { data: expenses } = await auth.db
        .from("manager_expense_entries")
        .select("vendor_id, amount_cents")
        .eq("manager_user_id", auth.userId)
        .gte("expense_date", `${taxYear}-01-01`)
        .lte("expense_date", `${taxYear}-12-31`)
        .not("vendor_id", "is", null);

      const totals = new Map<string, number>();
      for (const e of expenses ?? []) {
        const vid = String(e.vendor_id);
        totals.set(vid, (totals.get(vid) ?? 0) + Number(e.amount_cents));
      }

      const qualifying = [...totals.entries()].filter(([, cents]) => cents >= 60_000);
      if (qualifying.length === 0) {
        return NextResponse.json({ error: "No vendors meet the $600 threshold for this year." }, { status: 400 });
      }

      const pdfs: { name: string; bytes: Uint8Array }[] = [];
      for (const [vid, totalCents] of qualifying) {
        const { data: vendorTax } = await auth.db
          .from("vendor_tax_profiles")
          .select("*")
          .eq("vendor_id", vid)
          .eq("manager_user_id", auth.userId)
          .maybeSingle();

        const check = evaluateVendorTaxProfile(vendorTax);
        if (!check.complete || !vendorTax?.tin_ciphertext) continue;

        const bytes = await build1099NecPdf({
          taxYear,
          payer,
          recipient: {
            name: vendorTax.legal_name!.trim(),
            addressLine1: vendorTax.address_line1!.trim(),
            addressLine2: vendorTax.address_line2?.trim() || undefined,
            city: vendorTax.city!.trim(),
            state: vendorTax.state!.trim(),
            zip: vendorTax.zip!.trim(),
            tin: decryptTin(vendorTax.tin_ciphertext),
            tinType: (vendorTax.tin_type as "ein" | "ssn") ?? "ein",
          },
          nonemployeeCompensationCents: totalCents,
        });
        pdfs.push({ name: `1099-NEC-${vid}-${taxYear}.pdf`, bytes });
      }

      if (pdfs.length === 0) {
        return NextResponse.json(
          { error: "No vendors with complete W-9 profiles meet the threshold." },
          { status: 400 },
        );
      }

      if (pdfs.length === 1) {
        return new NextResponse(Buffer.from(pdfs[0]!.bytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${pdfs[0]!.name}"`,
          },
        });
      }

      const boundary = `axis1099-${Date.now()}`;
      const parts: Buffer[] = [];
      for (const pdf of pdfs) {
        parts.push(
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${pdf.name}"\r\nContent-Type: application/pdf\r\n\r\n`,
          ),
        );
        parts.push(Buffer.from(pdf.bytes));
        parts.push(Buffer.from("\r\n"));
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));

      return new NextResponse(Buffer.concat(parts), {
        headers: {
          "Content-Type": `multipart/mixed; boundary=${boundary}`,
          "Content-Disposition": `attachment; filename="1099-nec-${taxYear}.multipart"`,
        },
      });
    }

    if (!vendorId) {
      return NextResponse.json({ error: "vendorId required." }, { status: 400 });
    }

    const totalCents = await vendorYearTotal(auth.db, auth.userId, vendorId, taxYear);
    if (totalCents < 60_000) {
      return NextResponse.json({ error: "Vendor does not meet the $600 threshold for this tax year." }, { status: 400 });
    }

    const { data: vendorTax } = await auth.db
      .from("vendor_tax_profiles")
      .select("*")
      .eq("vendor_id", vendorId)
      .eq("manager_user_id", auth.userId)
      .maybeSingle();

    const check = evaluateVendorTaxProfile(vendorTax);
    if (!check.complete || !vendorTax?.tin_ciphertext) {
      return NextResponse.json(
        { error: `Complete W-9 profile first. Missing: ${check.missingFields.join(", ")}` },
        { status: 400 },
      );
    }

    const bytes = await build1099NecPdf({
      taxYear,
      payer,
      recipient: {
        name: vendorTax.legal_name!.trim(),
        addressLine1: vendorTax.address_line1!.trim(),
        addressLine2: vendorTax.address_line2?.trim() || undefined,
        city: vendorTax.city!.trim(),
        state: vendorTax.state!.trim(),
        zip: vendorTax.zip!.trim(),
        tin: decryptTin(vendorTax.tin_ciphertext),
        tinType: (vendorTax.tin_type as "ein" | "ssn") ?? "ein",
      },
      nonemployeeCompensationCents: totalCents,
    });

    void managerProfile;

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="1099-NEC-${vendorId}-${taxYear}.pdf"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to generate 1099.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
