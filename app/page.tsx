"use client";

import React, { useEffect, useMemo, useState } from "react";
import offData from "../../data/offtaker_costs.json";
import dcConfigData from "../../data/dc_cooling_config.json";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  waterTreatmentFO: "Waste Water Treatment System (FO)",
  atmosphericWater: "Atmospheric Water Capture System",
  greenhouses: "Greenhouses & agriculture",
  foodBrewery: "Food & brewery industry",
  dac: "Direct Air Capture (DAC)",
};

const OFFTAKE_HELP: Record<Offtake, string> = {
  hotWater: "Offsets conventional heating; stabilizes heat recovery value for the DC; supports local hot-water needs.",
  districtHeat: "Supplies low-carbon heat to buildings; improves DC efficiency economics; lowers community heating emissions.",
  waterTreatmentFO: "Provides process heat for treatment; creates operating savings for the DC; expands clean-water capacity locally.",
  atmosphericWater: "Enables water capture systems; reduces DC heat rejection costs; adds resilient community water supply.",
  greenhouses: "Supports year-round crops; raises DC heat utilization; strengthens local food systems and jobs.",
  foodBrewery: "Feeds process heat demand; increases DC heat monetization; reduces industrial fuel use nearby.",
  dac: "Powers CO2 removal; boosts DC climate impact; delivers community-scale carbon benefits.",
};

type Range = { min: number; max: number };

// --------------------
// Constants
// --------------------
const MWH_PER_MW_YEAR = 8760;

const L_PER_M3 = 1000;
const GAL_TO_M3 = 0.00378541;

// DAC constants (at-scale)
const DAC_TCO2_PER_MW_YEAR = 4550; // tCO2 per MW·yr
const DAC_WATER_M3_PER_TCO2 = 1.6; // m3 per tCO2 (legacy)
const DAC_WATER_M3_PER_MW_YEAR = 160; // m3 per MW·yr (actual water byproduct)
const DAC_RELEASE_TEMP_C = 65;

// Waste Water Treatment System (FO) throughput (range)
const TREVI_L_PER_MW_YEAR_RANGE = { min: 255_000_000, max: 365_000_000 };
const TREVI_M3_PER_MW_YEAR_MID =
  (TREVI_L_PER_MW_YEAR_RANGE.min + TREVI_L_PER_MW_YEAR_RANGE.max) / 2 / L_PER_M3;

// Atmospheric Water Capture System throughput (range)
const URAVU_L_PER_MW_YEAR_RANGE = { min: 2_000_000, max: 15_000_000 };
const URAVU_M3_PER_MW_YEAR_MID =
  (URAVU_L_PER_MW_YEAR_RANGE.min + URAVU_L_PER_MW_YEAR_RANGE.max) / 2 / L_PER_M3;

const GREENHOUSE_MWH_PER_HA_YEAR_DEFAULT = 4500;
const TOMATO_TONS_PER_HA_YEAR = 450;
const DEFAULT_MWH_PER_HOME_YEAR = 14.5;

// Helpers
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

// WHR Installation Cost ($/MW) — reference constant (slider drives payback tiles)
const WHR_INSTALLATION_COST_PER_MW = 0.25 * 1_000_000;

// CO2 abatement ranges by offtake (kT CO2 equiv per MW·year)
const DAC_CO2_KT_RANGE: Range = { min: 4.0, max: 5.0 };
const FO_CO2_KT_RANGE: Range = { min: 0.5, max: 1.5 };
const FNB_CO2_KT_RANGE: Range = { min: 0.3, max: 0.8 };
const AWH_CO2_KT_RANGE: Range = { min: 0.1, max: 0.3 };
const GREENHOUSE_CO2_KT_PER_MWYR_RANGE: Range = { min: 0.2, max: 0.6 };
const DISTRICT_HEAT_CO2_KT_RANGE: Range = { min: 0.1, max: 0.5 };

const DEFAULT_DC_CITY = "Frankfurt";
const DC_LOCATIONS: Record<
  string,
  {
    label: string;
    region: "US" | "Europe";
    ambientTempC: number;
    electricityCostPerMWh: number;
    gridEfKgPerKwh: number;
  }
> = {
  Seattle: {
    label: "Seattle, WA",
    region: "US",
    ambientTempC: 12,
    electricityCostPerMWh: 99.9,
    gridEfKgPerKwh: 0.367,
  },
  Chicago: {
    label: "Chicago, IL",
    region: "US",
    ambientTempC: 11,
    electricityCostPerMWh: 118.1,
    gridEfKgPerKwh: 0.367,
  },
  Phoenix: {
    label: "Phoenix, AZ",
    region: "US",
    ambientTempC: 20,
    electricityCostPerMWh: 122.3,
    gridEfKgPerKwh: 0.367,
  },
  Atlanta: {
    label: "Atlanta, GA",
    region: "US",
    ambientTempC: 14,
    electricityCostPerMWh: 108.7,
    gridEfKgPerKwh: 0.367,
  },
  Frankfurt: {
    label: "Frankfurt, Germany",
    region: "Europe",
    ambientTempC: 12,
    electricityCostPerMWh: 284,
    gridEfKgPerKwh: 0.332,
  },
  Newport: {
    label: "Newport, UK",
    region: "Europe",
    ambientTempC: 10,
    electricityCostPerMWh: 442,
    gridEfKgPerKwh: 0.217,
  },
  "Agriport A7": {
    label: "Agriport A7, Netherlands",
    region: "Europe",
    ambientTempC: 11,
    electricityCostPerMWh: 221,
    gridEfKgPerKwh: 0.253,
  },
  Zaragoza: {
    label: "Zaragoza, Spain",
    region: "Europe",
    ambientTempC: 13,
    electricityCostPerMWh: 138,
    gridEfKgPerKwh: 0.153,
  },
};

