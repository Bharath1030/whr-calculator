"use client";

import React, { useEffect, useState } from "react";

export function Card({
  title,
  children,
  right,
  collapsible = false,
  defaultExpanded = true,
  forceExpanded,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  forceExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (forceExpanded) setIsExpanded(true);
  }, [forceExpanded]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div 
        className={`flex items-start justify-between gap-4 ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1">
          {collapsible && (
            <svg 
              className={`w-5 h-5 text-slate-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        </div>
        {right ? <div onClick={(e) => collapsible && e.stopPropagation()}>{right}</div> : null}
      </div>
      {isExpanded && <div className="mt-4">{children}</div>}
    </section>
  );
}


export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function SliderRow({
  label,
  value,
  setValue,
  min,
  max,
  step,
  unit,
  decimals = 0,
  helper,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  helper?: string;
}) {
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-sm font-semibold text-blue-600">
          {value.toLocaleString(undefined, { maximumFractionDigits: decimals })}
          {unit ? ` ${unit}` : ""}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_140px] items-center gap-3">
        <input
          className="w-full"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
        <input
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      </div>
      {helper ? <div className="mt-2 text-xs text-slate-500 whitespace-normal break-words">{helper}</div> : null}
    </div>
  );
}

export function MetricRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {sub ? (
          <div className="mt-0.5 text-xs text-slate-500 whitespace-normal break-words">{sub}</div>
        ) : null}
      </div>
      <div className="shrink-0 text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}
