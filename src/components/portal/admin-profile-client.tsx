import { PortalProfileClient } from "@/components/portal/portal-profile-client";

export function AdminProfileClient({
  fullName,
  email,
  phone,
  adminId,
}: {
  fullName: string;
  email: string;
  phone: string;
  adminId: string;
}) {
  return (
    <PortalProfileClient
      variant="admin"
      initialFullName={fullName}
      initialEmail={email}
      initialPhone={phone}
      idLabel="Admin ID"
      idValue={adminId}
    />
  );
}
