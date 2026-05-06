"use client";

export interface JobFilterState {
  field: string;
  level: string;
  remote_type: string;
  salary_min: string;
  quality_min: string;
}

export const EMPTY_FILTERS: JobFilterState = {
  field: "", level: "", remote_type: "", salary_min: "", quality_min: "",
};

const FIELDS = ["Engineering", "Data", "Design", "Product", "Marketing", "Sales", "Operations", "Finance", "Other"];
const LEVELS = ["intern", "entry", "mid", "senior", "staff", "principal"];
const REMOTE = ["remote", "hybrid", "onsite"];

export function JobFilters({
  value, onChange,
}: {
  value: JobFilterState;
  onChange: (v: JobFilterState) => void;
}) {
  function set<K extends keyof JobFilterState>(k: K, v: string) {
    onChange({ ...value, [k]: v });
  }
  function clear() { onChange(EMPTY_FILTERS); }

  return (
    <aside className="bg-white border border-[var(--color-border)] rounded-lg p-4 space-y-4 sticky top-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Filters</h2>
        <button onClick={clear} className="text-xs text-[var(--color-brand)] hover:underline">
          Clear
        </button>
      </div>

      <Field label="Field">
        <select value={value.field} onChange={(e) => set("field", e.target.value)} className={selectCls}>
          <option value="">All fields</option>
          {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>

      <Field label="Seniority">
        <select value={value.level} onChange={(e) => set("level", e.target.value)} className={selectCls}>
          <option value="">Any</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </Field>

      <Field label="Remote">
        <select value={value.remote_type} onChange={(e) => set("remote_type", e.target.value)} className={selectCls}>
          <option value="">Any</option>
          {REMOTE.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>

      <Field label="Min base ($k)">
        <input
          type="number" min={0} step={5}
          value={value.salary_min}
          onChange={(e) => set("salary_min", e.target.value)}
          placeholder="e.g. 120"
          className={selectCls}
        />
      </Field>

      <Field label="Min quality (0-100)">
        <input
          type="number" min={0} max={100}
          value={value.quality_min}
          onChange={(e) => set("quality_min", e.target.value)}
          placeholder="e.g. 60"
          className={selectCls}
        />
      </Field>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-[var(--color-ink-soft)] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

const selectCls = "w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-sm bg-white";
