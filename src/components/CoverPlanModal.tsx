"use client";

import { useEffect, useState } from "react";
import { fmt } from "./money";

type Move = {
  from_category_id: string;
  from_name: string;
  to_category_id: string;
  to_name: string;
  amount_dollars: number;
  reason: string;
};

type Plan = {
  generated_at: string;
  summary: string;
  moves: Move[];
  leftover_overspending: Array<{ category: string; amount_dollars: number }>;
};

export function CoverPlanModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: () => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{
    applied: number;
    errors: string[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auto-cover", { method: "POST" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || `${res.status}`);
        setPlan(json.plan);
        setChecked((json.plan.moves as Move[]).map(() => true));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = async () => {
    if (!plan) return;
    const selected = plan.moves.filter((_, i) => checked[i]);
    if (selected.length === 0) {
      onClose();
      return;
    }
    setApplying(true);
    try {
      const res = await fetch("/api/auto-cover/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ moves: selected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `${res.status}`);
      setApplyResult({
        applied: (json.applied ?? []).length,
        errors: (json.errors ?? []).map(
          (e: { error: string; from: string }) => `${e.from}: ${e.error}`,
        ),
      });
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  };

  const selectedTotal =
    plan?.moves.reduce(
      (s, m, i) => s + (checked[i] ? m.amount_dollars : 0),
      0,
    ) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-border-strong bg-panel shadow-[0_24px_80px_-20px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Cover overspending</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto p-4">
          {error && (
            <div className="rounded-md border border-red/40 bg-red/5 p-3 text-sm text-red">
              {error}
            </div>
          )}

          {!plan && !error && (
            <div className="py-12 text-center text-sm text-muted">
              Asking Scott to draft a plan…
            </div>
          )}

          {applyResult && (
            <div className="mb-3 rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
              Applied {applyResult.applied} move
              {applyResult.applied === 1 ? "" : "s"}.
              {applyResult.errors.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-red">
                  {applyResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {plan && (
            <>
              <p className="mb-3 text-sm text-muted">{plan.summary}</p>

              {plan.moves.length === 0 ? (
                <div className="rounded-md border border-border bg-panel-2 p-4 text-sm text-muted">
                  Nothing to cover.
                </div>
              ) : (
                <ul className="space-y-2">
                  {plan.moves.map((m, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-md border border-border bg-panel-2 p-3"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked[i] ?? false}
                        onChange={(e) =>
                          setChecked((prev) => {
                            const next = [...prev];
                            next[i] = e.target.checked;
                            return next;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                          <span className="text-muted">{m.from_name}</span>
                          <span className="text-muted">→</span>
                          <span className="font-medium">{m.to_name}</span>
                          <span className="ml-auto font-medium text-accent">
                            {fmt(m.amount_dollars)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {m.reason}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {plan.leftover_overspending.length > 0 && (
                <div className="mt-4 rounded-md border border-red/40 bg-red/5 p-3 text-xs">
                  <div className="mb-1 font-medium text-red">
                    Still overspent after this plan:
                  </div>
                  <ul className="space-y-0.5 text-muted">
                    {plan.leftover_overspending.map((l, i) => (
                      <li key={i}>
                        {l.category}: {fmt(l.amount_dollars)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border bg-panel-2 px-4 py-3 text-sm">
          <div className="text-muted">
            {plan && plan.moves.length > 0
              ? `${checked.filter(Boolean).length} of ${plan.moves.length} selected · ${fmt(selectedTotal)}`
              : ""}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border bg-panel px-3 py-1.5 text-xs hover:bg-panel-2"
            >
              Close
            </button>
            {plan && plan.moves.length > 0 && !applyResult && (
              <button
                onClick={apply}
                disabled={applying || checked.every((c) => !c)}
                className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {applying ? "Applying…" : "Apply selected"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