// ============ UI Components (inline) ============
function Card({
  title,
  children,
  right,
  collapsible = false,
  defaultExpanded = true,
  titleClassName,
  tooltip,
  headerClassName,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  titleClassName?: string;
  tooltip?: string;
  headerClassName?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div 
        className={`flex items-start justify-between gap-4 ${collapsible ? 'cursor-pointer select-none' : ''} ${headerClassName ?? ''}`}
        onClick={() => collapsible && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1" title={tooltip}>
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
          <h2 className={`text-base font-semibold text-slate-900 ${titleClassName ?? ""}`}>
            {title}
          </h2>
          {tooltip ? (
            <svg
              className="ml-1 h-4 w-4 text-slate-500"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8h.01M11 12h1v4h1" />
            </svg>
          ) : null}
        </div>
        {right ? <div onClick={(e) => collapsible && e.stopPropagation()}>{right}</div> : null}
      </div>
      {isExpanded && children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-medium text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

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
    <div className="flex items-baseline justify-between gap-6">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-600">{label}</div>
        {sub ? (
          <div className="mt-1 text-xs text-slate-500 whitespace-normal break-words">
            {sub}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-base font-bold text-blue-700 whitespace-nowrap text-right">{value}</div>
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
  const isCurrency = unit === "M" || unit === "$";
  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-4">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-sm font-semibold text-blue-600 whitespace-nowrap">
          {isCurrency ? "$" : ""}
          {isCurrency ? " " : ""}
          {value.toLocaleString(undefined, { maximumFractionDigits: decimals })}
          {unit && !isCurrency ? " " : ""}
          {unit && !isCurrency ? unit : ""}
          {unit === "M" ? " M" : ""}
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
      {helper ? (
        <div className="mt-2 text-xs text-slate-500 whitespace-normal break-words">
          {helper}
        </div>
      ) : null}
    </div>
  );
}

// Preview image & info for selected offtake
function OfftakePreview({
  offtake,
  dcFacilityTempC,
  costData,
}: {
  offtake: Offtake;
  dcFacilityTempC: number;
  costData?: { capexM: number; opexPerYear: number; unit: string };
}) {
  const IMAGES: Record<Offtake, string> = {
    hotWater: "/Images/Offtake piping example.jpg",
    districtHeat: "/Images/Offtake piping example.jpg",
    waterTreatmentFO: "/images/trevi-fo.jpg",
    atmosphericWater: "/images/uravu-awh.jpg",
    greenhouses: "/images/greenhouse.jpg",
    foodBrewery: "/Images/Offtake piping example.jpg",
    dac: "/images/dac-plant.jpg",
  };

  const src = IMAGES[offtake];
  const [open, setOpen] = useState(false);

  const SIZES: Record<Offtake, string> = {
    dac: "Facility: ~1000—5000 m² (10,764—53,820 ft²) depending on scale",
    waterTreatmentFO: "Treatment area: ~200—800 m² (2,153—8,611 ft²)",
    atmosphericWater: "Module footprint: ~50—200 m² (538—2,153 ft²)",
    greenhouses: "~0.5—10+ hectares (1.2—25+ acres)",
    foodBrewery: "Process area: ~500—2000 m² (5,382—21,528 ft²)",
    districtHeat: "Heat exchanger: ~20—100 m² (215—1,076 ft²) surface area",
    hotWater: "Tank/system: ~1—50 m³ (264—13,208 gal) typical",
  };

  const METRICS: Record<Offtake, Array<{ label: string; value: string }>> = {
    dac: [
      {
        label: "CO₂ captured (approx)",
        value: `${fmtInt(DAC_TCO2_PER_MW_YEAR)} tCO₂ / MW·yr`,
      },
      { label: "Water per tCO₂", value: `${DAC_WATER_M3_PER_TCO2} m³ / tCO₂` },
    ],
    waterTreatmentFO: [
      {
        label: "Treated water (mid)",
        value: `${fmtInt(TREVI_M3_PER_MW_YEAR_MID)} m³ / MW·yr`,
      },
    ],
    atmosphericWater: [
      {
        label: "Captured water (mid)",
        value: `${fmtInt(URAVU_M3_PER_MW_YEAR_MID)} m³ / MW·yr`,
      },
    ],
    greenhouses: [
      {
        label: "Greenhouse energy intensity",
        value: `${fmt1(GREENHOUSE_MWH_PER_HA_YEAR_DEFAULT)} MWh / ha·yr`,
      },
    ],
    foodBrewery: [
      {
        label: "Process suitability",
        value:
          dcFacilityTempC < 80
            ? "May require lift for boiling"
            : "Suitable for many processes",
      },
    ],
    districtHeat: [
      {
        label: "Homes heated (per MW·yr)",
        value: `${fmtInt(MWH_PER_MW_YEAR / DEFAULT_MWH_PER_HOME_YEAR)} homes / MW·yr`,
      },
    ],
    hotWater: [{ label: "Hot water equivalence", value: "Dependent on displaced heat source" }],
  };

  const metrics = METRICS[offtake] ?? [];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-slate-700">
          {OFFTAKE_LABEL[offtake]}
        </div>
        <div className="text-xs text-green-700 font-medium">
          Click image to learn more
        </div>
      </div>

      <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
        <div className="flex items-center justify-center">
          <button
            className="w-full"
            onClick={() => setOpen(true)}
            aria-label={`Open ${OFFTAKE_LABEL[offtake]} preview`}
          >
            <img
              src={src}
              alt={OFFTAKE_LABEL[offtake]}
              className="w-full max-h-80 object-contain"
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
              <button
                className="text-slate-600 px-2"
                onClick={() => setOpen(false)}
                aria-label="Close preview"
              >
                x
              </button>
            </div>

            <div className="p-4 grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-center">
                <img
                  src={src}
                  alt={OFFTAKE_LABEL[offtake]}
                  className="max-h-[60vh] w-full object-contain"
                />
              </div>
              <div>
                <div className="text-sm text-slate-700 mb-2 font-semibold">
                  Size information{" "}
                  <span className="text-xs text-slate-500 font-normal">
                    (for 1 MW equivalent system)
                  </span>
                </div>
                <div className="text-sm text-slate-600 mb-4">{SIZES[offtake]}</div>

                <div className="text-sm text-slate-700 mb-2 font-semibold">
                  Performance metrics
                </div>
                <ul className="space-y-2">
                  {metrics.map((m, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium">{m.label}:</span>{" "}
                      <span className="ml-2">{m.value}</span>
                    </li>
                  ))}
                </ul>

                {costData && (
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="text-sm text-slate-700 mb-2 font-semibold">
                      Financial overview{" "}
                      <span className="text-xs text-slate-500 font-normal">
                        (for 1 MW system)
                      </span>
                    </div>
                    <ul className="space-y-2">
                      <li className="text-sm">
                        <span className="font-medium">CapEx:</span>{" "}
                        <span className="ml-2 text-slate-700 font-semibold">${costData.capexM.toFixed(2)}M</span>
                      </li>
                      <li className="text-sm">
                        <span className="font-medium">OpEx / year:</span>{" "}
                        <span className="ml-2 text-slate-700 font-semibold">${(costData.opexPerYear / 1000).toFixed(1)}K</span>
                      </li>
                    </ul>
                  </div>
                )}

                <div className="mt-4 text-xs text-slate-500">
                  Note: values are best-effort estimates; tune with project data.
                </div>
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
              <line
                x1={margin.left - 6}
                y1={yy}
                x2={margin.left}
                y2={yy}
                stroke="#334155"
              />
              <text
                x={margin.left - 10}
                y={yy + 4}
                textAnchor="end"
                className="fill-slate-700"
                fontSize="11"
              >
                {v.toFixed(1)}
              </text>
              <line
                x1={margin.left}
                y1={yy}
                x2={margin.left + plotW}
                y2={yy}
                stroke="#e2e8f0"
              />
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
              <rect
                x={x0}
                y={yBest}
                width={barW}
                height={baseY - yBest}
                fill="#3b6ea8"
                opacity={0.9}
              />
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
  const [recoveryPct, setRecoveryPct] = useState(10);
  const [hoursPerYear, setHoursPerYear] = useState(8760); // 24/7/365 operation

  // DC Facility return water temp (key dependency)
  const [dcReturnTempC, setDcReturnTempC] = useState(27);

  const [mwhPerHomeYear, setMwhPerHomeYear] = useState(DEFAULT_MWH_PER_HOME_YEAR);

  // Phoenix per-capita water
  const [phxGpcd, setPhxGpcd] = useState(125);

  const [activeSection, setActiveSection] = useState<string>("");

  useEffect(() => {
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      setActiveSection("");
      window.scrollTo({ top: 0 });
    }
    const update = () => setActiveSection(window.location.hash.replace("#", ""));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const dcSupplyTempC = dcReturnTempC - 12;

  // Offtake piping / intake inputs
  const [intakeDistanceKm, setIntakeDistanceKm] = useState(0.5);
  const [country, setCountry] = useState<string>("European average");
  const [inputTab, setInputTab] = useState<"dc" | "offtake">("dc");

  // DC reporting controls
  const [dcConfig, setDcConfig] = useState<string>("Ballard");
  const [erfPercent, setErfPercent] = useState(10);
  const [dcCity, setDcCity] = useState<string>(DEFAULT_DC_CITY);

  // Revenue generation pricing inputs
  const [dacMarketPrice, setDacMarketPrice] = useState(200); // $/ton
  const [dacProcurementPrice, setDacProcurementPrice] = useState(150); // $/ton
  const [waterMarketPrice, setWaterMarketPrice] = useState(4.5); // $/m³ - Phoenix water-scarce pricing
  const [waterProductionCost, setWaterProductionCost] = useState(3.5); // $/m³ - Waste Water Treatment System LCOW data ($3.29-$3.68)
  const [thermalEnergyPrice, setThermalEnergyPrice] = useState(75); // $/MWh (default district heat)
  const [electricityCost, setElectricityCost] = useState(
    DC_LOCATIONS[DEFAULT_DC_CITY].electricityCostPerMWh
  );
  const [gridEfKgPerKwh, setGridEfKgPerKwh] = useState(
    DC_LOCATIONS[DEFAULT_DC_CITY].gridEfKgPerKwh
  );
  const [coolingCOP, setCoolingCOP] = useState(3.3); // Coefficient of Performance for cooling systems

  // Savings slider
  const [whrCapitalCostPerMW, setWhrCapitalCostPerMW] = useState(0.25); // in millions USD

  // Ownership model
  type OwnershipModel = "microsoft" | "thirdparty" | "hybrid";
  const [ownershipModel, setOwnershipModel] = useState<OwnershipModel>("microsoft");
  const [tippingFeePerMWh, setTippingFeePerMWh] = useState(10); // $/MWh third party pays Microsoft for heat
  const [revenueSharePercent, setRevenueSharePercent] = useState(30); // % Microsoft gets in hybrid model

  // Offtake plant CapEx/OpEx (per installation, from actual water system spreadsheet data)
  const OFFTAKE_PLANT_COSTS: Record<Offtake, { capexM: number; opexPerYear: number; unit: string; notes: string }> = {
    waterTreatmentFO: { 
      capexM: 3.06, 
      opexPerYear: 256477, 
      unit: "Waste Water Treatment System (FO) plant + heat pump",
      notes: "From LCOW spreadsheet: FO plant $2.56M + Heat pump $0.5M. OpEx $256K/yr. LCOW: $3.29-3.68/m³"
    },
    atmosphericWater: { 
      capexM: 1.05, 
      opexPerYear: 126000, 
      unit: "Atmospheric Water Capture System",
      notes: "From system spreadsheet: AWH unit $500K + Dry cooler $100K + Air chiller $350K. OpEx ~12% of CapEx"
    },
    dac: { capexM: 4.0, opexPerYear: 350000, unit: "DAC facility", notes: "Estimate pending DAC-specific data" },
    districtHeat: { capexM: 0.8, opexPerYear: 80000, unit: "District heat connection", notes: "Estimate for infrastructure" },
    greenhouses: { capexM: 0.3, opexPerYear: 30000, unit: "Greenhouse heat connection", notes: "Simple heat exchange system" },
    hotWater: { capexM: 0.2, opexPerYear: 20000, unit: "Hot water system", notes: "Basic hot water distribution" },
    foodBrewery: { capexM: 6.25, opexPerYear: 1710000, unit: "Food & Brewery heat connection", notes: "BCA Calculations 65°C High-Efficiency Scenario: CapEx €5.785M (~$6.25M), OpEx €1.584M/yr (~$1.71M/yr). System: 1 optimized heat pump, piping, storage tank, heat exchangers. Alternative 30°C scenario (redundant dual pumps): CapEx €11.2M, OpEx €3.606M/yr (payback 9.5y). 65°C is more efficient with lower operating costs. [Source: DGA Food & Brewery feasibility study, Jan 2025]" },
  };

  // Microsoft DC Facilities with detailed specifications
  const FACILITIES: Record<string, { 
    location: string; 
    coolingType: string; 
    ambientTempC: number; 
    electricityCostPerMWh: number; 
    pueBaseline: number;
    pueMaxImprovement: number;
    wueBaseline: number;
    wueWithHR: number;
    scenarioMatch: string;
    whrFriendliness: string;
  }> = {
    Ballard: {
      location: "Quincy, WA",
      coolingType: "Direct evaporative air",
      ambientTempC: 10,
      electricityCostPerMWh: 60,
      pueBaseline: 1.59,
      pueMaxImprovement: 0.06, // 6% max PUE improvement (ASHRAE technical data - evaporative systems)
      wueBaseline: 0.359,
      wueWithHR: 0,
      scenarioMatch: "air cooled",
      whrFriendliness: "Low (air exhaust, low grade)"
    },
    Osgood: {
      location: "Chicago, IL",
      coolingType: "Indirect evap + mech backup",
      ambientTempC: 13,
      electricityCostPerMWh: 80,
      pueBaseline: 1.65,
      pueMaxImprovement: 0.09, // 9% max PUE improvement (hybrid systems with HR potential)
      wueBaseline: 0.45,
      wueWithHR: 0.35,
      scenarioMatch: "hybrid",
      whrFriendliness: "Medium"
    },
    "Fremont/Fairwater": {
      location: "Northern CA",
      coolingType: "Air-cooled chillers, closed-loop FW",
      ambientTempC: 15,
      electricityCostPerMWh: 115,
      pueBaseline: 1.72,
      pueMaxImprovement: 0.04, // 4% max PUE improvement (air-cooled systems - limited HR gains)
      wueBaseline: 0,
      wueWithHR: 0,
      scenarioMatch: "air cooled",
      whrFriendliness: "High"
    }
  };

  // Auto-update electricity cost when facility changes
  const currentFacility = FACILITIES[dcConfig];
  if (currentFacility && electricityCost !== currentFacility.electricityCostPerMWh) {
    // Would update here but need to avoid infinite loops - handle in UI instead
  }

  const selectedDcLocation = DC_LOCATIONS[dcCity];

  // City data updated to use facilities

  const cityData: { [key: string]: { ambientTempC: number; coolingCostMultiplier: number } } = {
    Ballard: { ambientTempC: 10, coolingCostMultiplier: 0.95 },
    Osgood: { ambientTempC: 13, coolingCostMultiplier: 1.05 },
    "Fremont/Fairwater": { ambientTempC: 15, coolingCostMultiplier: 1.20 },
    Seattle: { ambientTempC: 12, coolingCostMultiplier: 0.9 },
    Chicago: { ambientTempC: 11, coolingCostMultiplier: 1.0 },
    Phoenix: { ambientTempC: 20, coolingCostMultiplier: 1.35 },
    Atlanta: { ambientTempC: 14, coolingCostMultiplier: 1.1 },
    Frankfurt: { ambientTempC: 12, coolingCostMultiplier: 1.0},
    Newport: { ambientTempC: 10, coolingCostMultiplier: 0.95},
    "Agriport A7": { ambientTempC: 11, coolingCostMultiplier: 0.98},
    Zaragoza: { ambientTempC: 13, coolingCostMultiplier: 1.05},
  };

  const core = useMemo(() => {
    const recFrac = clamp(recoveryPct, 0, 100) / 100;
    const recoverableHeatMW = itLoadMW * recFrac;
    const annualHeatMWh = recoverableHeatMW * hoursPerYear;
    const effectiveMWyr = recoverableHeatMW * (hoursPerYear / 8760);
    const dcDeltaT = Math.max(1, dcReturnTempC - dcSupplyTempC);
    return { recoverableHeatMW, annualHeatMWh, effectiveMWyr, dcDeltaT };
  }, [itLoadMW, recoveryPct, hoursPerYear, dcReturnTempC, dcSupplyTempC]);

  const phxM3PerPersonYear = useMemo(() => phxGpcd * GAL_TO_M3 * 365, [phxGpcd]);

  // Temp -> performance factors
  const perf = useMemo(() => {
    const uravuFactor = ramp(dcReturnTempC, 30, 55, 0.75, 1.0);
    const treviFactor = ramp(dcReturnTempC, 30, 45, 0.85, 1.0);
    const dacFactor = ramp(dcReturnTempC, 30, DAC_RELEASE_TEMP_C, 0.5, 1.0);
    const greenhouseFactor = ramp(dcReturnTempC, 30, 60, 0.9, 1.0);
    return { uravuFactor, treviFactor, dacFactor, greenhouseFactor };
  }, [dcReturnTempC]);

  const outputs = useMemo(() => {
    const mw = core.recoverableHeatMW;

    const treviM3PerYear = mw * TREVI_M3_PER_MW_YEAR_MID * perf.treviFactor;
    const uravuM3PerYear = mw * URAVU_M3_PER_MW_YEAR_MID * perf.uravuFactor;

    const homesHeated = mwhPerHomeYear > 0 ? core.annualHeatMWh / mwhPerHomeYear : 0;
    const greenhouseHa = (core.annualHeatMWh / GREENHOUSE_MWH_PER_HA_YEAR_DEFAULT) * perf.greenhouseFactor;

    const dacTco2PerYear = core.effectiveMWyr * DAC_TCO2_PER_MW_YEAR * perf.dacFactor;
    const dacWaterM3PerYear = core.effectiveMWyr * DAC_WATER_M3_PER_MW_YEAR;

    const treviPeoplePerYear = phxM3PerPersonYear > 0 ? treviM3PerYear / phxM3PerPersonYear : 0;
    const uravuPeoplePerYear = phxM3PerPersonYear > 0 ? uravuM3PerYear / phxM3PerPersonYear : 0;
    const dacPeoplePerYear = phxM3PerPersonYear > 0 ? dacWaterM3PerYear / phxM3PerPersonYear : 0;

    return {
      treviM3PerYear,
      uravuM3PerYear,
      greenhouseHa,
      homesHeated,
      dacTco2PerYear,
      dacWaterM3PerYear,
      treviPeoplePerYear,
      uravuPeoplePerYear,
      dacPeoplePerYear,
    };
  }, [core, perf, mwhPerHomeYear, phxM3PerPersonYear]);

  const potentialCO2 = useMemo(() => {
    const mw = core.recoverableHeatMW;
    switch (offtake) {
      case "dac":
        return { kind: "dac", tco2: outputs.dacTco2PerYear || 0 };
      case "waterTreatmentFO":
        return { kind: "range", minKt: FO_CO2_KT_RANGE.min * mw, midKt: ((FO_CO2_KT_RANGE.min + FO_CO2_KT_RANGE.max) / 2) * mw, maxKt: FO_CO2_KT_RANGE.max * mw };
      case "foodBrewery":
        return { kind: "range", minKt: FNB_CO2_KT_RANGE.min * mw, midKt: ((FNB_CO2_KT_RANGE.min + FNB_CO2_KT_RANGE.max) / 2) * mw, maxKt: FNB_CO2_KT_RANGE.max * mw };
      case "atmosphericWater":
        return { kind: "range", minKt: AWH_CO2_KT_RANGE.min * mw, midKt: ((AWH_CO2_KT_RANGE.min + AWH_CO2_KT_RANGE.max) / 2) * mw, maxKt: AWH_CO2_KT_RANGE.max * mw };
      case "greenhouses":
        return { kind: "range", minKt: GREENHOUSE_CO2_KT_PER_MWYR_RANGE.min * mw, midKt: ((GREENHOUSE_CO2_KT_PER_MWYR_RANGE.min + GREENHOUSE_CO2_KT_PER_MWYR_RANGE.max) / 2) * mw, maxKt: GREENHOUSE_CO2_KT_PER_MWYR_RANGE.max * mw };
      case "districtHeat":
        return { kind: "range", minKt: DISTRICT_HEAT_CO2_KT_RANGE.min * mw, midKt: ((DISTRICT_HEAT_CO2_KT_RANGE.min + DISTRICT_HEAT_CO2_KT_RANGE.max) / 2) * mw, maxKt: DISTRICT_HEAT_CO2_KT_RANGE.max * mw };
      default:
        return null;
    }
  }, [offtake, core.recoverableHeatMW, outputs]);

  const offtakeCosts = useMemo(() => {
    const rows = (offData && (offData as any).raw_rows) || [];

    const findRegionRow = (region: string) => {
      const key = region.toLowerCase();
      for (const r of rows) {
        const loc = String(r.__EMPTY || "").toLowerCase();
        if (loc.includes(key) || key.includes(loc)) return r;
      }
      for (const r of rows) {
        if (String(r.__EMPTY || "").toLowerCase().includes("european average")) return r;
      }
      return null;
    };

    const row = findRegionRow(country);
    const subsidy = row && row.__EMPTY_9 ? Number(row.__EMPTY_9) : 0;

    const baseCapexPerMW = 200000 * (1 - (isFinite(subsidy) ? subsidy : 0));
    const distanceCostPerMWperKm = (offData && (offData as any).cost_per_km) || 10000;

    const totalCapex =
      (baseCapexPerMW + distanceCostPerMWperKm * intakeDistanceKm) * core.recoverableHeatMW;
    const annualOpex = totalCapex * 0.03;

    return { totalCapex, annualOpex, pipingLengthKm: intakeDistanceKm, sourceRow: row };
  }, [country, intakeDistanceKm, core.recoverableHeatMW]);

  const locations = useMemo(() => {
    const rows = (offData && (offData as any).raw_rows) || [];
    const seen = new Set<string>();
    const out: string[] = [];
    const skipKeywords = [
      "introduction","this","large","hence","should","note","in other",
      "also","for the","on the","the third","petter","so,","location",
    ];
    for (const r of rows) {
      const loc = String(r.__EMPTY || "").trim();
      if (!loc || loc.length < 3) continue;
      const l = loc.toLowerCase();
      if (skipKeywords.some((k) => l.includes(k))) continue;
      if (!seen.has(loc)) {
        seen.add(loc);
        out.push(loc);
      }
    }
    return out;
  }, []);

  const offtakeRegionInfo = useMemo(() => {
    const rows = (offData && (offData as any).raw_rows) || [];
    const headerRow = rows.find((r: any) =>
      String(r.__EMPTY || "").toLowerCase().includes("location")
    );

    const headerMap = {} as Record<string, string>;
    if (headerRow) {
      Object.keys(headerRow).forEach((k) => {
        const v = headerRow[k];
        if (v) headerMap[String(v).trim()] = k;
      });
    }

    const findRegionRow = (region: string) => {
      const key = region.toLowerCase();
      for (const r of rows) {
        const loc = String(r.__EMPTY || "").toLowerCase();
        if (loc.includes(key)) return r;
      }
      for (const r of rows) {
        if (String(r.__EMPTY || "").toLowerCase().includes("european average")) return r;
      }
      return null;
    };

    const row = findRegionRow(country);
    const get = (label: string) => (row && headerMap[label] ? row[headerMap[label]] : undefined);

    const electricity = get("1 MWh Electricity (€)");
    const gas = get("1 MWh Natural gas (€)");
    const carbonTax = get("Carbon Tax (€)");
    let payback = get("Payback period comment");

    if (!payback || String(payback).trim() === "") {
      const gasPrice = gas ? Number(gas) : undefined;
      if (gasPrice && gasPrice > 0) {
        const annualHeatMWh = core.recoverableHeatMW * 8760;
        const annualSavings = annualHeatMWh * gasPrice;
        const paybackYears = offtakeCosts.totalCapex / annualSavings;
        payback = `~${paybackYears.toFixed(1)} years (assuming gas displacement)`;
      }
    }

    return { electricity, gas, carbonTax, payback, row };
  }, [country, core.recoverableHeatMW, offtakeCosts.totalCapex]);

  // -------------------------
  // DC config scenarios list
  // -------------------------
  const dcScenarios = useMemo(() => {
    const configs = Array.isArray(dcConfigData) ? dcConfigData : [];
    const headerKey =
      "Baseline Power Consumptions Calculation for Frankfurt, Germany - Climate Zone: 5A ( Refer ASHRAE 164 & 90.4)";
    return configs.filter((r: any) => {
      const scenario = r[headerKey];
      return scenario && typeof scenario === "string" && (scenario.includes("Class") || scenario.includes("TC 9.9"));
    });
  }, []);

  // ---------------------------------------
  // DC savings / PUE / WUE / ERF / ERE model
  // ---------------------------------------
  const dcSavings = useMemo(() => {
    const erf = erfPercent / 100;
    
    // Get facility specs - use these instead of spreadsheet
    const facility = FACILITIES[dcConfig];
    if (!facility) {
      return {
        pueBaseline: null as number | null,
        pueWithHR: null as number | null,
        pueReduction: null as number | null,
        wueBaseline: null as number | null,
        wueWithHR: null as number | null,
        wueReduction: null as number | null,
        erf: erf,
        ere: null as number | null,
        annualOperationalSavings: 0,
        configName: null as string | null,
      };
    }

    const pueBaseline = facility.pueBaseline;
    const wueBaseline = facility.wueBaseline; // 0 for Fremont, >0 for water-based
    
    // Temperature adjustment factor for PUE/WUE improvements
    const tempAdjustmentFactor = Math.max(0.85, 1 - (dcReturnTempC - 25) / 100);

    // Calculate PUE with heat recovery - facility-specific improvement potential
    // Ballard (evaporative): 6% max | Osgood (hybrid): 9% max | Fremont (air-cooled): 4% max
    const pueSavingsPercent = facility.pueMaxImprovement;
    const pueWithHR = erf === 0 ? pueBaseline : pueBaseline * (1 - pueSavingsPercent * erf * tempAdjustmentFactor);

    // Calculate WUE with heat recovery  
    // For water-based cooling, heat recovery can reduce water load. For dry cooling (Fremont), no impact.
    let wueWithHR: number | null = null;
    if (wueBaseline > 0) {
      const wueSavingsPercent = 0.15; // 15% water reduction per 100% ERF for evap/hybrid (source: ASHRAE TC technical data)
      wueWithHR = erf === 0 ? wueBaseline : wueBaseline * (1 - wueSavingsPercent * erf * tempAdjustmentFactor);
    } else {
      wueWithHR = 0; // No water usage, no impact
    }

    const pueReduction = pueBaseline ? ((pueBaseline - pueWithHR) / pueBaseline) * 100 : null;
    const wueReduction = wueBaseline && wueBaseline > 0 && wueWithHR !== null 
      ? ((wueBaseline - wueWithHR) / wueBaseline) * 100 
      : null;

    // ERE heuristic based on facility cooling type
    let baseEre = 0.75; // Default for air-cooled 
    if (facility.coolingType.includes("evaporative") || facility.coolingType.includes("Evaporative")) {
      baseEre = 0.78;
    } else if (facility.coolingType.includes("evap") || facility.coolingType.includes("mech")) {
      baseEre = 0.82;
    }
    const ere = erf > 0 ? baseEre * erf : null;

    // Operational savings based on actual heat recovered
    // Factors in both recovery% (how much heat is available) AND ERF% (how much is actually utilized)
    let annualOperationalSavings = 0;
    if (core.recoverableHeatMW > 0) {
      const coolingEfficiencyFactor = 1 / coolingCOP;
      const energySavedMWh = core.recoverableHeatMW * erf * hoursPerYear * coolingEfficiencyFactor;
      annualOperationalSavings = energySavedMWh * electricityCost;
    }

    return {
      pueBaseline,
      pueWithHR,
      pueReduction,
      wueBaseline,
      wueWithHR,
      wueReduction,
      erf,
      ere,
      annualOperationalSavings,
      configName: facility.location,
    };
  }, [dcConfig, erfPercent, recoveryPct, dcScenarios, dcCity, core.recoverableHeatMW, dcReturnTempC, itLoadMW, hoursPerYear, electricityCost, coolingCOP]);

  const normalized = useMemo(() => {
    const treviM3_per_MWyr = TREVI_M3_PER_MW_YEAR_MID * perf.treviFactor;
    const uravuM3_per_MWyr = URAVU_M3_PER_MW_YEAR_MID * perf.uravuFactor;

    const dacTco2_per_MWyr = DAC_TCO2_PER_MW_YEAR * perf.dacFactor;
    const dacWaterM3_per_MWyr = DAC_WATER_M3_PER_MW_YEAR;

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

  // savings normalized per MW (avoids confusion when recoverableHeatMW != 1)
  const savingsPerMW = useMemo(() => {
    if (!core.recoverableHeatMW || core.recoverableHeatMW <= 0) return 0;
    return (dcSavings.annualOperationalSavings || 0) / core.recoverableHeatMW;
  }, [dcSavings.annualOperationalSavings, core.recoverableHeatMW]);

  // -------------------------
  // Ownership Model Comparison
  // -------------------------
  const ownershipComparison = useMemo(() => {
    const plantCosts = OFFTAKE_PLANT_COSTS[offtake];
    const heatExchangerCapex = core.recoverableHeatMW * whrCapitalCostPerMW * 1_000_000;
    const pipingCapex = Math.abs(offtakeCosts.totalCapex);
    const offtakePlantCapex = plantCosts.capexM * 1_000_000;
    const offtakePlantOpex = plantCosts.opexPerYear;

    // Calculate annual revenue based on offtake type
    let annualRevenue = 0;
    if (offtake === "dac") {
      annualRevenue = outputs.dacTco2PerYear * (dacMarketPrice - dacProcurementPrice);
    } else if (offtake === "waterTreatmentFO" || offtake === "atmosphericWater") {
      const waterVolume = offtake === "waterTreatmentFO" ? outputs.treviM3PerYear : outputs.uravuM3PerYear;
      annualRevenue = waterVolume * (waterMarketPrice - waterProductionCost);
    } else {
      // Thermal offtakes
      annualRevenue = core.annualHeatMWh * thermalEnergyPrice;
    }

    // Model A: Microsoft owns everything
    const modelA = {
      totalCapex: heatExchangerCapex + pipingCapex + offtakePlantCapex,
      annualOpex: offtakePlantOpex,
      annualRevenue: dcSavings.annualOperationalSavings + annualRevenue,
      annualProfit: dcSavings.annualOperationalSavings + annualRevenue - offtakePlantOpex,
      paybackYears: (heatExchangerCapex + pipingCapex + offtakePlantCapex) / 
        (dcSavings.annualOperationalSavings + annualRevenue - offtakePlantOpex),
    };

    // Model B: Third-party owns offtake plant
    const annualTippingFee = core.annualHeatMWh * tippingFeePerMWh;
    const modelB = {
      totalCapex: heatExchangerCapex, // Microsoft only pays for heat exchanger
      annualOpex: 0, // No offtake plant operations
      annualRevenue: dcSavings.annualOperationalSavings + annualTippingFee,
      annualProfit: dcSavings.annualOperationalSavings + annualTippingFee,
      paybackYears: heatExchangerCapex / (dcSavings.annualOperationalSavings + annualTippingFee),
      thirdPartyProfit: annualRevenue - offtakePlantOpex - annualTippingFee,
    };

    // Model C: Hybrid - Revenue share
    const msRevenueShare = annualRevenue * (revenueSharePercent / 100);
    const modelC = {
      totalCapex: heatExchangerCapex, // Microsoft pays heat exchanger, third-party pays plant
      annualOpex: 0,
      annualRevenue: dcSavings.annualOperationalSavings + msRevenueShare,
      annualProfit: dcSavings.annualOperationalSavings + msRevenueShare,
      paybackYears: heatExchangerCapex / (dcSavings.annualOperationalSavings + msRevenueShare),
      thirdPartyProfit: annualRevenue * (1 - revenueSharePercent / 100) - offtakePlantOpex,
    };

    return {
      plantCosts,
      heatExchangerCapex,
      pipingCapex,
      offtakePlantCapex,
      modelA,
      modelB,
      modelC,
    };
  }, [
    offtake,
    core.recoverableHeatMW,
    core.annualHeatMWh,
    whrCapitalCostPerMW,
    offtakeCosts.totalCapex,
    dcSavings.annualOperationalSavings,
    outputs,
    dacMarketPrice,
    dacProcurementPrice,
    waterMarketPrice,
    waterProductionCost,
    thermalEnergyPrice,
    tippingFeePerMWh,
    revenueSharePercent,
  ]);

  // PDF Export Function
  const generatePDF = async () => {
    try {
      const pdf = new jsPDF({
        format: "a4",
        unit: "mm",
        compress: true,
      });

      let yPosition = 10;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - 2 * margin;

      // Helper functions
      const addSectionTitle = (title: string, size: number = 11) => {
        yPosition += 1.5;
        pdf.setFontSize(size);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(41, 128, 185);
        pdf.text(title, margin, yPosition);
        yPosition += size / 2 + 1;
      };

      const addPageBreakIfNeeded = (spaceNeeded: number = 15) => {
        if (yPosition + spaceNeeded > pageHeight - 12) {
          pdf.addPage();
          yPosition = 10;
        }
      };

      const addPageFooter = () => {
        const footerY = pageHeight - 7;
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Page ${pdf.internal.pages.length}`, margin, footerY);
        pdf.text("Strictly for Internal Microsoft Use Only", pageWidth - margin, footerY, { align: "right" });
      };

      const loadImage = async (path: string): Promise<string | null> => {
        try {
          const response = await fetch(path);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      };

      // ============ PAGE 1: HEADER & EXECUTIVE SUMMARY ============
      yPosition = 12;

      // Disclaimer Header - Red Design, Compact
      pdf.setFillColor(220, 53, 69);
      pdf.setDrawColor(180, 30, 50);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, yPosition - 5, contentWidth, 8, "FD");
      
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.text("STRICTLY FOR INTERNAL MICROSOFT USE ONLY", pageWidth / 2, yPosition, { align: "center" });
      
      yPosition += 9;

      // Title
      pdf.setFontSize(18);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(41, 128, 185);
      pdf.text("Waste Heat Reuse (WHR) Calculator", pageWidth / 2, yPosition, { align: "center" });
      yPosition += 7;

      // Executive Summary Box
      pdf.setFillColor(240, 248, 255);
      pdf.setDrawColor(41, 128, 185);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, yPosition, contentWidth, 30, "FD");

      pdf.setFontSize(9);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(41, 128, 185);
      pdf.text("EXECUTIVE SUMMARY", margin + 2, yPosition + 4);

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);
      const summaryLines = [
        `Offtake: ${OFFTAKE_LABEL[offtake]}`,
        `Heat: ${core.recoverableHeatMW.toFixed(2)} MW | Annual: ${fmtInt(core.annualHeatMWh)} MWh/yr | Savings: $${fmtInt(dcSavings.annualOperationalSavings)}/yr`,
        `Investment: $${(ownershipComparison.modelA.totalCapex / 1_000_000).toFixed(1)}M | Payback: ${ownershipComparison.modelA.paybackYears.toFixed(1)} yrs | Facility: ${dcConfig}`,
      ];
      summaryLines.forEach((line, idx) => {
        pdf.text(line, margin + 2, yPosition + 9 + idx * 5);
      });

      yPosition += 33;

      addSectionTitle("1. INPUTS & KEY METRICS", 10);

      // Two-column metrics layout
      const col1 = margin;
      const col2 = margin + contentWidth / 2;

      const metrics = [
        [
          `IT Load: ${itLoadMW} MW`,
          `Recovery: ${recoveryPct}%`,
          `Hours/yr: ${hoursPerYear}`,
          `Return Temp: ${dcReturnTempC}C`,
        ],
        [
          `Heat Power: ${core.recoverableHeatMW.toFixed(2)} MW`,
          `Delta T: ${core.dcDeltaT.toFixed(1)}C`,
          `COP: ${coolingCOP}`,
          `Electric Cost: $${electricityCost}/MWh`,
        ],
      ];

      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);

      metrics[0].forEach((line, idx) => {
        pdf.text(line, col1, yPosition + idx * 4);
      });
      metrics[1].forEach((line, idx) => {
        pdf.text(line, col2, yPosition + idx * 4);
      });

      yPosition += 19;

      addSectionTitle("2. DC EFFICIENCY & FINANCIAL SUMMARY", 10);

      // PUE/WUE summary
      pdf.setFontSize(7.5);
      const effSummary = [
        `PUE: ${dcSavings.pueBaseline?.toFixed(3)} -> ${dcSavings.pueWithHR?.toFixed(3)} (-${dcSavings.pueReduction?.toFixed(1)}%)`,
        `WUE: ${dcSavings.wueBaseline?.toFixed(3) || "N/A"} -> ${dcSavings.wueWithHR?.toFixed(3) || "N/A"} ${dcSavings.wueReduction ? `(-${dcSavings.wueReduction.toFixed(1)}%)` : ""}`,
      ];
      effSummary.forEach((line, idx) => {
        pdf.text(line, col1, yPosition + idx * 4);
      });

      // Financial summary
      const finSummary = [
        `Model A CapEx: $${(ownershipComparison.modelA.totalCapex / 1_000_000).toFixed(1)}M`,
        `Model A Payback: ${ownershipComparison.modelA.paybackYears.toFixed(1)} years`,
      ];
      finSummary.forEach((line, idx) => {
        pdf.text(line, col2, yPosition + idx * 4);
      });

      yPosition += 12;

      // Financial Models Table (compact)
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(41, 128, 185);
      pdf.text("Financial Models Comparison", margin, yPosition);

      yPosition += 4;
      
      // Table header with borders
      pdf.setFillColor(41, 128, 185);
      pdf.setDrawColor(25, 80, 150);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, yPosition - 3, contentWidth, 3.5, "FD");
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.text("Model", margin + 2, yPosition);
      pdf.text("CapEx", margin + 50, yPosition, { align: "right" });
      pdf.text("OpEx/yr", margin + 80, yPosition, { align: "right" });
      pdf.text("Payback", margin + 110, yPosition, { align: "right" });

      yPosition += 4;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");
      pdf.setLineWidth(0.3);
      pdf.setDrawColor(200, 200, 200);

      const modelSummary = [
        ["Model A: MS-Owned", `$${(ownershipComparison.modelA.totalCapex / 1_000_000).toFixed(1)}M`, `$${(ownershipComparison.modelA.annualOpex / 1000).toFixed(0)}K`, `${ownershipComparison.modelA.paybackYears.toFixed(1)} yrs`],
        ["Model B: 3rd-Party", `$${(ownershipComparison.modelB.totalCapex / 1_000_000).toFixed(1)}M`, `$${(ownershipComparison.modelB.annualOpex / 1000).toFixed(0)}K`, `${ownershipComparison.modelB.paybackYears.toFixed(1)} yrs`],
        ["Model C: Hybrid", `$${(ownershipComparison.modelC.totalCapex / 1_000_000).toFixed(1)}M`, `$${(ownershipComparison.modelC.annualOpex / 1000).toFixed(0)}K`, `${ownershipComparison.modelC.paybackYears.toFixed(1)} yrs`],
      ];

      modelSummary.forEach((row, idx) => {
        const bgColor = idx % 2 === 0 ? [250, 250, 250] : [245, 245, 245];
        pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        pdf.rect(margin, yPosition - 2.8, contentWidth, 3.5, "F");
        pdf.rect(margin, yPosition - 2.8, contentWidth, 3.5, "D");
        pdf.setFontSize(7);
        pdf.text(row[0], margin + 2, yPosition);
        pdf.text(row[1], margin + 48, yPosition, { align: "right" });
        pdf.text(row[2], margin + 78, yPosition, { align: "right" });
        pdf.text(row[3], margin + 108, yPosition, { align: "right" });
        yPosition += 4;
      });

      yPosition += 3;

      // Inline images - small and compact
      addPageBreakIfNeeded(30);

      // Two images side-by-side if available
      let offtakeImagePath = "";
      if (offtake === "dac") offtakeImagePath = "/Images/dac-plant.jpg";
      else if (offtake === "waterTreatmentFO") offtakeImagePath = "/Images/trevi-fo.jpg";
      else if (offtake === "atmosphericWater") offtakeImagePath = "/Images/uravu-awh.jpg";
      else if (offtake === "greenhouses") offtakeImagePath = "/Images/greenhouse.jpg";

      const imgWidth = (contentWidth - 3) / 2;
      const imgHeight = 30;

      addSectionTitle("3. SYSTEM OVERVIEW", 10);

      if (offtakeImagePath) {
        const offtakeImage = await loadImage(offtakeImagePath);
        if (offtakeImage) {
          pdf.addImage(offtakeImage, "JPEG", margin, yPosition, imgWidth, imgHeight);
          pdf.setFontSize(6.5);
          pdf.setTextColor(60, 60, 60);
          pdf.text("Selected Offtake", margin + 1, yPosition + imgHeight + 2);
        }
      }

      const hxImage = await loadImage("/Images/Heat Exchanger Example.jpg");
      if (hxImage) {
        pdf.addImage(hxImage, "JPEG", margin + imgWidth + 3, yPosition, imgWidth, imgHeight);
        pdf.setFontSize(6.5);
        pdf.setTextColor(60, 60, 60);
        pdf.text("Heat Exchanger", margin + imgWidth + 4, yPosition + imgHeight + 2);
      }

      yPosition += imgHeight + 6;

      const pipingImage = await loadImage("/Images/Offtake piping example.jpg");
      if (pipingImage) {
        pdf.addImage(pipingImage, "JPEG", margin, yPosition, imgWidth, imgHeight);
        pdf.setFontSize(6.5);
        pdf.setTextColor(60, 60, 60);
        pdf.text("Piping Infrastructure", margin + 1, yPosition + imgHeight + 2);
      }

      yPosition += imgHeight + 6;

      addPageBreakIfNeeded(50);

      addSectionTitle("4. OFFTAKE PERFORMANCE", 10);

      pdf.setFontSize(7.5);
      let perfLines: string[] = [];
      if (offtake === "dac") {
        perfLines = [
          `CO2 Captured: ${fmtInt(outputs.dacTco2PerYear)} tCO2/yr (${fmtInt(normalized.dacTco2_per_MWyr)}/MW-yr)`,
          `Water Byproduct: ${fmtInt(outputs.dacWaterM3PerYear)} m3/yr`,
        ];
      } else if (offtake === "waterTreatmentFO") {
        perfLines = [
          `Treated Water: ${fmtInt(outputs.treviM3PerYear)} m3/yr (${fmtInt(normalized.treviM3_per_MWyr)}/MW-yr)`,
          `People Equiv.: ~${fmtInt(outputs.treviPeoplePerYear)} people/yr`,
        ];
      } else if (offtake === "atmosphericWater") {
        perfLines = [
          `Captured Water: ${fmtInt(outputs.uravuM3PerYear)} m3/yr (${fmtInt(normalized.uravuM3_per_MWyr)}/MW-yr)`,
          `People Equiv.: ~${fmtInt(outputs.uravuPeoplePerYear)} people/yr`,
        ];
      } else if (offtake === "districtHeat") {
        perfLines = [`Homes Heated: ${fmtInt(outputs.homesHeated)} homes/yr (${fmtInt(normalized.homes_per_MWyr)}/MW-yr)`];
      } else if (offtake === "greenhouses") {
        perfLines = [`Greenhouse Area: ${fmt2(outputs.greenhouseHa)} ha (${fmt2(normalized.greenhouseHa_per_MWyr)}/MW-yr)`];
      }

      perfLines.forEach((line, idx) => {
        pdf.text(`• ${line}`, margin + 2, yPosition + idx * 3.5);
      });

      yPosition += Math.max(perfLines.length * 3.5, 10);

      addSectionTitle("5. CO2 IMPACT COMPARISON", 10);

      // CO2 table with professional styling
      pdf.setFillColor(41, 128, 185);
      pdf.setDrawColor(25, 80, 150);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, yPosition - 3, contentWidth, 3.5, "FD");
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      pdf.text("Offtake Type", margin + 2, yPosition);
      pdf.text("Min (tCO2/MWyr)", margin + 75, yPosition);
      pdf.text("Avg", margin + 110, yPosition);
      pdf.text("Max", margin + 130, yPosition);

      yPosition += 4;
      pdf.setTextColor(0, 0, 0);
      pdf.setFont("helvetica", "normal");
      pdf.setLineWidth(0.3);
      pdf.setDrawColor(200, 200, 200);

      const co2Data = [
        ["DAC", DAC_CO2_KT_RANGE.min, DAC_CO2_KT_RANGE.max],
        ["FO Treatment", FO_CO2_KT_RANGE.min, FO_CO2_KT_RANGE.max],
        ["Food & Beverage", FNB_CO2_KT_RANGE.min, FNB_CO2_KT_RANGE.max],
        ["Atmospheric Water", AWH_CO2_KT_RANGE.min, AWH_CO2_KT_RANGE.max],
        ["Greenhouses", GREENHOUSE_CO2_KT_PER_MWYR_RANGE.min, GREENHOUSE_CO2_KT_PER_MWYR_RANGE.max],
        ["District Heat", DISTRICT_HEAT_CO2_KT_RANGE.min, DISTRICT_HEAT_CO2_KT_RANGE.max],
      ];

      co2Data.forEach((row, idx) => {
        const isSelected = (offtake === "dac" && row[0] === "DAC") ||
                          (offtake === "waterTreatmentFO" && row[0] === "FO Treatment") ||
                          (offtake === "atmosphericWater" && row[0] === "Atmospheric Water") ||
                          (offtake === "greenhouses" && row[0] === "Greenhouses") ||
                          (offtake === "foodBrewery" && row[0] === "Food & Beverage") ||
                          (offtake === "districtHeat" && row[0] === "District Heat");
        
        const bgcolor = isSelected ? [220, 240, 255] : (idx % 2 === 0 ? [250, 250, 250] : [245, 245, 245]);
        pdf.setFillColor(bgcolor[0], bgcolor[1], bgcolor[2]);
        pdf.rect(margin, yPosition - 2.5, contentWidth, 3.2, "F");
        pdf.rect(margin, yPosition - 2.5, contentWidth, 3.2, "D");
        
        const mid = ((row[1] as number) + (row[2] as number)) / 2;
        pdf.setFontSize(6.5);
        pdf.text(row[0] as string, margin + 2, yPosition);
        pdf.text((row[1] as number).toFixed(2), margin + 80, yPosition);
        pdf.text(mid.toFixed(2), margin + 112, yPosition);
        pdf.text((row[2] as number).toFixed(2), margin + 133, yPosition);
        yPosition += 3.5;
      });

      yPosition += 2;

      // Final Disclaimer - Professional Red Design
      pdf.setFillColor(255, 245, 245);
      pdf.setDrawColor(220, 53, 69);
      pdf.setLineWidth(0.8);
      pdf.rect(margin, yPosition, contentWidth, 10, "FD");

      pdf.setFontSize(7);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(180, 30, 50);
      pdf.text("DISCLAIMER", margin + 2, yPosition + 2);

      pdf.setFontSize(6);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(40, 40, 40);
      const disclaimerText = "This report is strictly for internal Microsoft use only. Data is provided for feasibility screening purposes. Project-specific engineering analysis and vendor quotes are required for any investment decisions.";
      const disclaimerLines = pdf.splitTextToSize(disclaimerText, contentWidth - 4) as string[];
      (disclaimerLines as string[]).forEach((line: string, idx: number) => {
        if (idx < 2) pdf.text(line, margin + 2, yPosition + 5.5 + idx * 2);
      });

      // Add footer to all pages
      const totalPages = (pdf as any).internal.pages.length;
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        (pdf as any).setPage(pageNum);
        const footerY = pageHeight - 7;
        pdf.setFontSize(7);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont("helvetica", "normal");
        pdf.text(`Page ${pageNum}`, margin, footerY);
        pdf.text("Strictly for Internal Microsoft Use Only", pageWidth - margin, footerY, { align: "right" });
      }

      // Save PDF
      const createdDate = new Date().toLocaleDateString();
      pdf.save(`WHR-Report-${OFFTAKE_LABEL[offtake]}-${createdDate}.pdf`);
    } catch (error) {
      console.error("PDF generation error:", error);
      alert("Error generating PDF. Please check the browser console.");
    }
  };

  const generateFaqPdf = () => {
    try {
      const pdf = new jsPDF({
        format: "a4",
        unit: "mm",
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const contentWidth = pageWidth - margin * 2;
      const lineGap = 5.5;
      let yPosition = 14;

      const addPageBreakIfNeeded = (spaceNeeded: number = 10) => {
        if (yPosition + spaceNeeded > pageHeight - 12) {
          pdf.addPage();
          yPosition = 14;
        }
      };

      const addDivider = () => {
        addPageBreakIfNeeded(6);
        pdf.setDrawColor(220, 230, 245);
        pdf.setLineWidth(0.4);
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 4;
      };

      const addTextBlock = (
        text: string,
        size: number,
        style: "normal" | "bold",
        color: [number, number, number],
        gap: number = lineGap
      ) => {
        pdf.setFontSize(size);
        pdf.setFont("helvetica", style);
        pdf.setTextColor(color[0], color[1], color[2]);
        const lines = pdf.splitTextToSize(text, contentWidth);
        addPageBreakIfNeeded(lines.length * gap);
        pdf.text(lines, margin, yPosition);
        yPosition += lines.length * gap;
      };

      const addTitle = (text: string) => {
        pdf.setFillColor(41, 128, 185);
        pdf.rect(margin, yPosition - 6, contentWidth, 10, "F");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(15);
        pdf.text(text, margin + 4, yPosition, { baseline: "middle" });
        yPosition += 10;
        pdf.setTextColor(70, 70, 70);
      };

      const addSection = (text: string) => {
        addTextBlock(text, 13, "bold", [30, 30, 30], 6);
      };

      const addSubsection = (text: string) => {
        addTextBlock(text, 11.5, "bold", [60, 60, 60], 5.2);
      };

      const addQuestion = (text: string) => {
        addTextBlock(`Q: ${text}`, 10.5, "bold", [20, 20, 20], 4.8);
      };

      const addAnswer = (text: string) => {
        addTextBlock(`A: ${text}`, 10.2, "normal", [70, 70, 70], 4.6);
        yPosition += 2;
      };

      addTitle("WHR Offtakes FAQ");
      addTextBlock(`Generated: ${new Date().toLocaleDateString()}`, 9.5, "normal", [110, 110, 110], 4.6);
      yPosition += 3;
      addDivider();

      addSection("General FAQ");
      FAQ_GENERAL_SECTIONS.forEach((section) => {
        addSubsection(section.title);
        section.items.forEach((item) => {
          addQuestion(item.q);
          addAnswer(item.a);
        });
        addDivider();
      });

      faqOfftakeOptions.forEach((key) => {
        addSection(`${OFFTAKE_LABEL[key]} FAQ`);
        const sections = FAQ_OFFTAKE_SECTIONS[key] || [];
        if (!sections.length) {
          addTextBlock("No FAQs available yet.", 10.2, "normal", [90, 90, 90], 4.6);
        }
        sections.forEach((section) => {
          addSubsection(section.title);
          section.items.forEach((item) => {
            addQuestion(item.q);
            addAnswer(item.a);
          });
          addDivider();
        });
      });

      pdf.save("WHR_Offtakes_FAQ.pdf");
    } catch (error) {
      console.error("Failed to generate FAQ PDF", error);
    }
  };

  const faqOfftakeOptions: Offtake[] = [
    "waterTreatmentFO",
    "atmosphericWater",
    "dac",
    "districtHeat",
    "greenhouses",
    "foodBrewery",
    "hotWater",
  ];

  const [faqOfftake, setFaqOfftake] = useState<Offtake>("waterTreatmentFO");

  type FaqItem = { q: string; a: string };
  type FaqSection = { title: string; items: FaqItem[] };

  const FAQ_GENERAL_SECTIONS: FaqSection[] = [
    {
      title: "What is WHR and how does it work?",
      items: [
        {
          q: "What does WHR offtake mean in this calculator?",
          a: "An offtake is a beneficial use of recovered data center heat, such as water treatment, district heat, DAC, or greenhouses.",
        },
        {
          q: "How is recoverable heat calculated?",
          a: "Recoverable heat equals IT load (MW) times the heat recovery percent. Annual heat is that value times operating hours.",
        },
        {
          q: "How do operating hours affect results?",
          a: "Operating hours scale annual MWh, savings, and offtake outputs linearly. Default is 8760 hours per year.",
        },
        {
          q: "What temperatures matter in the model?",
          a: "Return temperature drives performance ramps for offtakes. Higher return temperatures generally improve output.",
        },
      ],
    },
    {
      title: "How do cost, payback, and efficiency metrics work?",
      items: [
        {
          q: "What drives DC operational savings?",
          a: "Savings are modeled as recoverable heat times operating hours times (1/COP) times regional electricity cost.",
        },
        {
          q: "What does the COP slider represent?",
          a: "COP is cooling efficiency. Higher COP reduces the per-MWh savings from avoided cooling energy.",
        },
        {
          q: "What is ERF and how does it change PUE?",
          a: "ERF is the energy reuse fraction. Higher ERF increases the modeled PUE improvement up to the facility max.",
        },
        {
          q: "Why are PUE gains different by facility?",
          a: "Each facility has a different cooling architecture and baseline PUE, so the maximum improvement differs.",
        },
        {
          q: "How is WUE improvement modeled?",
          a: "WUE improves only for evaporative or hybrid systems and scales with ERF; air-cooled systems show no WUE change.",
        },
        {
          q: "How are payback periods computed?",
          a: "Payback is total CapEx divided by annual operational savings plus annual offtake revenue.",
        },
      ],
    },
    {
      title: "How should I interpret normalized performance?",
      items: [
        {
          q: "What is normalized performance and why per MW-year?",
          a: "Normalized metrics express outputs per MW-year so projects of different size can be compared directly.",
        },
        {
          q: "How are people-served equivalents computed?",
          a: "Water output is divided by per-capita use (Phoenix GPCD default) to estimate an equivalent population served.",
        },
        {
          q: "How is the district heating homes estimate derived?",
          a: "Annual heat available is divided by a typical home heating load (about 14.5 MWh per home per year).",
        },
      ],
    },
  ];

  const treviThroughputMinMliters = TREVI_L_PER_MW_YEAR_RANGE.min / 1_000_000;
  const treviThroughputMaxMliters = TREVI_L_PER_MW_YEAR_RANGE.max / 1_000_000;
  const treviThroughputMidM3 = TREVI_M3_PER_MW_YEAR_MID;

  const fmtOrDash = (value: number | null, decimals = 2) => {
    if (value === null || Number.isNaN(value)) return "—";
    return value.toFixed(decimals);
  };

  const FAQ_OFFTAKE_SECTIONS: Record<Offtake, FaqSection[]> = {
    waterTreatmentFO: [
      {
        title: "How does the FO water treatment system work?",
        items: [
          {
            q: "What is the Waste Water Treatment System (FO) offtake?",
            a: "It uses recovered heat to drive a forward osmosis based treatment system to produce clean water.",
          },
          {
            q: "What throughput does the FO system deliver per MW-year?",
            a: "The model uses a range of 255 to 365 million liters per MW-year, with a mid-point used for summaries.",
          },
          {
            q: "How does temperature affect FO performance?",
            a: "FO output scales with a temperature factor; higher return temperatures improve the modeled throughput.",
          },
          {
            q: "What water quality does FO target?",
            a: "FO is modeled for wastewater treatment and desalination style inputs; final quality depends on post-treatment polishing.",
          },
          {
            q: "What are the key system components?",
            a: "The model assumes an FO plant, heat pump, and balance of plant equipment sized to recovered heat.",
          },
        ],
      },

      {
        title: "What are the costs and PUE/payback impacts?",
        items: [
          {
            q: "What are the FO cost and LCOW assumptions?",
            a: "CapEx is about $3.06M with about $256k per year OpEx, and LCOW is assumed at $3.29 to $3.68 per m3.",
          },
          {
            q: "How does FO affect DC payback?",
            a: "FO adds water revenue to operational savings, shortening payback when market water price exceeds LCOW.",
          },
          {
            q: "Does FO change PUE directly?",
            a: "PUE improvements come from heat reuse fraction, not the FO process itself. FO benefits from higher reuse.",
          },
          {
            q: "How does FO affect WUE?",
            a: "FO does not reduce cooling water directly, but enables water production that can offset site water demand.",
          },
        ],
      },
      {
        title: "How does FO improve DC performance?",
        items: [
          {
            q: "What DC performance benefits does FO enable?",
            a: "It monetizes low-grade heat, increases overall reuse fraction, and can improve project economics.",
          },
          {
            q: "Is FO compatible with lower return temperatures?",
            a: "Yes, but outputs scale down as return temperature drops, which reduces water yield and revenue.",
          },
          {
            q: "How does FO compare to atmospheric water capture?",
            a: "FO has higher modeled throughput per MW-year, while atmospheric capture is more modular.",
          },
          {
            q: "What local factors matter most?",
            a: "Water scarcity pricing, wastewater availability, and integration distance drive feasibility.",
          },
        ],
      },
    ],
    atmosphericWater: [
      {
        title: "What details are coming for atmospheric water capture?",
        items: [
          {
            q: "When will atmospheric water capture FAQs be added?",
            a: "This section will be expanded after the water treatment system review is finalized.",
          },
        ],
      },
    ],
    dac: [
      {
        title: "What details are coming for DAC?",
        items: [
          {
            q: "When will DAC FAQs be added?",
            a: "DAC details will be added once project-specific assumptions are confirmed.",
          },
        ],
      },
    ],
    districtHeat: [
      {
        title: "What details are coming for district heat?",
        items: [
          {
            q: "When will district heat FAQs be added?",
            a: "District heat FAQs will be added after regional network assumptions are finalized.",
          },
        ],
      },
    ],
    greenhouses: [
      {
        title: "What details are coming for greenhouses?",
        items: [
          {
            q: "When will greenhouse FAQs be added?",
            a: "Greenhouse FAQs will be added after partner crop and climate assumptions are finalized.",
          },
        ],
      },
    ],
    foodBrewery: [
      {
        title: "Is food and beverage a good fit for WHR?",
        items: [
          {
            q: "Why is food and beverage a strong heat offtake sector?",
            a: "It is a large employer in Europe with substantial low- to medium-temperature heat demand; heat needs are often around two-thirds of total site energy.",
          },
          {
            q: "What is typical thermal demand per facility?",
            a: "Most large sites top out around 8-10 MW of thermal demand, including industrial cooling loads.",
          },
          {
            q: "Which processes are most compatible with data center heat?",
            a: "Cleaning, process heat, and pasteurization are common fits; very high-temperature processes like baking or drying are generally not a match unless output temperatures rise.",
          },
        ],
      },
      {
        title: "How close are sites and how are they selected?",
        items: [
          {
            q: "How close are food and beverage sites to Microsoft data centers?",
            a: "The proximity analysis found about 50% of Microsoft data centers in Europe within 3 km of a food and beverage manufacturing site, about 23% within 1 km, and all within 10 km.",
          },
          {
            q: "Why does distance matter so much?",
            a: "Shorter piping reduces heat loss and capital costs, which is critical for low-grade heat reuse economics.",
          },
          {
            q: "How can projects scale beyond 8-10 MW offtakers?",
            a: "Options include serving multiple facilities in an industrial park or partnering with multi-site corporations; cooling loads can also expand the opportunity set.",
          },
        ],
      },
      {
        title: "What heat integration assumptions are used?",
        items: [
          {
            q: "What temperature ranges are assumed?",
            a: "The primary scenario assumes 30°C data center output, with a future 65°C scenario; many food and beverage processes use 60-80°C water, with pasteurization around 90°C.",
          },
          {
            q: "Are heat pumps required?",
            a: "Yes in the 30°C scenario; the base case assumes a COP around 3.3. Delivering 8 MW of heat uses about 5.6 MW from the data center plus 2.4 MW of electricity.",
          },
          {
            q: "What return temperature is assumed for the data center loop?",
            a: "The analysis assumes return water at 18°C or lower.",
          },
        ],
      },
      {
        title: "What are the economics and partner readiness signals?",
        items: [
          {
            q: "What payback ranges are expected?",
            a: "The report indicates data center paybacks can be under 1 year, while offtaker paybacks are typically 2-5 years depending on pricing and incentives.",
          },
          {
            q: "What did interviews indicate about partner readiness?",
            a: "Seven major food and beverage companies expressed interest, all have heat pumps at at least one site, and most target ~3-year paybacks with flexibility for sustainability; they need clear temperature, quantity, and reliability commitments.",
          },
        ],
      },
    ],
    hotWater: [
      {
        title: "What details are coming for hot water?",
        items: [
          {
            q: "When will hot water FAQs be added?",
            a: "Hot water FAQs will be added after system sizing assumptions are finalized.",
          },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      {/* Microsoft Confidential Banner */}
      <div className="mb-6 bg-red-100 border-2 border-red-600 rounded-lg p-4">
        <p className="text-red-900 font-bold text-center">
          🔒 MICROSOFT CONFIDENTIAL
        </p>
        <p className="text-red-800 text-sm text-center mt-2">
          This calculator provides order-of-magnitude estimates for feasibility screening only. Project-specific engineering, climate data, and vendor quotes are required for investment decisions.
        </p>
      </div>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Waste Heat Reuse (WHR) Calculator
          </h1>
          <p className="mt-1 text-slate-600">
            Clean output cards + normalized metrics + CO₂ chart. DC facility temperature influences offtake performance.
          </p>
        </div>
        <button
          onClick={generatePDF}
          disabled={!offtake}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-sm font-medium whitespace-nowrap"
        >
          📥 Download PDF Report
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Recoverable heat power" value={`${core.recoverableHeatMW.toFixed(2)} MW`} sub="IT load — recovery%" />
        <StatTile label="Annual recoverable heat" value={`${fmtInt(core.annualHeatMWh)} MWh/yr`} sub="Power — operating hours" />
        <StatTile label="Effective MW·yr" value={`${core.effectiveMWyr.toFixed(2)}`} sub="Scaled by hours / 8760" />
        <StatTile label="DC facility ΔT" value={`${core.dcDeltaT.toFixed(0)} °C`} sub={`Return ${dcReturnTempC}°C, supply ${dcSupplyTempC}°C`} />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {[
          { id: "whr-results", label: "Results" },
          { id: "whr-inputs", label: "Inputs" },
          { id: "whr-savings", label: "DC savings" },
          { id: "whr-piping", label: "Piping" },
          { id: "whr-revenue", label: "Revenue" },
          { id: "whr-ownership", label: "Ownership" },
          { id: "whr-performance", label: "Performance" },
          { id: "whr-proximity", label: "Proximity" },
          { id: "whr-assumptions", label: "Assumptions" },
          { id: "whr-faq", label: "FAQ" },
        ].map((tab) => (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 shadow-sm hover:border-sky-300 hover:bg-sky-100"
          >
            {tab.label}
          </a>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Results + Offtake Preview */}
        <div className="lg:col-span-2 space-y-6">
          <div id="whr-results">
            <Card
              title={`Results — ${OFFTAKE_LABEL[offtake]}`}
              collapsible={true}
              defaultExpanded={true}
            >
            <div className="grid gap-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  Offtake outputs
                </div>

                {offtake === "dac" ? (
                  <div className="mt-3 space-y-3">
                    <MetricRow
                      label="CO₂ captured"
                      value={`${fmtInt(outputs.dacTco2PerYear)} tCO₂/yr`}
                      sub={`Temp factor ×${fmt2(perf.dacFactor)} (ramps toward ~${DAC_RELEASE_TEMP_C}°C)`}
                    />
                    <MetricRow
                      label="Water captured"
                      value={`${fmtInt(outputs.dacWaterM3PerYear)} m³/yr`}
                      sub={`Uses ${DAC_WATER_M3_PER_TCO2} m³ water per tCO₂`}
                    />
                    <MetricRow
                      label="Phoenix equivalent"
                      value={`~${fmtInt(outputs.dacPeoplePerYear)} people/yr`}
                      sub={`${phxGpcd} gal/person/day`}
                    />
                  </div>
                ) : null}

                {offtake === "waterTreatmentFO" ? (
                  <div className="mt-3 space-y-3">
                    <MetricRow
                      label="Treated water (midpoint)"
                      value={`${fmtInt(outputs.treviM3PerYear)} m³/yr`}
                      sub={`Temp factor —${fmt2(perf.treviFactor)} (30→45°C improvement model)`}
                    />
                    <MetricRow
                      label="Phoenix equivalent"
                      value={`~${fmtInt(outputs.treviPeoplePerYear)} people/yr`}
                      sub={`${phxGpcd} gal/person/day`}
                    />
                  </div>
                ) : null}

                {offtake === "atmosphericWater" ? (
                  <div className="mt-3 space-y-3">
                    <MetricRow
                      label="Captured water (midpoint)"
                      value={`${fmtInt(outputs.uravuM3PerYear)} m³/yr`}
                      sub={`Temp factor —${fmt2(perf.uravuFactor)} (30â†’55°C envelope)`}
                    />
                    <MetricRow
                      label="Phoenix equivalent"
                      value={`~${fmtInt(outputs.uravuPeoplePerYear)} people/yr`}
                      sub={`${phxGpcd} gal/person/day`}
                    />
                  </div>
                ) : null}

                {offtake === "districtHeat" ? (
                  <div className="mt-3 space-y-3">
                    <MetricRow label="Homes heated" value={`${fmtInt(outputs.homesHeated)} homes/yr`} />
                    <MetricRow
                      label="Heat-grade note"
                      value={dcReturnTempC >= 65 ? "Higher grade (less lift)" : "Likely needs lift"}
                      sub="District heating supply temps often higher than DC loop."
                    />
                  </div>
                ) : null}

                {offtake === "greenhouses" ? (
                  <div className="mt-3 space-y-3">
                    <MetricRow
                      label="Greenhouse area heated"
                      value={`${fmt1(outputs.greenhouseHa)} hectares`}
                      sub={`Temp factor —${fmt2(perf.greenhouseFactor)}`}
                    />
                    <MetricRow
                      label="CO₂ avoided (range)"
                      value={`${GREENHOUSE_CO2_KT_PER_MWYR_RANGE.min.toFixed(2)}—${GREENHOUSE_CO2_KT_PER_MWYR_RANGE.max.toFixed(2)} kt/MW·yr`}
                      sub="Seasonal capacity-factor adjusted range."
                    />
                  </div>
                ) : null}

                {offtake === "foodBrewery" ? (
                  <div className="mt-3 space-y-3">
                    <MetricRow
                      label="Process temp suitability"
                      value={dcReturnTempC < 80 ? "Many steps need lift" : "More direct use"}
                      sub="Higher temp improves process compatibility."
                    />
                    <MetricRow
                      label="CO₂ avoided (range)"
                      value={`${FNB_CO2_KT_RANGE.min.toFixed(2)}—${FNB_CO2_KT_RANGE.max.toFixed(2)} kt/MW·yr`}
                      sub="Best-effort range."
                    />
                  </div>
                ) : null}

                {offtake === "hotWater" ? (
                  <div className="mt-3 text-sm text-slate-700 whitespace-normal break-words">
                    Hot-water equivalence is a physical reference; CO₂ impact depends on the displaced heat source.
                  </div>
                ) : null}

                {potentialCO2 ? (
                  <div className="mt-4 border-t pt-3">
                    <div className="text-sm font-semibold text-slate-900 mb-2">
                      Potential CO₂ avoided
                    </div>
                    {potentialCO2.kind === "dac" ? (
                      <MetricRow label="Estimated CO₂ captured" value={`${fmtInt(Number((potentialCO2 as any).tco2 || 0))} tCO₂/yr`} />
                    ) : (
                      <MetricRow
                        label="Estimated CO₂ avoided"
                        value={`${Number((potentialCO2 as any).minKt || 0).toFixed(2)}—${Number((potentialCO2 as any).maxKt || 0).toFixed(2)} ktCO₂/yr`}
                        sub={`Mid: ${Number((potentialCO2 as any).midKt || 0).toFixed(2)} ktCO₂/yr`}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
          </div>

          <Card title="Offtake preview">
            <OfftakePreview 
              offtake={offtake} 
              dcFacilityTempC={dcReturnTempC} 
              costData={OFFTAKE_PLANT_COSTS[offtake]}
            />
          </Card>
        </div>

        {/* RIGHT COLUMN: Offtake Selector + Inputs */}
        <div className="space-y-6">
          <Card
            title="WHR Offtake Application"
            titleClassName="whitespace-nowrap"
            tooltip="Hover this card to see how each offtake helps the offtaker, the DC, and the community."
          >
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Choose an offtake application
              </label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                value={offtake}
                onChange={(e) => setOfftake(e.target.value as Offtake)}
              >
                {Object.entries(OFFTAKE_LABEL).map(([k, v]) => {
                  const key = k as Offtake;
                  return (
                    <option key={k} value={k} title={OFFTAKE_HELP[key]}>
                      {v}
                    </option>
                  );
                })}
              </select>
              <div className="text-[11px] leading-snug text-slate-600">
                Note: {OFFTAKE_HELP[offtake]}
              </div>
            </div>
          </Card>

          <div id="whr-inputs">
            <Card
              title="Inputs"
              collapsible={true}
              defaultExpanded={true}
            >
            <div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setInputTab("dc")}
                  className={`px-3 py-1 rounded ${inputTab === "dc" ? "bg-slate-100 font-medium" : "bg-white"}`}
                >
                  DC & IT
                </button>
                <button
                  onClick={() => setInputTab("offtake")}
                  className={`px-3 py-1 rounded ${inputTab === "offtake" ? "bg-slate-100 font-medium" : "bg-white"}`}
                >
                  Offtake & Piping
                </button>
              </div>

              {inputTab === "dc" ? (
                <>
                  <SliderRow label="IT load" value={itLoadMW} setValue={setItLoadMW} min={0} max={200} step={0.5} unit="MW" decimals={1} />
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      DC location
                    </label>
                    <select
                      value={dcCity}
                      onChange={(e) => {
                        const newCity = e.target.value;
                        setDcCity(newCity);
                        const loc = DC_LOCATIONS[newCity];
                        if (loc) {
                          setElectricityCost(loc.electricityCostPerMWh);
                          setGridEfKgPerKwh(loc.gridEfKgPerKwh);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    >
                      <optgroup label="US">
                        {Object.entries(DC_LOCATIONS)
                          .filter(([, v]) => v.region === "US")
                          .map(([key, v]) => (
                            <option key={key} value={key}>
                              {v.label} - ${v.electricityCostPerMWh}/MWh
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Europe">
                        {Object.entries(DC_LOCATIONS)
                          .filter(([, v]) => v.region === "Europe")
                          .map(([key, v]) => (
                            <option key={key} value={key}>
                              {v.label} - ${v.electricityCostPerMWh}/MWh
                            </option>
                          ))}
                      </optgroup>
                    </select>
                    {selectedDcLocation ? (
                      <div className="mt-2 text-xs text-slate-600">
                        Electricity: ${selectedDcLocation.electricityCostPerMWh}/MWh | Grid: {Math.round(selectedDcLocation.gridEfKgPerKwh * 1000)} g CO2e/kWh
                      </div>
                    ) : null}
                  </div>
                  <SliderRow label="Heat capture / recovery" value={recoveryPct} setValue={setRecoveryPct} min={0} max={100} step={1} unit="%" />
                  <SliderRow label="Operating hours per year" value={hoursPerYear} setValue={setHoursPerYear} min={6000} max={8760} step={100} unit="hrs" helper="24/7/365 = 8,760 hrs. Adjust for planned maintenance or seasonal operation." />
                  <SliderRow
                    label="DC facility return water temperature"
                    value={dcReturnTempC}
                    setValue={(n) => setDcReturnTempC(Math.max(0, Math.min(n, 79)))}
                    min={0}
                    max={79}
                    step={1}
                    unit="°C"
                    helper="Return temperature used for offtake calculations; ΔT is calculated as return − supply."
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

                </>
              ) : (
                <div className="text-sm text-slate-600">
                  Offtake-specific inputs (distance, region) are available below the Normalized Metrics section.
                </div>
              )}
            </div>
          </Card>
          </div>
        </div>
      </div>

      {/* âœ… RESTORED: DC Configuration / PUE / WUE / EED Reporting */}
      <div className="mt-6">
        <Card
          title="PUE/WUE Performance and EED Reporting"
          right={<span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">PUE / WUE / ERF / ERE</span>}
          collapsible={true}
        >
          <div className="grid gap-2 md:grid-cols-3">
            {/* Controls */}
            <div className="space-y-1.5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  DC Facility
                </label>
                <select
                  value={dcConfig}
                  onChange={(e) => {
                    setDcConfig(e.target.value);
                    const facility = FACILITIES[e.target.value];
                    if (facility) setElectricityCost(facility.electricityCostPerMWh);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {Object.keys(FACILITIES).map((facilityName) => (
                    <option key={facilityName} value={facilityName}>
                      {facilityName}
                    </option>
                  ))}
                </select>
                {currentFacility ? (
                  <div className="mt-2 text-xs text-slate-600 space-y-1">
                    <div><strong>{currentFacility.location}</strong></div>
                    <div>{currentFacility.coolingType}</div>
                    <div>WHR: {currentFacility.whrFriendliness}</div>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  DC Location
                </label>
                <select
                  value={dcCity}
                  onChange={(e) => {
                    const newCity = e.target.value;
                    setDcCity(newCity);
                    const loc = DC_LOCATIONS[newCity];
                    if (loc) {
                      setElectricityCost(loc.electricityCostPerMWh);
                      setGridEfKgPerKwh(loc.gridEfKgPerKwh);
                    }
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  <optgroup label="US">
                    {Object.entries(DC_LOCATIONS)
                      .filter(([, v]) => v.region === "US")
                      .map(([key, v]) => (
                        <option key={key} value={key}>
                          {v.label} - ${v.electricityCostPerMWh}/MWh
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Europe">
                    {Object.entries(DC_LOCATIONS)
                      .filter(([, v]) => v.region === "Europe")
                      .map(([key, v]) => (
                        <option key={key} value={key}>
                          {v.label} - ${v.electricityCostPerMWh}/MWh
                        </option>
                      ))}
                  </optgroup>
                </select>
                {selectedDcLocation ? (
                  <div className="mt-2 text-xs text-slate-600">
                    Electricity: ${selectedDcLocation.electricityCostPerMWh}/MWh | Grid: {Math.round(selectedDcLocation.gridEfKgPerKwh * 1000)} g CO2e/kWh
                  </div>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  DC Facility Return Water Temperature (entering offtake)
                </label>
                <SliderRow
                  label="DC facility water temperature leaving the DC"
                  value={dcReturnTempC}
                  setValue={(n) => setDcReturnTempC(Math.max(0, Math.min(n, 79)))}
                  min={0}
                  max={79}
                  step={1}
                  unit="°C"
                  helper="Return temperature used for offtake calculations; ΔT is calculated as return − supply."
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-700">
                  <strong>Note:</strong> ΔT = return − supply.
                </div>
                <div className="mt-1 text-xs text-slate-600">
                  Return: {dcReturnTempC.toFixed(1)}°C (Supply {dcSupplyTempC.toFixed(1)}°C)
                </div>
              </div>
            </div>

            {/* EED Reporting */}
            <div className="rounded-xl border border-slate-200 bg-white p-1.5 space-y-1 border-t-2 border-t-slate-100">
              <div className="text-xs font-semibold text-slate-900 mb-0.5">EED Reporting</div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Energy Reuse Fraction (ERF)</label>
                <SliderRow label="ERF %" value={erfPercent} setValue={setErfPercent} min={0} max={100} step={5} unit="%" />
              </div>
              <MetricRow
                label="ERE"
                value={dcSavings.ere ? `${(dcSavings.ere * 100).toFixed(0)}%` : "—"}
                sub="ERE = (total facility energy - reused energy) / IT energy. Lower is better; ideal is near 1.0."
              />
              <MetricRow
                label="Recoverable MWh"
                value={`${fmtInt(Math.round(core.annualHeatMWh))} MWh/yr`}
                sub="Annual heat available for recovery"
              />
            </div>

            {/* PUE/WUE Stack */}
            <div className="space-y-2">
              {/* PUE */}
              <div className="rounded-xl border border-slate-200 bg-white p-1 space-y-0">
                <div className="text-xs font-semibold text-slate-900 mb-0.5">PUE Impact</div>
                <MetricRow label="Baseline" value={dcSavings.pueBaseline ? dcSavings.pueBaseline.toFixed(3) : "—"} />
                <MetricRow label="With HR" value={dcSavings.pueWithHR ? dcSavings.pueWithHR.toFixed(3) : "—"} />
                <MetricRow
                  label="Reduction"
                  value={dcSavings.pueReduction ? `${dcSavings.pueReduction.toFixed(1)}%` : "—"}
                />
              </div>

              {/* WUE */}
              <div className="rounded-xl border border-slate-200 bg-white p-1 space-y-0">
                <div className="text-xs font-semibold text-slate-900 mb-0.5">WUE Impact</div>
                <MetricRow label="Baseline" value={dcSavings.wueBaseline ? dcSavings.wueBaseline.toFixed(3) : "—"} sub="L/kWh" />
                <MetricRow label="With HR" value={dcSavings.wueWithHR ? dcSavings.wueWithHR.toFixed(3) : "—"} sub="L/kWh" />
                <MetricRow
                  label="Reduction"
                  value={dcSavings.wueReduction ? `${dcSavings.wueReduction.toFixed(1)}%` : "—"}
                />
              </div>
            </div>
          </div>

          <div className="mt-2 p-3 rounded-xl border border-blue-100 bg-blue-50 border-t-2 border-t-blue-200">
            <div className="text-xs text-blue-900">
              <strong>Note:</strong> This section is designed for DC operator reporting / permitting narratives (PUE/WUE/ERF/ERE).
              The savings model is simplified and should be tuned with project-specific data when available.
            </div>
          </div>
        </Card>
      </div>

      {/* DC Operational Savings & WHR Provisioning */}
      <div className="mt-6" id="whr-savings">
        <Card
          title="DC Operational Savings and WHR Provisioning"
          collapsible={true}
        >
          <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* LEFT: Savings */}
            <div className="min-w-0 rounded-xl border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-6 flex flex-col h-full">
          <div>
            <div className="text-sm font-semibold text-slate-900">
              Potential Annual Savings and Simple Payback
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Savings normalized using "$/MW-year" when possible to avoid confusion with scale.
            </div>
          </div>

          <SliderRow
            label="WHR Capital Cost (per MW)"
            value={whrCapitalCostPerMW}
            setValue={setWhrCapitalCostPerMW}
            min={0.1}
            max={1.0}
            step={0.05}
            unit="M"
            decimals={2}
            helper="Adjustable WHR installation cost. Impacts payback period."
          />

          <SliderRow
            label="Electricity Cost"
            value={electricityCost}
            setValue={setElectricityCost}
            min={40}
            max={500}
            step={5}
            unit="$/MWh"
            decimals={0}
            helper="DC electricity cost. Higher cost = greater savings from PUE reduction."
          />

          <SliderRow
            label="Cooling System COP"
            value={coolingCOP}
            setValue={setCoolingCOP}
            min={2.0}
            max={5.0}
            step={0.1}
            unit=""
            decimals={1}
            helper="Coefficient of Performance. Air-cooled ~2.8, Water-cooled ~3.8, Free-cooling ~5+. Default 3.3 = centrifugal chiller."
          />

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="min-w-0 rounded-xl border border-green-200 bg-white/70 p-5">
              <div className="text-xs font-semibold text-slate-600">1 MW system</div>
              <div className="mt-2 text-2xl font-bold text-green-700">
                ${savingsPerMW > 0 ? (savingsPerMW / 1000).toFixed(1) : "0.0"}K / year
              </div>
              <div className="mt-2 text-xs text-slate-600 whitespace-normal break-words">
                CapEx: ${whrCapitalCostPerMW.toFixed(2)}M{" "}
                <span className="text-slate-300">|</span>{" "}
                Payback:{" "}
                {savingsPerMW > 0
                  ? `${(whrCapitalCostPerMW * 1_000_000 / savingsPerMW).toFixed(1)} yrs`
                  : "—"}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-green-200 bg-white/70 p-5">
              <div className="text-xs font-semibold text-slate-600">10 MW example</div>
              <div className="mt-2 text-2xl font-bold text-green-700">
                ${savingsPerMW > 0 ? ((savingsPerMW * 10) / 1_000_000).toFixed(2) : "0.00"}M / year
              </div>
              <div className="mt-2 text-xs text-slate-600 whitespace-normal break-words">
                CapEx: ${(whrCapitalCostPerMW * 10).toFixed(2)}M{" "}
                <span className="text-slate-300">|</span>{" "}
                Payback:{" "}
                {savingsPerMW > 0
                  ? `${(whrCapitalCostPerMW * 1_000_000 / savingsPerMW).toFixed(1)} yrs`
                  : "—"}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-green-200 bg-white/60 p-4 space-y-2">
            <MetricRow
              label="Annual savings (current scale)"
              value={`$${fmtInt(dcSavings.annualOperationalSavings || 0)}/yr`}
              sub="Scales with recoverable heat MW and ERF/PUE settings."
            />
            <MetricRow
              label="Reference install cost (legacy)"
              value={`$${fmtInt(WHR_INSTALLATION_COST_PER_MW)}/MW`}
              sub="Kept as reference constant; slider above drives payback tiles."
            />
          </div>
        </div>

        {/* RIGHT: Heat Exchanger */}
        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-6 flex flex-col h-full">
          <div className="text-sm font-semibold text-slate-900">
            Heat Exchanger Equipment
          </div>

          <div className="mt-4 flex-1 flex items-center justify-center bg-slate-50 rounded-lg overflow-hidden border border-slate-200 p-3">
            <img
              src="/Images/Heat Exchanger Example.jpg"
              alt="Heat Exchanger Equipment"
              className="w-full max-h-96 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>

          <div className="mt-4 text-xs text-slate-600 text-center whitespace-normal break-words">
            This is where your DC capital cost investment goes. The heat exchanger captures waste heat and makes it available for beneficial use.
          </div>

          <div className="mt-4 rounded-lg border border-slate-300 bg-slate-100 p-3">
            <div className="text-xs font-semibold text-slate-700 mb-2">Annual Savings Formula</div>
            <div className="text-xs text-slate-700 space-y-1 font-mono">
              <div>Savings = Heat_MW × Hours/Yr</div>
              <div className="text-slate-600 text-xs">× (1 / Cooling_COP)</div>
              <div className="text-slate-600 text-xs">× Electricity_Cost ($/MWh)</div>
            </div>
            <div className="text-xs text-slate-600 mt-2">
              Current: {core.recoverableHeatMW.toFixed(1)} MW × {hoursPerYear} hrs × (1/{coolingCOP.toFixed(1)}) × ${electricityCost}/MWh = <span className="font-semibold text-green-700">${(dcSavings.annualOperationalSavings / 1_000_000).toFixed(2)}M/yr</span>
            </div>
          </div>
        </div>
          </div>
        </Card>
      </div>

      {/* Heat Delivery Infrastructure & Piping Costs */}
      <div className="mt-6" id="whr-piping">
        <Card
          title="Heat Delivery Infrastructure & Piping Costs"
          collapsible={true}
        >
          <div className="grid gap-4 md:grid-cols-2 items-start">
            <div>
              <div className="text-sm font-medium text-slate-700 mb-2">Offtake inputs</div>

              <SliderRow
                label="Intake distance from DC"
                value={intakeDistanceKm}
                setValue={setIntakeDistanceKm}
                min={0}
                max={20}
                step={0.1}
                unit="km"
                decimals={1}
              />

              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Country / Location
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 space-y-3">
                <MetricRow label="Piping length" value={`${offtakeCosts.pipingLengthKm.toFixed(1)} km`} sub="Straight-line distance assumed" />
                <MetricRow label="Estimated CapEx" value={`$${fmtInt(Math.abs(offtakeCosts.totalCapex))}`} sub="Includes piping + connection (rough estimate)" />
                <MetricRow label="Estimated Opex / yr" value={`$${fmtInt(Math.abs(offtakeCosts.annualOpex))}`} sub="Approx. 3% of CapEx" />

                <div className="mt-3 pt-2 border-t border-slate-100">
                  <div className="text-sm font-semibold text-slate-900 mb-2">Regional inputs</div>
                  <MetricRow label="Electricity price" value={offtakeRegionInfo.electricity ? `$${offtakeRegionInfo.electricity}` : "—"} />
                  <MetricRow label="Natural gas price" value={offtakeRegionInfo.gas ? `$${offtakeRegionInfo.gas}` : "—"} />
                  <MetricRow label="Carbon tax" value={offtakeRegionInfo.carbonTax ? `$${offtakeRegionInfo.carbonTax}` : "—"} />
                  {offtakeRegionInfo.payback ? (
                    <div className="mt-2 text-sm text-slate-600">
                      Payback note: {offtakeRegionInfo.payback}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <img
                src="/Images/Offtake piping example.jpg"
                alt="Offtake piping example"
                className="w-full max-h-96 object-contain rounded-lg border border-slate-200 bg-slate-50 p-3"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          </div>
        </Card>
      </div>

      {/* WHR Offtake Revenue Generation Potential */}
      <div className="mt-6" id="whr-revenue">
        <Card
          title="WHR Offtake Revenue Generation Potential"
          collapsible={true}
        >
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Offtake Type
            </label>
            <select
              value={offtake}
              onChange={(e) => setOfftake(e.target.value as Offtake)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="dac">Direct Air Capture (DAC)</option>
              <option value="hotWater">Hot Water</option>
              <option value="districtHeat">District Heating</option>
              <option value="waterTreatmentFO">Water Treatment (FO)</option>
              <option value="atmosphericWater">Atmospheric Water Harvesting</option>
              <option value="greenhouses">Greenhouses</option>
              <option value="foodBrewery">Food & Brewery</option>
            </select>
          </div>

          <div className="space-y-6">
            {/* Carbon Credits - DAC */}
            {offtake === "dac" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-blue-900 mb-3">Direct Air Capture (DAC) - Carbon Credits</div>
                <div className="space-y-2">
                  <SliderRow
                    label="Carbon credit price (market)"
                    value={dacMarketPrice}
                    setValue={setDacMarketPrice}
                    min={0}
                    max={800}
                    step={10}
                    unit="$/ton"
                  />
                  <SliderRow
                    label="Your CO₂ capture cost"
                    value={dacProcurementPrice}
                    setValue={setDacProcurementPrice}
                    min={0}
                    max={400}
                    step={10}
                    unit="$/ton"
                  />
                  <div className="mt-3 pt-2 border-t border-blue-200">
                    <MetricRow
                      label="Annual CO₂ captured"
                      value={`${fmtInt(Math.round(outputs.dacTco2PerYear))} tCO₂/yr`}
                      sub="Based on recoverable heat MW"
                    />
                    <MetricRow
                      label="Margin per ton"
                      value={`$${(dacMarketPrice - dacProcurementPrice).toFixed(0)}/ton`}
                      sub={`Market price ($${dacMarketPrice}) - Your cost ($${dacProcurementPrice})`}
                    />
                    <MetricRow
                      label="Estimated annual savings from credits"
                      value={`$${fmtInt(Math.round(outputs.dacTco2PerYear * (dacMarketPrice - dacProcurementPrice)))}/yr`}
                      sub="CO₂ captured × margin"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Water Treatment - Water Sales */}
            {(offtake === "waterTreatmentFO" || offtake === "atmosphericWater") && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
                <div className="text-sm font-semibold text-cyan-900 mb-3">
                  {offtake === "waterTreatmentFO" ? "Waste Water Treatment System (FO)" : "Atmospheric Water Capture System"}
                </div>
                <div className="space-y-2">
                  <SliderRow
                    label="Phoenix per-capita water use"
                    value={phxGpcd}
                    setValue={setPhxGpcd}
                    min={50}
                    max={250}
                    step={1}
                    unit="gal/person/day"
                    helper={`Used for the "people served/year" equivalence. Model reference: ${phxGpcd} GPCD (default 125).`}
                  />
                  <SliderRow
                    label="Market water price"
                    value={waterMarketPrice}
                    setValue={setWaterMarketPrice}
                    min={0.5}
                    max={6}
                    step={0.1}
                    unit="$/m³"
                    decimals={2}
                  />
                  <SliderRow
                    label="Your production cost (LCOW)"
                    value={waterProductionCost}
                    setValue={setWaterProductionCost}
                    min={1}
                    max={5}
                    step={0.1}
                    unit="$/m³"
                    decimals={2}
                  />
                  <div className="mt-3 pt-2 border-t border-cyan-200">
                    <MetricRow
                      label="Annual water production"
                      value={`${fmtInt(Math.round(offtake === "waterTreatmentFO" ? outputs.treviM3PerYear : outputs.uravuM3PerYear))} m³/yr`}
                      sub="Based on recoverable heat MW"
                    />
                    <MetricRow
                      label="Margin per m³"
                      value={`$${(waterMarketPrice - waterProductionCost).toFixed(2)}/m³`}
                      sub={`Market price ($${waterMarketPrice.toFixed(2)}) - Your cost ($${waterProductionCost.toFixed(2)})`}
                    />
                    <MetricRow
                      label="Estimated annual revenue"
                      value={`$${fmtInt(Math.round((offtake === "waterTreatmentFO" ? outputs.treviM3PerYear : outputs.uravuM3PerYear) * (waterMarketPrice - waterProductionCost)))}/yr`}
                      sub="Water volume (m³) × margin"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Thermal Energy - Greenhouses/District Heat */}
            {(offtake === "greenhouses" || offtake === "districtHeat") && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-sm font-semibold text-orange-900 mb-3">
                  {offtake === "greenhouses" ? "Greenhouse Heating" : "District Heat System"}
                </div>
                <div className="space-y-2">
                  <SliderRow
                    label="Thermal energy price"
                    value={thermalEnergyPrice}
                    setValue={setThermalEnergyPrice}
                    min={20}
                    max={150}
                    step={5}
                    unit="$/MWh"
                  />
                  <div className="mt-3 pt-2 border-t border-orange-200">
                    <MetricRow
                      label="Annual thermal energy delivered"
                      value={`${fmtInt(Math.round(core.annualHeatMWh))} MWh/yr`}
                      sub="Heat available for sale"
                    />
                    {offtake === "greenhouses" ? (
                      <>
                        <MetricRow
                          label="Greenhouse area heated"
                          value={`${fmt2(outputs.greenhouseHa)} ha`}
                          sub="Estimated heated area from recovered heat"
                        />
                        <MetricRow
                          label="Tomato output"
                          value={`~${fmtInt(outputs.greenhouseHa * TOMATO_TONS_PER_HA_YEAR)} tons/yr`}
                          sub="Estimated from heated area"
                        />
                      </>
                    ) : null}
                    <MetricRow
                      label="Estimated annual revenue"
                      value={`$${fmtInt(Math.round(core.annualHeatMWh * thermalEnergyPrice))}/yr`}
                      sub="Thermal energy delivered × price"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Hot Water Sales */}
            {offtake === "hotWater" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-sm font-semibold text-amber-900 mb-3">Hot Water Sales</div>
                <div className="space-y-2">
                  <SliderRow
                    label="Hot water price"
                    value={thermalEnergyPrice}
                    setValue={setThermalEnergyPrice}
                    min={20}
                    max={100}
                    step={5}
                    unit="$/MWh"
                  />
                  <div className="mt-3 pt-2 border-t border-amber-200">
                    <MetricRow
                      label="Annual thermal energy available"
                      value={`${fmtInt(Math.round(core.annualHeatMWh))} MWh/yr`}
                      sub="Heat available for direct hot water sales"
                    />
                    <MetricRow
                      label="Estimated annual revenue"
                      value={`$${fmtInt(Math.round(core.annualHeatMWh * thermalEnergyPrice))}/yr`}
                      sub="Thermal energy delivered × price"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Food & Brewery Processing */}
            {offtake === "foodBrewery" && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="text-sm font-semibold text-red-900 mb-3">Food & Brewery Processing Heat</div>
                <div className="space-y-2">
                  <SliderRow
                    label="Process heat price"
                    value={thermalEnergyPrice}
                    setValue={setThermalEnergyPrice}
                    min={50}
                    max={150}
                    step={5}
                    unit="$/MWh"
                  />
                  <div className="mt-3 pt-2 border-t border-red-200">
                    <MetricRow
                      label="Annual thermal energy available"
                      value={`${fmtInt(Math.round(core.annualHeatMWh))} MWh/yr`}
                      sub="Process heat for food/brewery operations"
                    />
                    <MetricRow
                      label="Estimated annual revenue"
                      value={`$${fmtInt(Math.round(core.annualHeatMWh * thermalEnergyPrice))}/yr`}
                      sub="Thermal energy delivered × price"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* General Notes */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs text-slate-700">
                <strong>Note:</strong> These revenue estimates are simplified heuristics based on market averages. Actual revenues depend on:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Contract terms & long-term agreements with offtake partners</li>
                  <li>Seasonal variations in supply & demand</li>
                  <li>Transportation & handling costs not fully captured here</li>
                  <li>Carbon credit market volatility & policy changes</li>
                  <li>Local regulations & permitting requirements</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Ownership Model & Business Case Comparison */}
      <div className="mt-6" id="whr-ownership">
        <Card
          title="Ownership Model & Financial Comparison"
          collapsible={true}
        >
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Select Ownership Model
            </label>
            <select
              value={ownershipModel}
              onChange={(e) => setOwnershipModel(e.target.value as OwnershipModel)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="microsoft">Model A: Microsoft Owns + Operates + Sells</option>
              <option value="thirdparty">Model B: Third-Party Owns + Operates (Microsoft gets tipping fee)</option>
              <option value="hybrid">Model C: Hybrid (Third-party operates, Microsoft gets revenue share)</option>
            </select>
          </div>

          {/* Model Parameters */}
          {ownershipModel === "thirdparty" && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <SliderRow
                label="Tipping fee (third-party pays Microsoft for heat)"
                value={tippingFeePerMWh}
                setValue={setTippingFeePerMWh}
                min={0}
                max={50}
                step={5}
                unit="$/MWh"
              />
            </div>
          )}

          {ownershipModel === "hybrid" && (
            <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
              <SliderRow
                label="Microsoft revenue share percentage"
                value={revenueSharePercent}
                setValue={setRevenueSharePercent}
                min={10}
                max={50}
                step={5}
                unit="%"
              />
            </div>
          )}

          {/* CapEx Breakdown */}
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900 mb-3">Capital Expenditure Components</div>
            <div className="space-y-2">
              <MetricRow
                label="Heat Exchanger (WHR system)"
                value={`$${fmtInt(Math.round(ownershipComparison.heatExchangerCapex))}`}
                sub="Always paid by Microsoft"
              />
              <MetricRow
                label="Piping to offtaker"
                value={`$${fmtInt(Math.round(ownershipComparison.pipingCapex))}`}
                sub={ownershipModel === "thirdparty" ? "Negotiable (third-party may pay)" : "Included in Microsoft CapEx"}
              />
              <MetricRow
                label={`Offtake Plant (${ownershipComparison.plantCosts.unit})`}
                value={`$${fmtInt(Math.round(ownershipComparison.offtakePlantCapex))}`}
                sub={
                  ownershipModel === "microsoft" 
                    ? `Microsoft pays ${ownershipComparison.plantCosts.notes ? '• ' + ownershipComparison.plantCosts.notes : ''}` 
                    : `Third-party pays ${ownershipComparison.plantCosts.notes ? '• ' + ownershipComparison.plantCosts.notes : ''}`
                }
              />
            </div>
          </div>

          {/* Model Comparison Grid */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Model A */}
            <div className={`rounded-xl border-2 p-4 ${ownershipModel === "microsoft" ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"}`}>
              <div className="text-sm font-semibold text-slate-900 mb-1">Model A: Microsoft Full Ownership</div>
              <div className="text-xs text-slate-600 mb-3">Microsoft owns everything, captures all value</div>
              <div className="space-y-2">
                <MetricRow
                  label="Total CapEx"
                  value={`$${(ownershipComparison.modelA.totalCapex / 1_000_000).toFixed(2)}M`}
                  sub="HX + Piping + Plant"
                />
                <MetricRow
                  label="Annual OpEx"
                  value={`$${fmtInt(ownershipComparison.modelA.annualOpex)}`}
                />
                <MetricRow
                  label="Annual Revenue"
                  value={`$${fmtInt(Math.round(ownershipComparison.modelA.annualRevenue))}`}
                  sub="DC savings + offtake revenue"
                />
                <MetricRow
                  label="Annual Profit"
                  value={`$${fmtInt(Math.round(ownershipComparison.modelA.annualProfit))}`}
                  sub="Revenue - OpEx"
                />
                <MetricRow
                  label="Payback Period"
                  value={`${ownershipComparison.modelA.paybackYears.toFixed(1)} yrs`}
                />
              </div>
            </div>

            {/* Model B */}
            <div className={`rounded-xl border-2 p-4 ${ownershipModel === "thirdparty" ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"}`}>
              <div className="text-sm font-semibold text-slate-900 mb-1">Model B: Third-Party Owns Plant</div>
              <div className="text-xs text-slate-600 mb-3">Microsoft just provides heat, low CapEx</div>
              <div className="space-y-2">
                <MetricRow
                  label="Total CapEx (MS)"
                  value={`$${(ownershipComparison.modelB.totalCapex / 1_000_000).toFixed(2)}M`}
                  sub="HX only"
                />
                <MetricRow
                  label="Annual OpEx (MS)"
                  value={`$${fmtInt(ownershipComparison.modelB.annualOpex)}`}
                />
                <MetricRow
                  label="Annual Revenue (MS)"
                  value={`$${fmtInt(Math.round(ownershipComparison.modelB.annualRevenue))}`}
                  sub="DC savings + tipping fee"
                />
                <MetricRow
                  label="MS Payback Period"
                  value={`${ownershipComparison.modelB.paybackYears.toFixed(1)} yrs`}
                />
                <div className="mt-3 pt-2 border-t border-slate-200">
                  <MetricRow
                    label="Third-party profit"
                    value={`$${fmtInt(Math.round(ownershipComparison.modelB.thirdPartyProfit || 0))}`}
                    sub="After paying tipping fee"
                  />
                </div>
              </div>
            </div>

            {/* Model C */}
            <div className={`rounded-xl border-2 p-4 ${ownershipModel === "hybrid" ? "border-green-400 bg-green-50" : "border-slate-200 bg-white"}`}>
              <div className="text-sm font-semibold text-slate-900 mb-1">Model C: Hybrid Revenue Share</div>
              <div className="text-xs text-slate-600 mb-3">Third-party operates, Microsoft gets {revenueSharePercent}%</div>
              <div className="space-y-2">
                <MetricRow
                  label="Total CapEx (MS)"
                  value={`$${(ownershipComparison.modelC.totalCapex / 1_000_000).toFixed(2)}M`}
                  sub="HX only"
                />
                <MetricRow
                  label="Annual OpEx (MS)"
                  value={`$${fmtInt(ownershipComparison.modelC.annualOpex)}`}
                />
                <MetricRow
                  label="Annual Revenue (MS)"
                  value={`$${fmtInt(Math.round(ownershipComparison.modelC.annualRevenue))}`}
                  sub={`DC savings + ${revenueSharePercent}% revenue`}
                />
                <MetricRow
                  label="MS Payback Period"
                  value={`${ownershipComparison.modelC.paybackYears.toFixed(1)} yrs`}
                />
                <div className="mt-3 pt-2 border-t border-slate-200">
                  <MetricRow
                    label="Third-party profit"
                    value={`$${fmtInt(Math.round(ownershipComparison.modelC.thirdPartyProfit || 0))}`}
                    sub={`After ${100 - revenueSharePercent}% share`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Strategic Considerations */}
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-900 mb-2">Strategic Considerations</div>
            <div className="text-xs text-slate-700 space-y-2">
              <div>
                <strong>Model A (Full Ownership):</strong> Highest CapEx, but captures all revenue. Requires Microsoft to operate non-core business (water/CO₂). Best if: high margin offtakes, strong internal expertise.
              </div>
              <div>
                <strong>Model B (Third-Party):</strong> Lowest CapEx, fastest payback for Microsoft. Partner has expertise in offtake operations. Best if: Microsoft wants to focus on core DC business, limited capital available.
              </div>
              <div>
                <strong>Model C (Hybrid):</strong> Balanced approach. Microsoft gets ongoing revenue without operational burden. Best if: want upside participation without complexity.
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Normalized Performance & Impact Metrics */}
      <div className="mt-6" id="whr-performance">
        <Card
          title="Normalized Performance & Impact Metrics"
          right={<span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Temperature-aware</span>}
          collapsible={true}
        >
          {/* CO2 Chart - Top Priority */}
          <div className="mb-6 rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50 p-4">
            <div className="text-sm font-semibold text-slate-900 mb-3">CO₂ Impact Across Offtake Types (normalized)</div>
            <CO2BarChart data={co2Bars} />
            <div className="mt-3 text-xs text-slate-600 italic whitespace-normal break-words">
              📊 CO₂ chart uses best-effort ranges; DAC is at-scale constant. Greenhouses range is seasonal capacity factor adjusted.
            </div>
          </div>

          {/* Normalized Metrics Grid */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Water Production */}
            <div className="rounded-xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50 p-4 min-w-0">
              <div className="text-sm font-semibold text-slate-900 mb-1">💧 Water Production</div>
              <div className="text-xs text-slate-600 mb-3">per MW·year</div>
              <div className="mt-2 space-y-2">
                <MetricRow label="Waste Water Treatment (FO)" value={`${fmtInt(normalized.treviM3_per_MWyr)} m³`} />
                <MetricRow label="Atmospheric Water Capture" value={`${fmtInt(normalized.uravuM3_per_MWyr)} m³`} />
                <MetricRow label="DAC water byproduct" value={`${fmtInt(normalized.dacWaterM3_per_MWyr)} m³`} />
              </div>
              <div className="mt-3 pt-3 border-t border-cyan-200 text-xs text-slate-600 whitespace-normal break-words">
                <strong>People served:</strong> FO ~{fmtInt(normalized.phxPeoplePerMWyr_trevi)}, AWH ~{fmtInt(normalized.phxPeoplePerMWyr_uravu)} (Phoenix equivalent).
              </div>
            </div>

            {/* Thermal & Energy */}
            <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4 min-w-0">
              <div className="text-sm font-semibold text-slate-900 mb-1">🔥 Thermal Energy & Heating</div>
              <div className="text-xs text-slate-600 mb-3">per MW·year</div>
              <div className="mt-2 space-y-2">
                <MetricRow label="Homes heated (district)" value={`${fmtInt(normalized.homes_per_MWyr)} homes`} />
                <MetricRow label="Greenhouse area" value={`${fmt2(normalized.greenhouseHa_per_MWyr)} ha`} />
              </div>
              <div className="mt-4 pt-3 border-t border-orange-200">
                <div className="text-xs font-semibold text-slate-700 mb-2">Offtake Highlights</div>
                <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
                  <li>District heating serves ~{fmtInt(normalized.homes_per_MWyr)} families/MW</li>
                  <li>Greenhouses achieve highest utilization</li>
                </ul>
              </div>
            </div>

            {/* Carbon & Impact */}
            <div className="rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 min-w-0">
              <div className="text-sm font-semibold text-slate-900 mb-1">♻️ Carbon & Environmental</div>
              <div className="text-xs text-slate-600 mb-3">per MW·year</div>
              <div className="mt-2 space-y-2">
                <MetricRow label="CO₂ captured (DAC)" value={`${fmtInt(normalized.dacTco2_per_MWyr)} tCO₂`} />
                <MetricRow label="Avoided emissions" value="—" sub="(Context-dependent)" />
              </div>
              <div className="mt-4 pt-3 border-t border-green-200">
                <div className="text-xs font-semibold text-slate-700 mb-2">Climate Impact</div>
                <p className="text-xs text-slate-600 italic">
                  One 10 MW WHR system removes ~{fmtInt(normalized.dacTco2_per_MWyr * 10)} tCO₂/year through DAC.
                </p>
              </div>
            </div>
          </div>

          {/* Summary Footer */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-700 space-y-2">
              <p>
                <strong>Interpretation:</strong> These normalized metrics (per MW·year) enable fair comparison across different WHR system sizes and operating conditions. Temperature-aware adjustments account for seasonal variations and regional climate differences.
              </p>
              <p className="text-slate-600">
                Use these benchmarks to scale project feasibility from 1 MW pilots to multi-megawatt deployments across different offtake types.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* WHR Offtake Proximity */}
      <div className="mt-8" id="whr-proximity">
        <Card
          title="WHR Offtake Proximity: Sites for Opportunities"
          collapsible={true}
        >
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              Food and brewery industry proximity view for current offtake opportunities.
              Zoom in to explore facilities around Microsoft Europe data centers.
            </p>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
                <span className="text-xs font-semibold text-slate-700">Food and Brewery focus</span>
                <a
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800"
                  href="/maps/food-brewery-proximity.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open full map
                </a>
              </div>
              <div
                className="w-full"
                style={{ height: "500px" }}
              >
                <iframe
                  title="Food and Brewery proximity map"
                  src="/maps/food-brewery-proximity.html"
                  className="h-full w-full"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Calculator Assumptions & Methodology */}
      <div className="mt-8" id="whr-assumptions">
        <Card
          title="WHR Calculator Assumptions & Methodology"
          collapsible={true}
        >
          <div className="space-y-4 text-sm text-slate-700">
            
            {/* DC Operator Savings Section */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">1. DC Operator Savings (Operational Layer)</h4>
              <div className="bg-slate-50 p-3 rounded-lg space-y-2 text-xs">
                <p><strong>Formula:</strong> Annual Operational Savings = Recoverable Heat (MW) × Operating Hours (hrs/yr) × (1/COP) × Regional Electricity Cost ($/MWh)</p>
                <p><strong>Components:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Recoverable Heat:</strong> IT Load (MW) × Heat Recovery % (user slider)</li>
                  <li><strong>Operating Hours:</strong> Default 8760 hrs/year (24/7/365). Accounts for cooling during peak demand periods.</li>
                  <li><strong>COP (Cooling Efficiency):</strong> User-adjustable 2.0–5.0. Default 3.3 for modern systems.</li>
                  <li><strong>Electricity Cost:</strong> Regional rates (Seattle $52/MWh → Newport $95/MWh). Auto-updates when facility selected.</li>
                </ul>
                <p><strong>Example (Ballard, 10 MW, 50% recovery):</strong></p>
                <p className="ml-4">5 MW × 8760 hrs × (1/3.3) × $60/MWh = <strong>$800k/year</strong></p>
                <p><strong>Assumptions:</strong> Assumes direct cooling energy reduction. Does not include installation/maintenance costs at this layer.</p>
              </div>
            </div>

            {/* PUE/WUE Section */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">2. DC Efficiency Metrics (PUE / WUE / ERF / ERE)</h4>
              <div className="bg-slate-50 p-3 rounded-lg space-y-2 text-xs">
                <p><strong>Facility-Specific PUE Improvements (100% ERF basis):</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Ballard (Evaporative):</strong> 6% max PUE reduction | Source: ASHRAE TC evaporative system studies</li>
                  <li><strong>Osgood (Hybrid Evap+Mech):</strong> 9% max PUE reduction | Source: Hybrid system waste heat potential</li>
                  <li><strong>Fremont (Air-Cooled):</strong> 4% max PUE reduction | Source: Limited HR gains from low-grade waste heat (30–40°C)</li>
                </ul>
                <p><strong>PUE Calculation:</strong> PUE with HR = PUE baseline × [1 − (Max Improvement × ERF × Temperature Factor)]</p>
                <p><strong>Temperature Factor:</strong> max(0.85, 1 − (Return Temp − 25°C) / 100) — warmer returns improve efficiency gains</p>
                <p><strong>WUE (Water Usage Effectiveness):</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Ballard & Osgood: 15% water reduction per 100% ERF (evaporative/hybrid systems)</li>
                  <li>Fremont: 0 (dry air-cooled, no water usage)</li>
                </ul>
                <p><strong>ERF (Energy Reuse Fraction):</strong> Heat repurposed / Total facility energy. User-controlled 0–100%.</p>
                <p><strong>ERE (Energy Reuse Effectiveness):</strong> Facility efficiency coefficient (0.75–0.85). Scales with ERF.</p>
              </div>
            </div>

            {/* Heat Recovery & Offtake Selection */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">3. Heat Recovery & Offtake Selection</h4>
              <div className="bg-slate-50 p-3 rounded-lg space-y-2 text-xs">
                <p><strong>Available Offtakes:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li><strong>Waste Water Treatment System (FO):</strong> $3.06M CapEx, $256k OpEx/yr, LCOW $3.29–3.68/m³. Validated data.</li>
                  <li><strong>Atmospheric Water Capture System:</strong> $1.05M CapEx, $126k OpEx/yr. Mid-market estimate.</li>
                  <li><strong>DAC (Direct Air Capture):</strong> $4.0M CapEx placeholder. Scales with CO₂ production target.</li>
                </ul>
                <p><strong>Heat Matching:</strong> User selects recovery % and facility. System calculates water/CO₂ produced from recovered heat using facility-specific performance curves.</p>
                <p><strong>Capital Recovery:</strong> Payback = Total CapEx / (Annual Operational Savings + Annual Revenue from Water/CO₂)</p>
              </div>
            </div>

            {/* Ownership Models */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">4. Ownership & Revenue Models</h4>
              <div className="bg-slate-50 p-3 rounded-lg space-y-2 text-xs">
                <p><strong>Model A (Microsoft Owned):</strong> Full CapEx + OpEx. Revenue = Water/CO₂ value. Shortest payback.</p>
                <p><strong>Model B (Third-Party Owned):</strong> Third party covers CapEx/OpEx. Negotiated avoided CapEx reduction + revenue share.</p>
                <p><strong>Model C (Hybrid):</strong> Shared investment. Risk/reward split user-configurable (tipping fee + revenue share %).</p>
                <p><strong>Water Revenue:</strong> Market price $4.50/m³ − Production LCOW = Margin. DAC CO₂ priced per unit carbon market rates.</p>
              </div>
            </div>

            {/* Normalized Metrics */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">5. Normalized Metrics (per MW·year)</h4>
              <div className="bg-slate-50 p-3 rounded-lg space-y-2 text-xs">
                <p><strong>Water Production Normalized:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Treatment System: = (Recoverable Heat MW × 8760 hrs × Treatment Factor) m³/MW·yr</li>
                  <li>Capture System: = (Recoverable Heat MW × 8760 hrs × Capture Factor) m³/MW·yr</li>
                </ul>
                <p><strong>Phoenix Human Equivalent:</strong> Water m³/yr ÷ Phoenix GPCD (~ 360 gal/person/day = 1,361 m³/person/yr)</p>
                <p><strong>DAC CO₂ Capture:</strong> Recoverable Heat (MWh/yr) × CO₂ capture efficiency (kg/MWh). Default ~50 kg CO₂/MWh waste heat.</p>
                <p><strong>Greenhouse Equivalent:</strong> Water m³/yr ÷ ~1,000 m³/ha/season (4 seasons/year in controlled climate)</p>
                <p><strong>District Heating Homes:</strong> Heat available (MWh) ÷ Heating load per home (~15 MWh/home/winter in temperate zone)</p>
              </div>
            </div>

            {/* Data Sources & Caveats */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900">6. Data Sources & Caveats</h4>
              <div className="bg-slate-50 p-3 rounded-lg space-y-2 text-xs">
                <p><strong>Validated Data:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Waste Water Treatment Systems: Industry datasheet (LCOW, CapEx verified against 2024 quotes)</li>
                  <li>Atmospheric Water Capture Systems: Mid-market estimate; validation pending</li>
                  <li>Regional electricity costs: GlobalPetrolPrices.com business averages (2023-2025, USD/kWh)</li>
                  <li>Grid carbon intensity: Ember (2026) via Our World in Data (2025 lifecycle g CO2e/kWh); US uses EIA 2023 CO2 per kWh</li>
                  <li>PUE improvements: ASHRAE Technical Committee DTG recommendations</li>
                </ul>
                <p><strong>Estimated/Placeholder:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>DAC CapEx ($4M): Generic; project-specific quotes vary 2–10×</li>
                  <li>Piping/integration costs: ±30% regional markup applied</li>
                  <li>Maintenance factors: Conservative 5% of annual savings</li>
                </ul>
                <p className="text-red-600"><strong>Disclaimer:</strong> This calculator provides order-of-magnitude estimates for feasibility screening. Project-specific engineering, climate data, and vendor quotes are required for investment decisions.</p>
              </div>
            </div>

          </div>
        </Card>
      </div>

      {/* WHR Offtakes FAQ */}
      <div className="mt-8" id="whr-faq">
        <Card
          title="WHR Offtakes FAQ"
          collapsible={true}
        >
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  Download FAQ PDF
                </div>
                <div className="text-xs text-slate-600">
                  Includes all FAQ sections and questions across offtakes.
                </div>
              </div>
              <button
                className="rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                onClick={generateFaqPdf}
              >
                Download FAQ PDF
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs font-semibold text-slate-600">
                Select WHR offtake
              </div>

              <div className="hidden sm:flex flex-wrap gap-2">
                {faqOfftakeOptions.map((key) => (
                  <button
                    key={key}
                    onClick={() => setFaqOfftake(key)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                      faqOfftake === key
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {OFFTAKE_LABEL[key]}
                  </button>
                ))}
              </div>

              <select
                className="sm:hidden w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                value={faqOfftake}
                onChange={(e) => setFaqOfftake(e.target.value as Offtake)}
              >
                {faqOfftakeOptions.map((key) => (
                  <option key={key} value={key}>
                    {OFFTAKE_LABEL[key]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-6">
              {[...FAQ_GENERAL_SECTIONS, ...(FAQ_OFFTAKE_SECTIONS[faqOfftake] || [])].map(
                (section, idx) => (
                  <div
                    key={`${section.title}-${idx}`}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="text-sm font-semibold text-slate-900">
                      {section.title}
                    </div>
                    <div className="mt-3 space-y-3">
                      {section.items.map((item, itemIdx) => (
                        <div key={`${item.q}-${itemIdx}`} className="space-y-1">
                          <div className="text-sm font-semibold text-slate-800">
                            {item.q}
                          </div>
                          <div className="text-sm text-slate-700 whitespace-normal break-words">
                            {item.a}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

              {faqOfftake === "waterTreatmentFO" ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Water Treatment System (FO) tables
                  </div>

                  <div className="mt-4 space-y-6">
                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        Key system metrics (per MW-year)
                      </div>
                      <div className="w-full overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500">
                              <th className="py-2 pr-4">Metric</th>
                              <th className="py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700">
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">CapEx (plant + heat pump)</td>
                              <td className="py-2">${OFFTAKE_PLANT_COSTS.waterTreatmentFO.capexM.toFixed(2)}M</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">OpEx (annual)</td>
                              <td className="py-2">${fmtInt(OFFTAKE_PLANT_COSTS.waterTreatmentFO.opexPerYear)}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">LCOW range</td>
                              <td className="py-2">$3.29-$3.68 per m3</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Throughput range</td>
                              <td className="py-2">
                                {fmt2(treviThroughputMinMliters)}-{fmt2(treviThroughputMaxMliters)} ML/yr
                              </td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Throughput midpoint</td>
                              <td className="py-2">{fmtInt(treviThroughputMidM3)} m3/yr</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Temp performance factor</td>
                              <td className="py-2">{fmt2(perf.treviFactor)}x (from return temp)</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        PUE / WUE / ERF summary (current facility)
                      </div>
                      <div className="w-full overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500">
                              <th className="py-2 pr-4">Metric</th>
                              <th className="py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700">
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Facility</td>
                              <td className="py-2">{dcConfig}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">PUE baseline</td>
                              <td className="py-2">{fmtOrDash(dcSavings.pueBaseline, 2)}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">PUE with WHR</td>
                              <td className="py-2">{fmtOrDash(dcSavings.pueWithHR, 2)}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">PUE reduction</td>
                              <td className="py-2">{fmtOrDash(dcSavings.pueReduction, 1)}%</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">WUE baseline</td>
                              <td className="py-2">{fmtOrDash(dcSavings.wueBaseline, 3)}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">WUE with WHR</td>
                              <td className="py-2">{fmtOrDash(dcSavings.wueWithHR, 3)}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">WUE reduction</td>
                              <td className="py-2">{fmtOrDash(dcSavings.wueReduction, 1)}%</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">ERF</td>
                              <td className="py-2">{fmt1(dcSavings.erf * 100)}%</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">ERE (heuristic)</td>
                              <td className="py-2">{fmtOrDash(dcSavings.ere, 2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        Normalized performance (per MW-year)
                      </div>
                      <div className="w-full overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500">
                              <th className="py-2 pr-4">Metric</th>
                              <th className="py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700">
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Treated water (FO)</td>
                              <td className="py-2">{fmtInt(normalized.treviM3_per_MWyr)} m3</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">People served (Phoenix equivalent)</td>
                              <td className="py-2">{fmt1(normalized.phxPeoplePerMWyr_trevi)}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">DAC water byproduct</td>
                              <td className="py-2">{fmtInt(normalized.dacWaterM3_per_MWyr)} m3</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {faqOfftake === "foodBrewery" ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-semibold text-slate-900">
                    Food & Brewery tables
                  </div>

                  <div className="mt-4 space-y-6">
                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        Reference assumptions
                      </div>
                      <div className="w-full overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500">
                              <th className="py-2 pr-4">Metric</th>
                              <th className="py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700">
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Typical thermal demand</td>
                              <td className="py-2">8-10 MW per facility</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Heat share of site energy</td>
                              <td className="py-2">~2/3 of total site energy</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Compatible process range</td>
                              <td className="py-2">~60-80°C (cleaning, process heat)</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Pasteurization range</td>
                              <td className="py-2">~90°C</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">DC output scenarios</td>
                              <td className="py-2">30°C baseline, 65°C future</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Target return temperature</td>
                              <td className="py-2">18°C or lower</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        Integration and scale
                      </div>
                      <div className="w-full overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500">
                              <th className="py-2 pr-4">Metric</th>
                              <th className="py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700">
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Heat pump COP (base case)</td>
                              <td className="py-2">~3.3</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">8 MW delivered heat</td>
                              <td className="py-2">5.6 MW DC heat + 2.4 MW electricity</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Proximity (EU DCs)</td>
                              <td className="py-2">~50% within 3 km, ~23% within 1 km</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-600 mb-2">
                        Economics (indicative)
                      </div>
                      <div className="w-full overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-slate-500">
                              <th className="py-2 pr-4">Metric</th>
                              <th className="py-2">Value</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700">
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">CapEx (reference)</td>
                              <td className="py-2">${OFFTAKE_PLANT_COSTS.foodBrewery.capexM.toFixed(2)}M</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">OpEx (annual)</td>
                              <td className="py-2">${fmtInt(OFFTAKE_PLANT_COSTS.foodBrewery.opexPerYear)}</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Offtaker payback range</td>
                              <td className="py-2">~2-5 years</td>
                            </tr>
                            <tr className="border-t border-slate-200">
                              <td className="py-2 pr-4">Data center payback</td>
                              <td className="py-2">&lt; 1 year (case study range)</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
