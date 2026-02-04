"use client";

import React, { useMemo, useState } from "react";

type Offtake =
  | "hotWater"
  | "districtHeat"
  | "waterTreatmentFO"
  | "atmosphericWater"
  | "greenhouses"
  | "foodBrewery"
  | "dac";

const OFFTAKE_LABEL: Record<Offtake, string> = {
  hotWater: "Hot water (baseline equivalence)",
  districtHeat: "District heat / heated homes",
  waterTreatmentFO: "Water treatment (FO / Trevi)",
  atmosphericWater: "Atmospheric water capture (AWH / Uravu)",
  greenhouses: "Greenhouses & agriculture",
  foodBrewery: "Food & brewery industry",
  dac: "Direct Air Capture (DAC)",
};

type Range = { min: number; max: number };

// --------------------
// Constants
// --------------------
const MWH_PER_MW_YEAR = 8760;

const MJ_PER_MWH = 3600;
const MJ_PER_M3_PER_C = 4.186;

const L_PER_M3 = 1000;
const GAL_TO_M3 = 0.00378541;

// DAC constants (at-scale)
const DAC_TCO2_PER_MW_YEAR = 4550; // tCO2 per MW·yr 
const DAC_WATER_M3_PER_TCO2 = 1.6; // m3 per tCO2 [1](https://www.w3tutorials.net/blog/tailwindcss-not-working-with-next-js-what-is-wrong-with-the-configuration/)
const DAC_RELEASE_TEMP_C = 65; // heating step around ~65°C 

// Trevi FO throughput (range given in internal planning; mid used as baseline)
const TREVI_L_PER_MW_YEAR_RANGE = { min: 255_000_000, max: 365_000_000 };
const TREVI_M3_PER_MW_YEAR_MID =
  (TREVI_L_PER_MW_YEAR_RANGE.min + TREVI_L_PER_MW_YEAR_RANGE.max) / 2 / L_PER_M3;

// Uravu AWH throughput (range given in internal planning; mid used as baseline)
const URAVU_L_PER_MW_YEAR_RANGE = { min: 2_000_000, max: 15_000_000 };
const URAVU_M3_PER_MW_YEAR_MID =
  (URAVU_L_PER_MW_YEAR_RANGE.min + URAVU_L_PER_MW_YEAR_RANGE.max) / 2 / L_PER_M3;

// Greenhouse default energy intensity
const GREENHOUSE_MWH_PER_HA_YEAR_DEFAULT = 4500;

// District heat conversion baseline
const DEFAULT_MWH_PER_HOME_YEAR = 14.5;

// Greenhouses CO2 avoided range (kt/MW·yr)
const GREENHOUSE_CO2_KT_PER_MWYR_RANGE: Range = { min: 0.26, max: 0.78 }; // [6](https://outlook.office365.com/owa/?ItemID=AAMkADY1MTUxM2FmLTlmZjctNDIyYy1iZWM0LTdkOTJlNGJhMTIxMgBGAAAAAAC%2bJKAsOiatT72DC7KJ%2fEvuBwCQraHAWf4WSYwEqrE9wFctAAAAAAEJAACQraHAWf4WSYwEqrE9wFctAARdEYc2AAA%3d&exvsurl=1&viewmodel=ReadMessageItem)

// Best-effort CO2 ranges for chart (kt/MW·yr)
const DAC_CO2_KT_RANGE: Range = { min: 4.55, max: 4.55 };
const FO_CO2_KT_RANGE: Range = { min: 0.07, max: 0.10 };
const FNB_CO2_KT_RANGE: Range = { min: 0.65, max: 1.30 };
const AWH_CO2_KT_RANGE: Range = { min: 0.13, max: 0.53 };

// District heat proxy (NG displaced): 0.202–0.27 kgCO2/kWh ⇒ 1.77–2.37 kt/MW·yr
const DISTRICT_HEAT_CO2_KT_RANGE: Range = { min: 1.77, max: 2.37 };

