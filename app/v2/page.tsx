"use client";

import React, { useState } from "react";
import { Card, StatTile, SliderRow, MetricRow } from "../../components/ui";

const WHR_INSTALLATION_COST_PER_MW = 0.25 * 1_000_000; // $250k per MW

const DEFAULT_DC_CITY = "Frankfurt";
const DC_LOCATIONS: Record<
  string,
  { label: string; region: "US" | "Europe"; electricityCostPerMWh: number; gridEfKgPerKwh: number }
> = {
  Seattle: { label: "Seattle, WA", region: "US", electricityCostPerMWh: 99.9, gridEfKgPerKwh: 0.367 },
  Chicago: { label: "Chicago, IL", region: "US", electricityCostPerMWh: 118.1, gridEfKgPerKwh: 0.367 },
  Phoenix: { label: "Phoenix, AZ", region: "US", electricityCostPerMWh: 122.3, gridEfKgPerKwh: 0.367 },
  Atlanta: { label: "Atlanta, GA", region: "US", electricityCostPerMWh: 108.7, gridEfKgPerKwh: 0.367 },
  Frankfurt: { label: "Frankfurt, Germany", region: "Europe", electricityCostPerMWh: 284, gridEfKgPerKwh: 0.332 },
  Newport: { label: "Newport, UK", region: "Europe", electricityCostPerMWh: 442, gridEfKgPerKwh: 0.217 },
  "Agriport A7": { label: "Agriport A7, Netherlands", region: "Europe", electricityCostPerMWh: 221, gridEfKgPerKwh: 0.253 },
  Zaragoza: { label: "Zaragoza, Spain", region: "Europe", electricityCostPerMWh: 138, gridEfKgPerKwh: 0.153 },
};

export default function PageV2() {
  const [mw, setMw] = useState(50);
  const [hours, setHours] = useState(4000);
  const [whrCapitalCostPerMW, setWhrCapitalCostPerMW] = useState(0.25);
  const [dcCity, setDcCity] = useState(DEFAULT_DC_CITY);

  const annual = mw * hours;
  const annualOperationalSavings = annual * 35; // Rough estimate: $35/MWh savings

  return (
    <main className="mx-auto max-w-5xl p-6 font-sans">
      <h1 className="text-2xl font-bold">WHR — V2 Playground</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatTile label="IT load" value={`${mw} MW`} sub="Interactive slider" />
        <StatTile label="Annual MWh" value={`${annual.toLocaleString()} MWh/yr`} />
      </div>

      <div className="mt-6">
        <Card title="Inputs">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              DC location
            </label>
            <select
              value={dcCity}
              onChange={(e) => setDcCity(e.target.value)}
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
            <div className="mt-2 text-xs text-slate-600">
              Electricity: ${DC_LOCATIONS[dcCity].electricityCostPerMWh}/MWh | Grid: {Math.round(DC_LOCATIONS[dcCity].gridEfKgPerKwh * 1000)} g CO2e/kWh
            </div>
          </div>
          <SliderRow label="IT load (MW)" value={mw} setValue={setMw} min={0} max={200} step={1} unit="MW" />
          <SliderRow label="Operating hours" value={hours} setValue={setHours} min={0} max={8760} step={10} unit="hrs" />
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Summary">
          <MetricRow label="Annual recoverable heat" value={`${annual.toLocaleString()} MWh/yr`} />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Operational Savings */}
        <div className="rounded-xl border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Potential Annual Savings and Simple Payback</div>
          
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

          <div className="space-y-3 mt-4">
            <div>
              <div className="text-xs text-slate-600 mb-1">1 MW System</div>
              <div className="text-2xl font-bold text-green-700">
                ${annualOperationalSavings ? (annualOperationalSavings / 1000).toFixed(1) : '0'} K/year
              </div>
              <div className="text-xs text-slate-600 mt-2">
                Capital Cost: ${(whrCapitalCostPerMW).toFixed(2)}M | Payback: {(annualOperationalSavings && annualOperationalSavings > 0) ? `${(whrCapitalCostPerMW * 1_000_000 / annualOperationalSavings).toFixed(1)} years` : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-600 mb-1">{mw} MW System (Your Case)</div>
              <div className="text-2xl font-bold text-green-700">
                ${annualOperationalSavings ? (annualOperationalSavings * mw / 1_000_000).toFixed(1) : '0'} M/year
              </div>
              <div className="text-xs text-slate-600 mt-2">
                Capital Cost: ${(whrCapitalCostPerMW * mw).toFixed(2)}M | Payback: {(annualOperationalSavings && annualOperationalSavings > 0) ? `${(whrCapitalCostPerMW * mw * 1_000_000 / (annualOperationalSavings * mw)).toFixed(1)} years` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Heat Exchanger Image */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-center">
          <div className="text-sm font-semibold text-slate-900 mb-3">Heat Exchanger Equipment</div>
          <div className="flex items-center justify-center bg-slate-50 rounded-lg overflow-hidden">
            <img
              src="/Images/Heat Exchanger Example.jpg"
              alt="Heat Exchanger Equipment"
              className="w-full max-h-80 object-contain"
            />
          </div>
          <div className="text-xs text-slate-600 mt-3 text-center">
            This is where your DC capital cost investment goes. The heat exchanger captures waste heat and makes it available for beneficial use.
          </div>
        </div>
      </div>
    </main>
  );
}
