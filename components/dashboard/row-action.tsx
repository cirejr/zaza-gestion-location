"use client";

import { Link2, Pencil, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  link2: Link2,
  send: Send,
  trash: Trash2,
  pencil: Pencil,
};

export function RowAction({
  endpoint,
  method = "POST",
  body,
  label,
  icon,
  variant = "ghost",
  size = "icon-sm",
  successMessage = "Action effectuée.",
  confirm,
  confirmTitle,
  disabled,
}: {
  endpoint: string;
  method?: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  label: string;
  icon?: string;
  variant?: "ghost" | "outline" | "secondary" | "default" | "destructive";
  size?: "sm" | "icon-sm" | "icon" | "lg" | "default";
  successMessage?: string;
  confirm?: boolean;
  confirmTitle?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const Icon = icon ? ICONS[icon] : undefined;

  async function run() {
    if (confirm && !window.confirm(confirmTitle ?? `Confirmer : ${label.toLowerCase()} ?`)) return;
    setLoading(true);
    try {
      await apiFetch(endpoint, { method, body: body == null ? undefined : JSON.stringify(body) });
      toast.success(successMessage);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} size={size} aria-label={label} title={label} disabled={disabled ?? loading} onClick={() => void run()}>
      {loading ? <Spinner /> : Icon ? <Icon /> : label}
    </Button>
  );
}