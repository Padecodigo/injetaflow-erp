import { useState, type FormEvent } from "react";
import { ChevronRight, Loader2, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { MODULES, type FieldDef, type ModuleDef, type ModuleKey } from "@shared/erp/modules";
import { trpc } from "@/lib/trpc";
import { errorMessage } from "../api";
import { Modal, NumberInput } from "./ui";
import { numericError } from "@shared/erp/numbers";

export type RecordRow = Record<string, unknown> & { id: string };

function RefSelect({ field, value, onChange }: { field: FieldDef; value: string; onChange: (value: string) => void }) {
  const ref = field.ref!;
  const options = trpc.records.options.useQuery({ module: ref.module, field: ref.field, labelField: ref.labelField });
  const list = options.data ?? [];
  return (
    <>
      <select name={field.name} required={field.required} value={value} onChange={event => onChange(event.target.value)} disabled={options.isLoading}>
        <option value="">{options.isLoading ? "Carregando..." : list.length ? "Selecione..." : `Nenhum cadastro em ${MODULES[ref.module].label}`}</option>
        {value && !list.some(option => option.value === value) && <option value={value}>{value}</option>}
        {list.map(option => (
          <option key={option.value} value={option.value}>{option.value}{option.label ? ` · ${option.label}` : ""}{option.status ? ` (${option.status})` : ""}</option>
        ))}
      </select>
      {options.error && <small className="erp-field-error">{errorMessage(options.error)}</small>}
    </>
  );
}

export function invalidateModule(utils: ReturnType<typeof trpc.useUtils>, module: ModuleKey) {
  const related: Partial<Record<ModuleKey, ModuleKey[]>> = { producao: ["ordens"], movimentacoes: ["estoque"], estoque: ["movimentacoes"], ordens: ["producao"], colaboradores: ["ponto"] };
  for (const key of [module, ...(related[module] ?? [])]) {
    utils.records.list.invalidate({ module: key });
    utils.records.summary.invalidate({ module: key });
    utils.records.options.invalidate({ module: key });
  }
  utils.dashboard.summary.invalidate();
  utils.rh.invalidate();
}

/** Formulário de criar/editar gerado a partir do catálogo do módulo. */
export function RecordForm({ mod, record, defaults, onClose, onSaved, title }: {
  mod: ModuleDef; record?: RecordRow | null; defaults?: Record<string, string>; onClose: () => void; onSaved?: (row: RecordRow) => void; title?: string;
}) {
  const utils = trpc.useUtils();
  const editing = Boolean(record);
  const fields = mod.fields.filter(field => !field.readOnly);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      const current = record?.[field.name];
      if (current !== undefined && current !== null) initial[field.name] = String(current);
      else if (defaults?.[field.name] !== undefined) initial[field.name] = defaults[field.name];
      else if (field.name === mod.statusField && field.options) initial[field.name] = field.options[0];
      else initial[field.name] = "";
    }
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const create = trpc.records.create.useMutation();
  const update = trpc.records.update.useMutation();
  const busy = create.isPending || update.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    // validação numérica no cliente, com a mesma regra do servidor
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.type !== "number" && field.type !== "money") continue;
      const raw = values[field.name]?.trim() ?? "";
      if (!raw && !field.required) continue;
      const message = raw ? numericError(raw, { label: field.label, integer: field.integer, min: field.min, max: field.max }) : `${field.label}: obrigatório (informe um número).`;
      if (message) errors[field.name] = message;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const message = Object.values(errors).join(" ");
      setError(message);
      toast.error("Confira os campos numéricos", { description: message });
      return;
    }
    const data: Record<string, unknown> = {};
    for (const field of fields) data[field.name] = values[field.name];
    try {
      const saved = (editing
        ? await update.mutateAsync({ module: mod.key, id: record!.id, data })
        : await create.mutateAsync({ module: mod.key, data })) as RecordRow;
      invalidateModule(utils, mod.key);
      const ident = String(saved[mod.autoCode?.field ?? mod.uniqueFields?.[0] ?? mod.searchFields[0]] ?? "");
      toast.dismiss();
      toast.success(editing ? "Alterações salvas" : "Registro criado", { description: `${mod.label}${ident ? ` · ${ident}` : ""}` });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.error(editing ? "Não foi possível salvar" : "Não foi possível criar", { description: message });
    }
  };

  const set = (name: string, value: string) => {
    setValues(current => ({ ...current, [name]: value }));
    setFieldErrors(current => (current[name] ? { ...current, [name]: "" } : current));
  };

  return (
    <Modal wide title={title ?? (editing ? `Editar ${mod.singular}` : mod.createLabel)} eyebrow={mod.label} icon={editing ? <Pencil size={20} /> : <Plus size={21} />} description={editing ? `Altere os dados e salve. ${mod.autoCode && record ? `Código ${String(record[mod.autoCode.field])}.` : ""}` : mod.description} onClose={onClose}>
      <form onSubmit={submit} noValidate={false} aria-label={editing ? `Editar ${mod.singular}` : mod.createLabel}>
        <div className="action-fields erp-form-grid">
          {fields.map(field => (
            <label className={`modal-field ${field.type === "textarea" ? "erp-span-2" : ""}`} key={field.name}>
              <span>{field.label}{field.required ? " *" : ""}</span>
              {field.type === "textarea" ? (
                <textarea name={field.name} rows={3} required={field.required} placeholder={field.placeholder} value={values[field.name]} onChange={event => set(field.name, event.target.value)} />
              ) : field.type === "select" ? (
                <select name={field.name} required={field.required} value={values[field.name]} onChange={event => set(field.name, event.target.value)}>
                  <option value="">Selecione...</option>
                  {field.options?.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === "ref" ? (
                <RefSelect field={field} value={values[field.name]} onChange={value => set(field.name, value)} />
              ) : field.type === "number" || field.type === "money" ? (
                <NumberInput
                  name={field.name}
                  integer={field.integer}
                  min={field.min ?? 0}
                  max={field.max}
                  step={field.type === "money" ? "0.01" : undefined}
                  required={field.required}
                  placeholder={field.placeholder ?? (field.integer ? "Somente números" : "0")}
                  aria-invalid={Boolean(fieldErrors[field.name])}
                  value={values[field.name]}
                  onChange={value => set(field.name, value)}
                />
              ) : (
                <input
                  name={field.name}
                  type={field.type === "email" ? "email" : field.type === "date" ? "date" : "text"}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={values[field.name]}
                  onChange={event => set(field.name, event.target.value)}
                />
              )}
              {fieldErrors[field.name] && <small className="erp-field-error" role="alert">{fieldErrors[field.name]}</small>}
            </label>
          ))}
        </div>
        {error && <div className="erp-form-error" role="alert">{error}</div>}
        <div className="erp-modal-actions">
          <button type="button" className="button button--secondary" onClick={onClose}>Cancelar</button>
          <button className="button button--primary" type="submit" disabled={busy}>
            {busy ? <Loader2 size={15} className="erp-spin" /> : null}
            {editing ? "Salvar alterações" : "Salvar"} <ChevronRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
