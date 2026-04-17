"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { PillTabs } from "@/components/ui/tabs";
import { useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";

export default function PartnerContactPage() {
  const { showToast } = useAppUi();
  const [mode, setMode] = useState<"meet" | "message">("message");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Partner contact</h1>
      <p className="mt-2 text-sm text-muted">For owners and operators exploring Axis.</p>

      <Card className="mt-8 p-6">
        <CardHeader title="Connect with Axis team" />
        <div className="mt-4">
          <PillTabs
            items={[
              { id: "meet", label: "Schedule meeting" },
              { id: "message", label: "Send message" },
            ]}
            activeId={mode}
            onChange={(id) => setMode(id as "meet" | "message")}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="pname">
              Name *
            </label>
            <Input id="pname" className="mt-2" placeholder="Jane Smith" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="pemail">
              Email *
            </label>
            <Input id="pemail" className="mt-2" placeholder="jane@company.com" />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-muted" htmlFor="ptopic">
            Topic
          </label>
          <Select id="ptopic" className="mt-2">
            <option>Select…</option>
            <option>Pricing</option>
            <option>Onboarding</option>
            <option>Integrations</option>
          </Select>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-muted" htmlFor="pmsg">
            Message *
          </label>
          <Textarea id="pmsg" className="mt-2" placeholder="What can we help you with?" />
        </div>

        <Button
          type="button"
          className="mt-6 w-full"
          variant="secondary"
          onClick={() => showToast("Partner message sent (demo)")}
        >
          Send message
        </Button>
      </Card>
    </div>
  );
}
