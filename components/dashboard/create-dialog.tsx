"use client";

import { AlertCircle, Plus, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export type SelectOption = { value: string; label: string };

export type DialogField =
  | { type: "text"; name: string; label: string; placeholder?: string; required?: boolean }
  | { type: "number"; name: string; label: string; placeholder?: string; min?: number; step?: string; required?: boolean }
  | { type: "date"; name: string; label: string; required?: boolean }
  | { type: "select"; name: string; label: string; options: SelectOption[]; placeholder?: string; required?: boolean }
  | { type: "upload"; name: string; label: string; accept?: string; required?: boolean; hint?: string };

type Values = Record<string, unknown>;

function fieldIsRequired(field: DialogField) {
  return Boolean(field.required);
}

function buildPayload(fields: DialogField[], values: Values) {
  const payload: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (field.type === "number" && typeof raw === "string") {
      const trimmed = raw.trim();
      // Omit empty optional numbers instead of sending "" (or null): the API
      // schemas use `default(...)` / `nullable().optional()`, which only apply
      // when the field is absent — an empty string fails zod validation.
      if (trimmed === "") continue;
      payload[field.name] = Number(trimmed);
      continue;
    }
    payload[field.name] = raw;
  }
  return payload;
}

/** Upload a file straight to the private uploads bucket via a presigned URL. */
export async function uploadFile(file: File): Promise<string> {
  const contentType = file.type || "application/octet-stream";
  const presigned = await apiFetch<{ data: { key: string; url: string; method: string } }>("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, contentType }),
  });
  const response = await fetch(presigned.data.url, {
    method: presigned.data.method,
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!response.ok) throw new Error("Upload failed.");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/uploads/${presigned.data.key}`;
}

export function CreateDialog({
  triggerLabel,
  title,
  description,
  fields,
  endpoint,
  successMessage,
  transform,
  size = "sm:max-w-lg",
}: {
  triggerLabel?: string;
  title: string;
  description?: string;
  fields: DialogField[];
  endpoint: string | ((payload: Record<string, unknown>) => string);
  successMessage: string;
  transform?: (payload: Record<string, unknown>) => Record<string, unknown>;
  size?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map((field) => [field.name, field.type === "select" ? "" : ""])),
  );
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  function setValue(name: string, value: unknown) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function handleUpload(field: Extract<DialogField, { type: "upload" }>, file: File) {
    setUploadingName(field.name);
    setError(null);
    try {
      const url = await uploadFile(file);
      setValue(field.name, url);
      toast.success("Fichier envoyé.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Impossible d’envoyer le fichier.");
    } finally {
      setUploadingName(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = buildPayload(fields, values);
      const url = typeof endpoint === "function" ? endpoint(payload) : endpoint;
      const finalPayload = transform ? transform(payload) : payload;
      await apiFetch(url, { method: "POST", body: JSON.stringify(finalPayload) });
      toast.success(successMessage);
      setOpen(false);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus data-icon="inline-start" />
        {triggerLabel ?? "Ajouter"}
      </DialogTrigger>
      <DialogContent className={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FieldGroup>
            {fields.map((field) => {
              if (field.type === "select") {
                return (
                  <Field key={field.name}>
                    <FieldLabel>{field.label}</FieldLabel>
                    <Select
                      value={typeof values[field.name] === "string" ? (values[field.name] as string) : ""}
                      onValueChange={(value) => setValue(field.name, value)}
                    >
                      <SelectTrigger className="w-full" data-required={fieldIsRequired(field) || undefined}>
                        <SelectValue placeholder={field.placeholder ?? `Choisir ${field.label.toLowerCase()}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {field.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                );
              }
              if (field.type === "upload") {
                const current = typeof values[field.name] === "string" ? (values[field.name] as string) : "";
                return (
                  <Field key={field.name}>
                    <FieldLabel>{field.label}</FieldLabel>
                    <div className="flex items-center gap-2">
                      {current ? (
                        <>
                          <span className="flex h-8 flex-1 items-center gap-2 truncate rounded-lg border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground">
                            <UploadCloud className="size-3.5 shrink-0" />
                            <span className="truncate">{current.replace("/api/uploads/", "")}</span>
                          </span>
                          <Button type="button" variant="outline" size="icon-sm" aria-label="Retirer le fichier" onClick={() => setValue(field.name, "")}>
                            <X />
                          </Button>
                        </>
                      ) : (
                        <label className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                          <UploadCloud className="size-4 text-foreground" />
                          {uploadingName === field.name ? "Envoi en cours…" : "Choisir un fichier"}
                          <input
                            type="file"
                            className="sr-only"
                            accept={field.accept}
                            disabled={uploadingName !== null}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void handleUpload(field, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {field.hint && <FieldDescription>{field.hint}</FieldDescription>}
                  </Field>
                );
              }
              const isNumber = field.type === "number";
              const isDate = field.type === "date";
              return (
                <Field key={field.name}>
                  <FieldLabel>{field.label}</FieldLabel>
                  <Input
                    type={isNumber ? "number" : isDate ? "date" : "text"}
                    required={fieldIsRequired(field)}
                    min={isNumber ? field.min : undefined}
                    step={isNumber ? field.step : undefined}
                    placeholder={"placeholder" in field ? field.placeholder : undefined}
                    value={typeof values[field.name] === "string" ? (values[field.name] as string) : ""}
                    onChange={(event) => setValue(field.name, event.target.value)}
                  />
                </Field>
              );
            })}
          </FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Impossible d’enregistrer</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="submit" disabled={loading || uploadingName !== null} className="w-full sm:w-auto">
              {loading ? (
                <>
                  <Spinner data-icon="inline-start" />Enregistrement…
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}