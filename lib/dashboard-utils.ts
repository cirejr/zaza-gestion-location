export function formatCfa(value: number | string) {
  const amount = typeof value === "string" ? Number(value) : value;
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
