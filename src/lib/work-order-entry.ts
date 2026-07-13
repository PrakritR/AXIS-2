export const ENTRY_PERMISSION_OPTIONS: { value: "allowed" | "call_first" | "resident_present"; label: string }[] = [
  { value: "allowed", label: "Yes, they can enter" },
  { value: "call_first", label: "Call me first" },
  { value: "resident_present", label: "No - I'll be home" },
];

export function entryPermissionLabel(value: string | undefined): string {
  return ENTRY_PERMISSION_OPTIONS.find((option) => option.value === value)?.label ?? "Call me first";
}
