/** Table-shaped mocks; bulk demo lives in `demo-portal.ts`. */
export {
  demoAdminPropertyRows as adminPropertyRows,
  demoApplicantRows as applicantRows,
  demoInboxPreviewRows as inboxPreviewRows,
  demoPaymentRows as paymentRows,
  demoWorkOrderRows as workOrderRows,
} from "./demo-portal";

export const announcementRows = [
  {
    title: "Spring HVAC filter swap",
    audience: "All residents",
    posted: "Apr 12",
    status: "Sent",
  },
  {
    title: "Parking stall reassignment (May)",
    audience: "Ballard properties",
    posted: "Apr 9",
    status: "Scheduled",
  },
];
