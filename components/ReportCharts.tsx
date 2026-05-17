type DonutProps = {
  value: number | null;
  label: string;
  size?: number;
};

export function DonutChart({ value, label, size = 96 }: DonutProps) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color =
    v >= 75 ? "#34d399" : v >= 50 ? "#fbbf24" : v >= 25 ? "#fb923c" : "#f87171";
  const bg = `conic-gradient(${color} ${v * 3.6}deg, #1e293b 0)`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative rounded-full"
        style={{
          width: size,
          height: size,
          background: bg,
        }}
      >
        <div
          className="absolute inset-[14%] flex items-center justify-center rounded-full bg-surface-raised text-lg font-semibold text-white"
        >
          {value == null ? "—" : v}
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">{label}</p>
    </div>
  );
}

export function ProgressBar({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color =
    v >= 75 ? "bg-emerald-500" : v >= 50 ? "bg-amber-400" : "bg-orange-500";

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{value == null ? "—" : `${v}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-border">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function StatusBadge({
  status,
}: {
  status: "Good" | "Warning" | "Critical";
}) {
  const styles = {
    Good: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    Warning: "border-amber-500/40 bg-amber-500/15 text-amber-200",
    Critical: "border-red-500/40 bg-red-500/15 text-red-200",
  };
  const labels = { Good: "양호", Warning: "주의", Critical: "심각" };
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}
