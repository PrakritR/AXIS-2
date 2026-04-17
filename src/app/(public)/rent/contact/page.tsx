"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/input";
import { PillTabs } from "@/components/ui/tabs";
import { useState } from "react";
import { useAppUi } from "@/components/providers/app-ui-provider";

export default function RentContactPage() {
  const { showToast } = useAppUi();
  const [mode, setMode] = useState<"meet" | "message">("message");

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Contact Axis (renters)</h1>
      <p className="mt-2 text-sm text-muted">This mirrors a SaaS-style contact card.</p>

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
            <label className="text-xs font-semibold text-muted" htmlFor="name">
              Name *
            </label>
            <Input id="name" className="mt-2" placeholder="Jane Smith" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted" htmlFor="email">
              Email *
            </label>
            <Input id="email" className="mt-2" placeholder="jane@email.com" />
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-muted" htmlFor="topic">
            Topic
          </label>
          <Select id="topic" className="mt-2">
            <option>Select…</option>
            <option>Listing question</option>
            <option>Application help</option>
            <option>Maintenance</option>
          </Select>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-muted" htmlFor="msg">
            Message *
          </label>
          <Textarea id="msg" className="mt-2" placeholder="What can we help you with?" />
        </div>

        <Button
          type="button"
          className="mt-6 w-full"
          variant="secondary"
          onClick={() => showToast("Message sent (demo) — no email delivered")}
        >
          Send message
        </Button>
      </Card>
    </div>
  );
}
