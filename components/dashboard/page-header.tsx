import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <Button onClick={onClick}><Plus data-icon="inline-start" />{children}</Button>;
}
