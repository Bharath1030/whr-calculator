"use client";

import React, { useState } from "react";
import { Card, StatTile, SliderRow, MetricRow } from "../../components/ui";

export default function PageV2() {
  const [mw, setMw] = useState(50);
  const [hours, setHours] = useState(4000);

  const annual = mw * hours;

  return (
    <main className="mx-auto max-w-4xl p-6 font-sans">
      <h1 className="text-2xl font-bold">WHR — V2 Playground</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <StatTile label="IT load" value={`${mw} MW`} sub="Interactive slider" />
        <StatTile label="Annual MWh" value={`${annual.toLocaleString()} MWh/yr`} />
      </div>

      <div className="mt-6">
        <Card title="Inputs">
          <SliderRow label="IT load (MW)" value={mw} setValue={setMw} min={0} max={200} step={1} unit="MW" />
          <SliderRow label="Operating hours" value={hours} setValue={setHours} min={0} max={8760} step={10} unit="hrs" />
        </Card>
      </div>

      <div className="mt-6">
        <Card title="Summary">
          <MetricRow label="Annual recoverable heat" value={`${annual.toLocaleString()} MWh/yr`} />
        </Card>
      </div>
    </main>
  );
}