// --------------------
// Helpers
// --------------------
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
function fmtInt(n: number) {
  return Math.round(n).toLocaleString();
}
function fmt1(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function fmt2(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function ramp(tempC: number, t0: number, t1: number, v0: number, v1: number) {
  if (tempC <= t0) return v0;
  if (tempC >= t1) return v1;
  const f = (tempC - t0) / (t1 - t0);
  return v0 + f * (v1 - v0);
}

// --------------------
// UI Components
// --------------------
function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function SliderRow({
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

/** ✅ THIS fixes your error: MetricRow is now defined */
function MetricRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
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
// Preview image & info for selected offtake
function OfftakePreview({ offtake, dcFacilityTempC }: { offtake: Offtake; dcFacilityTempC: number }) {
  const IMAGES: Record<Offtake, string> = {
    hotWater: "/images/hot-water.jpg",
    districtHeat: "/images/district-heat.jpg",
    waterTreatmentFO: "/images/trevi-fo.jpg",
    atmosphericWater: "/images/uravu-awh.jpg",
    greenhouses: "/images/greenhouse.jpg",
    foodBrewery: "/images/food-brewery.jpg",
    dac: "/images/dac-plant.jpg",
  };

  const src = IMAGES[offtake];
  const [open, setOpen] = useState(false);

  const METRICS: Record<Offtake, Array<{ label: string; value: string }>> = {
    dac: [
      { label: "CO₂ captured (approx)", value: `${fmtInt(DAC_TCO2_PER_MW_YEAR)} tCO₂ / MW·yr` },
      { label: "Water per tCO₂", value: `${DAC_WATER_M3_PER_TCO2} m³ / tCO₂` },
    ],
    waterTreatmentFO: [
      { label: "Treated water (mid)", value: `${fmtInt(TREVI_M3_PER_MW_YEAR_MID)} m³ / MW·yr` },
    ],
    atmosphericWater: [
      { label: "Captured water (mid)", value: `${fmtInt(URAVU_M3_PER_MW_YEAR_MID)} m³ / MW·yr` },
    ],
    greenhouses: [
      { label: "Greenhouse energy intensity", value: `${fmt1(GREENHOUSE_MWH_PER_HA_YEAR_DEFAULT)} MWh / ha·yr` },
    ],
    foodBrewery: [
      { label: "Process suitability", value: dcFacilityTempC < 80 ? "May require lift for boiling" : "Suitable for many processes" },
    ],
    districtHeat: [
      { label: "Homes heated (per MW·yr)", value: `${fmtInt(MWH_PER_MW_YEAR / DEFAULT_MWH_PER_HOME_YEAR)} homes / MW·yr` },
    ],
    hotWater: [
      { label: "Hot water equivalence", value: "Dependent on displaced heat source" },
    ],
  };

  const metrics = METRICS[offtake] ?? [];

  return (
    <div className="mt-4">
      <div className="text-sm font-medium text-slate-700 mb-2">{OFFTAKE_LABEL[offtake]}</div>
      <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
        <div className="flex items-center justify-center bg-[color:var(--card-bg)]">
          <button className="w-full" onClick={() => setOpen(true)} aria-label={`Open ${OFFTAKE_LABEL[offtake]} preview`}>
            <img
              src={src}
              alt={OFFTAKE_LABEL[offtake]}
              className="w-full max-h-56 object-contain"
              style={{ display: "block" }}
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                img.style.display = "none";
              }}
            />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-4xl w-full rounded-lg bg-white shadow-lg overflow-hidden">
            <div className="flex justify-between items-center p-3 border-b border-slate-200">
              <div className="text-lg font-semibold">{OFFTAKE_LABEL[offtake]}</div>
              <button className="text-slate-600 px-2" onClick={() => setOpen(false)} aria-label="Close preview">✕</button>
            </div>
            <div className="p-4 grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-center">
                <img src={src} alt={OFFTAKE_LABEL[offtake]} className="max-h-[60vh] w-full object-contain" />
              </div>
              <div>
                <div className="text-sm text-slate-700 mb-2 font-semibold">Performance metrics</div>
                <ul className="space-y-2">
                  {metrics.map((m, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{m.label}:</span> <span className="ml-2">{m.value}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-xs text-slate-500">Note: values are best-effort estimates; tune with project data.</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- SVG bar chart with error bars ----------
type BarDatum = { label: string; best: number; min: number; max: number };
function CO2BarChart({ data }: { data: BarDatum[] }) {
  const width = 920;
  const height = 340;
  const margin = { top: 24, right: 20, bottom: 110, left: 70 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const maxY = Math.max(0.5, ...data.map((d) => d.max));
  const y = (v: number) => margin.top + plotH * (1 - v / maxY);
  const xStep = plotW / data.length;
  const barW = xStep * 0.7;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} className="block">
        <text
          x={width / 2}
          y={18}
          textAnchor="middle"
          className="fill-slate-900"
          fontSize="16"
          fontWeight="700"
        >
          CO₂ Impact by Offtake (normalized)
        </text>

        <line
          x1={margin.left}
          y1={margin.top}
          x2={margin.left}
          y2={margin.top + plotH}
          stroke="#334155"
          strokeWidth="1"
        />
        <line
          x1={margin.left}
          y1={margin.top + plotH}
          x2={margin.left + plotW}
          y2={margin.top + plotH}
          stroke="#334155"
          strokeWidth="1"
        />

        {Array.from({ length: 6 }).map((_, i) => {
          const v = (maxY * i) / 5;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={margin.left - 6} y1={yy} x2={margin.left} y2={yy} stroke="#334155" />
              <text x={margin.left - 10} y={yy + 4} textAnchor="end" className="fill-slate-700" fontSize="11">
                {v.toFixed(1)}
              </text>
              <line x1={margin.left} y1={yy} x2={margin.left + plotW} y2={yy} stroke="#e2e8f0" />
            </g>
          );
        })}

        <text
          x={18}
          y={margin.top + plotH / 2}
          transform={`rotate(-90 18 ${margin.top + plotH / 2})`}
          textAnchor="middle"
          className="fill-slate-700"
          fontSize="12"
        >
          CO₂ avoided/removed (ktCO₂e per MW·yr)
        </text>

        {data.map((d, i) => {
          const cx = margin.left + xStep * i + xStep / 2;
          const x0 = cx - barW / 2;
          const yBest = y(d.best);
          const yMin = y(d.min);
          const yMax = y(d.max);
          const baseY = margin.top + plotH;

          return (
            <g key={i}>
              <rect x={x0} y={yBest} width={barW} height={baseY - yBest} fill="#3b6ea8" opacity={0.9} />
              <line x1={cx} y1={yMax} x2={cx} y2={yMin} stroke="#0f172a" strokeWidth="2" />
              <line x1={cx - 10} y1={yMax} x2={cx + 10} y2={yMax} stroke="#0f172a" strokeWidth="2" />
              <line x1={cx - 10} y1={yMin} x2={cx + 10} y2={yMin} stroke="#0f172a" strokeWidth="2" />
              <text
                x={cx}
                y={margin.top + plotH + 10}
                textAnchor="end"
                transform={`rotate(-20 ${cx} ${margin.top + plotH + 10})`}
                className="fill-slate-800"
                fontSize="11"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --------------------
// Page
// --------------------
export default function Page() {
  const [offtake, setOfftake] = useState<Offtake>("dac");
  const [itLoadMW, setItLoadMW] = useState(200);
  const [recoveryPct, setRecoveryPct] = useState(5);
  const [hoursPerYear, setHoursPerYear] = useState(8000);

  // ✅ DC Facility water temp (key dependency)
  const [dcFacilityTempC, setDcFacilityTempC] = useState(39);

  const [mwhPerHomeYear, setMwhPerHomeYear] = useState(DEFAULT_MWH_PER_HOME_YEAR);

  // Phoenix per-capita water
  const [phxGpcd, setPhxGpcd] = useState(125);

  // enforce a fixed ΔT of 12°C: return temp = supply temp - 12
  const dcReturnTempC = Math.max(0, dcFacilityTempC - 12);

  const core = useMemo(() => {
    const recFrac = clamp(recoveryPct, 0, 100) / 100;
    const recoverableHeatMW = itLoadMW * recFrac;
    const annualHeatMWh = recoverableHeatMW * hoursPerYear;
    const effectiveMWyr = recoverableHeatMW * (hoursPerYear / 8760);
    const dcDeltaT = Math.max(1, dcFacilityTempC - dcReturnTempC);
    return { recoverableHeatMW, annualHeatMWh, effectiveMWyr, dcDeltaT };
  }, [itLoadMW, recoveryPct, hoursPerYear, dcFacilityTempC]);

  const phxM3PerPersonYear = useMemo(() => phxGpcd * GAL_TO_M3 * 365, [phxGpcd]);

  // Temp -> performance factors (transparent ramps; tune later with full curves)
  const perf = useMemo(() => {
    // Uravu: designed 30–55°C; higher temp -> higher water output in waste-heat mode [2](https://codeparrot.ai/blogs/nextjs-and-tailwind-css-2025-guide-setup-tips-and-best-practices)[3](https://learning.cloud.microsoft/detail/c6bb225c-3349-452f-97b8-67645ed47744?context={%22subEntityId%22:{%22source%22:%22M365Search%22}})
    const uravuFactor = ramp(dcFacilityTempC, 30, 55, 0.75, 1.0);

    // Trevi: modeled 30°C vs 45°C DC waste heat scenarios (lift reduces with higher supply temp) [4](https://stackoverflow.com/questions/79596185/tailwind-css-classes-not-applying-in-next-js-14-app-router-project)[5](https://nextjs.org/docs/13/app/building-your-application/styling/tailwind-css)
    const treviFactor = ramp(dcFacilityTempC, 30, 45, 0.85, 1.0);

    // DAC: heated (~65°C) release step; ramp up as temp approaches 65°C 
    const dacFactor = ramp(dcFacilityTempC, 30, DAC_RELEASE_TEMP_C, 0.5, 1.0);

    // Greenhouses: mild benefit with higher temps
    const greenhouseFactor = ramp(dcFacilityTempC, 30, 60, 0.9, 1.0);

    return { uravuFactor, treviFactor, dacFactor, greenhouseFactor };
  }, [dcFacilityTempC]);

  const outputs = useMemo(() => {
    const mw = core.recoverableHeatMW;

    const treviM3PerYear = mw * TREVI_M3_PER_MW_YEAR_MID * perf.treviFactor;
    const uravuM3PerYear = mw * URAVU_M3_PER_MW_YEAR_MID * perf.uravuFactor;

    const homesHeated = mwhPerHomeYear > 0 ? core.annualHeatMWh / mwhPerHomeYear : 0;

    const greenhouseHa =
      (core.annualHeatMWh / GREENHOUSE_MWH_PER_HA_YEAR_DEFAULT) * perf.greenhouseFactor;

    const breweryNeedsLiftForBoiling = dcFacilityTempC < 80;

    const dacTco2PerYear = core.effectiveMWyr * DAC_TCO2_PER_MW_YEAR * perf.dacFactor;
    const dacWaterM3PerYear = dacTco2PerYear * DAC_WATER_M3_PER_TCO2;

    const treviPeoplePerYear = phxM3PerPersonYear > 0 ? treviM3PerYear / phxM3PerPersonYear : 0;
    const uravuPeoplePerYear = phxM3PerPersonYear > 0 ? uravuM3PerYear / phxM3PerPersonYear : 0;
    const dacPeoplePerYear = phxM3PerPersonYear > 0 ? dacWaterM3PerYear / phxM3PerPersonYear : 0;

    return {
      treviM3PerYear,
      uravuM3PerYear,
      greenhouseHa,
      breweryNeedsLiftForBoiling,
      homesHeated,
      dacTco2PerYear,
      dacWaterM3PerYear,
      treviPeoplePerYear,
      uravuPeoplePerYear,
      dacPeoplePerYear,
    };
  }, [core, perf, mwhPerHomeYear, phxM3PerPersonYear, dcFacilityTempC]);

  const normalized = useMemo(() => {
    const treviM3_per_MWyr = TREVI_M3_PER_MW_YEAR_MID * perf.treviFactor;
    const uravuM3_per_MWyr = URAVU_M3_PER_MW_YEAR_MID * perf.uravuFactor;

    const dacTco2_per_MWyr = DAC_TCO2_PER_MW_YEAR * perf.dacFactor;
    const dacWaterM3_per_MWyr = dacTco2_per_MWyr * DAC_WATER_M3_PER_TCO2;

    const homes_per_MWyr = mwhPerHomeYear > 0 ? MWH_PER_MW_YEAR / mwhPerHomeYear : 0;
    const greenhouseHa_per_MWyr =
      (MWH_PER_MW_YEAR / GREENHOUSE_MWH_PER_HA_YEAR_DEFAULT) * perf.greenhouseFactor;

    const phxPeoplePerMWyr_trevi = phxM3PerPersonYear > 0 ? treviM3_per_MWyr / phxM3PerPersonYear : 0;
    const phxPeoplePerMWyr_uravu = phxM3PerPersonYear > 0 ? uravuM3_per_MWyr / phxM3PerPersonYear : 0;
    const phxPeoplePerMWyr_dac = phxM3PerPersonYear > 0 ? dacWaterM3_per_MWyr / phxM3PerPersonYear : 0;

    return {
      treviM3_per_MWyr,
      uravuM3_per_MWyr,
      dacTco2_per_MWyr,
      dacWaterM3_per_MWyr,
      homes_per_MWyr,
      greenhouseHa_per_MWyr,
      phxPeoplePerMWyr_trevi,
      phxPeoplePerMWyr_uravu,
      phxPeoplePerMWyr_dac,
    };
  }, [perf, mwhPerHomeYear, phxM3PerPersonYear]);

  const co2Bars: BarDatum[] = useMemo(() => {
    const mk = (label: string, r: Range) => ({
      label,
      min: r.min,
      max: r.max,
      best: (r.min + r.max) / 2,
    });

    return [
      mk("Direct Air Capture (DAC)", DAC_CO2_KT_RANGE),
      mk("FO Waste Water Treatment", FO_CO2_KT_RANGE),
      mk("Food & Beverage (EU)", FNB_CO2_KT_RANGE),
      mk("Atmospheric Water Capture", AWH_CO2_KT_RANGE),
      mk("Greenhouses & Agriculture", GREENHOUSE_CO2_KT_PER_MWYR_RANGE),
      mk("District Heating (proxy)", DISTRICT_HEAT_CO2_KT_RANGE),
    ];
  }, []);

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <h1 className="text-2xl font-bold text-slate-900">Waste Heat Reuse (WHR) Calculator</h1>
      <p className="mt-1 text-slate-600">
        Clean output cards + normalized metrics + CO₂ chart. DC facility temperature influences offtake performance.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Recoverable heat power" value={`${core.recoverableHeatMW.toFixed(2)} MW`} sub="IT load × recovery%" />
        <StatTile label="Annual recoverable heat" value={`${fmtInt(core.annualHeatMWh)} MWh/yr`} sub="Power × operating hours" />
        <StatTile label="Effective MW·yr" value={`${core.effectiveMWyr.toFixed(2)}`} sub="Scaled by hours / 8760" />
        <StatTile label="DC facility ΔT" value={`${core.dcDeltaT.toFixed(0)} °C`} sub={`Supply ${dcFacilityTempC}°C, return ${dcReturnTempC}°C`} />
      </div>

      <div className="mt-6">
        <Card title="Offtake application" right={<span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">V1</span>}>
          <select
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            value={offtake}
            onChange={(e) => setOfftake(e.target.value as Offtake)}
          >
            {Object.entries(OFFTAKE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Inputs">
          <SliderRow label="IT load" value={itLoadMW} setValue={setItLoadMW} min={0} max={200} step={0.5} unit="MW" decimals={1} />
          <SliderRow label="Heat capture / recovery" value={recoveryPct} setValue={setRecoveryPct} min={0} max={100} step={1} unit="%" />
          <SliderRow label="Operating hours per year" value={hoursPerYear} setValue={setHoursPerYear} min={0} max={8760} step={10} unit="hrs" />
          <SliderRow
            label="DC facility water temperature entering the offtake"
            value={dcFacilityTempC}
            setValue={setDcFacilityTempC}
            min={30}
            max={80}
            step={1}
            unit="°C"
            helper="Higher temperature typically improves offtake performance (lower lift needs / improved thermodynamics)."
          />

          {offtake === "districtHeat" ? (
            <SliderRow
              label="MWh per home-year (district heat)"
              value={mwhPerHomeYear}
              setValue={setMwhPerHomeYear}
              min={5}
              max={30}
              step={0.5}
              unit="MWh/home-yr"
              decimals={1}
              helper="Homes heated = annual MWh / (MWh per home-year)."
            />
          ) : null}

          <SliderRow
            label="Phoenix per-capita water use"
            value={phxGpcd}
            setValue={setPhxGpcd}
            min={50}
            max={250}
            step={1}
            unit="gal/person/day"
            helper="Used for the “people served/year” equivalence."
          />
        </Card>
      </div>

      {/* RESULTS (clean, not scrambled) */}
      <div className="mt-6">
        <Card title={`Results — ${OFFTAKE_LABEL[offtake]}`}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 min-w-0">
              <div className="text-sm font-semibold text-slate-900">Core</div>
              <div className="mt-3 space-y-3">
                <MetricRow label="Recoverable heat power" value={`${core.recoverableHeatMW.toFixed(2)} MW`} />
                <MetricRow label="Annual recoverable heat" value={`${fmtInt(core.annualHeatMWh)} MWh/yr`} />
                <MetricRow label="Effective MW·yr" value={`${core.effectiveMWyr.toFixed(2)}`} sub="Scaled by operating hours / 8760" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 min-w-0">
              <div className="text-sm font-semibold text-slate-900">Offtake outputs</div>

              {offtake === "dac" ? (
                <div className="mt-3 space-y-3">
                  <MetricRow label="CO₂ captured" value={`${fmtInt(outputs.dacTco2PerYear)} tCO₂/yr`} sub={`Temp factor ×${fmt2(perf.dacFactor)} (ramps toward ~${DAC_RELEASE_TEMP_C}°C)`} />
                  <MetricRow label="Water captured" value={`${fmtInt(outputs.dacWaterM3PerYear)} m³/yr`} sub={`Uses ${DAC_WATER_M3_PER_TCO2} m³ water per tCO₂`} />
                  <MetricRow label="Phoenix equivalent" value={`~${fmtInt(outputs.dacPeoplePerYear)} people/yr`} sub={`${phxGpcd} gal/person/day`} />
                </div>
              ) : null}

              {offtake === "waterTreatmentFO" ? (
                <div className="mt-3 space-y-3">
                  <MetricRow label="Treated water (midpoint)" value={`${fmtInt(outputs.treviM3PerYear)} m³/yr`} sub={`Temp factor ×${fmt2(perf.treviFactor)} (30→45°C improvement model)`} />
                  <MetricRow label="Phoenix equivalent" value={`~${fmtInt(outputs.treviPeoplePerYear)} people/yr`} sub={`${phxGpcd} gal/person/day`} />
                </div>
              ) : null}

              {offtake === "atmosphericWater" ? (
                <div className="mt-3 space-y-3">
                  <MetricRow label="Captured water (midpoint)" value={`${fmtInt(outputs.uravuM3PerYear)} m³/yr`} sub={`Temp factor ×${fmt2(perf.uravuFactor)} (30→55°C envelope)`} />
                  <MetricRow label="Phoenix equivalent" value={`~${fmtInt(outputs.uravuPeoplePerYear)} people/yr`} sub={`${phxGpcd} gal/person/day`} />
                </div>
              ) : null}

              {offtake === "districtHeat" ? (
                <div className="mt-3 space-y-3">
                  <MetricRow label="Homes heated" value={`${fmtInt(outputs.homesHeated)} homes/yr`} />
                  <MetricRow label="Heat-grade note" value={dcFacilityTempC >= 65 ? "Higher grade (less lift)" : "Likely needs lift"} sub="District heating supply temps often higher than DC loop." />
                </div>
              ) : null}

              {offtake === "greenhouses" ? (
                <div className="mt-3 space-y-3">
                  <MetricRow label="Greenhouse area heated" value={`${fmt1(outputs.greenhouseHa)} hectares`} sub={`Temp factor ×${fmt2(perf.greenhouseFactor)}`} />
                  <MetricRow
                    label="CO₂ avoided (range)"
                    value={`${GREENHOUSE_CO2_KT_PER_MWYR_RANGE.min.toFixed(2)}–${GREENHOUSE_CO2_KT_PER_MWYR_RANGE.max.toFixed(2)} kt/MW·yr`}
                    sub="Seasonal capacity-factor adjusted range."
                  />
                </div>
              ) : null}

              {offtake === "foodBrewery" ? (
                <div className="mt-3 space-y-3">
                  <MetricRow label="Process temp suitability" value={dcFacilityTempC < 80 ? "Many steps need lift" : "More direct use"} sub="Higher temp improves process compatibility." />
                  <MetricRow label="CO₂ avoided (range)" value={`${FNB_CO2_KT_RANGE.min.toFixed(2)}–${FNB_CO2_KT_RANGE.max.toFixed(2)} kt/MW·yr`} sub="Best-effort range." />
                </div>
              ) : null}

              {offtake === "hotWater" ? (
                <div className="mt-3 text-sm text-slate-700 whitespace-normal break-words">
                  Hot-water equivalence is a physical reference; CO₂ impact depends on the displaced heat source.
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      {/* Normalized Metrics */}
      
      {/* Offtake image preview (moved below results) */}
      <div className="mt-6">
        <Card title="Offtake preview">
          <OfftakePreview offtake={offtake} dcFacilityTempC={dcFacilityTempC} />
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Normalized Metrics (per MW·year)" right={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Temperature-aware</span>}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 min-w-0">
              <div className="text-sm font-semibold text-slate-900">Water (m³ per MW·yr)</div>
              <div className="mt-3 space-y-3">
                <MetricRow label="FO / Trevi (mid)" value={`${fmtInt(normalized.treviM3_per_MWyr)} m³/MW·yr`} />
                <MetricRow label="AWH / Uravu (mid)" value={`${fmtInt(normalized.uravuM3_per_MWyr)} m³/MW·yr`} />
                <MetricRow label="DAC water" value={`${fmtInt(normalized.dacWaterM3_per_MWyr)} m³/MW·yr`} />
              </div>
              <div className="mt-3 text-xs text-slate-500 whitespace-normal break-words">
                Phoenix equivalents (per MW·yr): FO ~{fmtInt(normalized.phxPeoplePerMWyr_trevi)}, AWH ~{fmtInt(normalized.phxPeoplePerMWyr_uravu)}, DAC ~{fmtInt(normalized.phxPeoplePerMWyr_dac)} people.
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 min-w-0">
              <div className="text-sm font-semibold text-slate-900">Other (per MW·yr)</div>
              <div className="mt-3 space-y-3">
                <MetricRow label="Homes heated (district)" value={`${fmtInt(normalized.homes_per_MWyr)} homes/MW·yr`} />
                <MetricRow label="Greenhouse area" value={`${fmt2(normalized.greenhouseHa_per_MWyr)} ha/MW·yr`} />
                <MetricRow label="DAC CO₂" value={`${fmtInt(normalized.dacTco2_per_MWyr)} tCO₂/MW·yr`} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* CO2 chart */}
      <div className="mt-6">
        <Card title="CO₂ comparison across offtakes (normalized)">
          <CO2BarChart data={co2Bars} />
          <div className="mt-3 text-xs text-slate-500 whitespace-normal break-words">
            CO₂ chart uses best-effort ranges; DAC is at-scale constant. Greenhouses range is seasonal CF adjusted.
          </div>
        </Card>
      </div>
    </main>
  );
}