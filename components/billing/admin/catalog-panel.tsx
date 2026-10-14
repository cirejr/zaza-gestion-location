"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { METHODS, type InstructionRow, type PlanRow } from "./types";

export function CatalogPanel() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [instructions, setInstructions] = useState<InstructionRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [monthly, setMonthly] = useState("");
  const [annual, setAnnual] = useState("");
  const [method, setMethod] = useState("wave");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      const [p, i] = await Promise.all([
        apiFetch<{ data: PlanRow[] }>("/api/admin/billing/plans"),
        apiFetch<{ data: InstructionRow[] }>("/api/admin/billing/instructions"),
      ]);
      setPlans(p.data);
      setInstructions(i.data);
      setLoaded(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Chargement impossible.");
    }
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await apiFetch("/api/admin/billing/plans", {
        method: "POST",
        body: JSON.stringify({ code, name, monthlyPriceXof: Number(monthly), annualPriceXof: Number(annual), features: [], isActive: true }),
      });
      toast.success("Formule enregistrée.");
      setCode(""); setName(""); setMonthly(""); setAnnual("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setWorking(false);
    }
  }

  async function saveInstruction(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    try {
      await apiFetch("/api/admin/billing/instructions", {
        method: "POST",
        body: JSON.stringify({ method, displayName: displayName || null, phoneNumber: phone || null, instructions: text || null, sortOrder: 0, isActive: true }),
      });
      toast.success("Instruction enregistrée.");
      setDisplayName(""); setPhone(""); setText("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setWorking(false);
    }
  }

  if (!loaded) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Chargement du catalogue…
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Formules tarifaires ({plans.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Les prix affichés aux agences viennent d’ici — jamais du code.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="divide-y text-sm">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <span className="font-medium">{p.name} ({p.code})</span>
                <span>{p.monthlyPriceXof.toLocaleString("fr-FR")} / {p.annualPriceXof.toLocaleString("fr-FR")} FCFA {p.isActive ? "" : "• inactive"}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void savePlan(e)}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel>Code</FieldLabel><Input value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
                <Field><FieldLabel>Nom</FieldLabel><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
                <Field><FieldLabel>Prix mensuel (XOF)</FieldLabel><Input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} required /></Field>
                <Field><FieldLabel>Prix annuel (XOF)</FieldLabel><Input inputMode="numeric" value={annual} onChange={(e) => setAnnual(e.target.value)} required /></Field>
              </div>
              <div><Button type="submit" size="sm" disabled={working}>Enregistrer la formule</Button></div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Instructions de paiement ({instructions.length})</CardTitle>
          <p className="text-sm text-muted-foreground">Numéros destinataires et consignes visibles par les agences.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="divide-y text-sm">
            {instructions.map((i) => (
              <li key={i.id} className="py-2">
                <p className="font-medium">{i.method} — {i.displayName ?? "—"} {i.phoneNumber ? `• ${i.phoneNumber}` : ""}</p>
                {i.instructions && <p className="text-xs text-muted-foreground">{i.instructions}</p>}
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => void saveInstruction(e)}>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Moyen</FieldLabel>
                  <Select value={method} onValueChange={(v) => setMethod(String(v))}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field><FieldLabel>Nom affiché</FieldLabel><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex. Naya — Wave" /></Field>
                <Field><FieldLabel>Téléphone destinataire</FieldLabel><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+221 …" /></Field>
                <Field><FieldLabel>Instructions</FieldLabel><Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment payer…" /></Field>
              </div>
              <div><Button type="submit" size="sm" disabled={working}>Enregistrer l’instruction</Button></div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
