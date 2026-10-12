"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

/** Month selector that writes `?period=YYYY-MM` and refreshes the server view. */
export function PeriodPicker({ period }: { period: string }) {
  const router = useRouter();

  function onChange(value: string) {
    router.push(value ? `?period=${value}` : "?");
    router.refresh();
  }

  return (
    <Input
      type="month"
      value={period}
      onChange={(event) => onChange(event.target.value)}
      className="w-44"
      aria-label="Période comptable"
    />
  );
}
