import React, { useState, useEffect } from 'react';
import { Activity, ShieldAlert, CheckCircle2, Clock, Users, Database } from 'lucide-react';

interface BackendHealth {
  status: string;
  service: string;
  environment: string;
  integrations: {
    spacetimedb: { uri: string; database: string };
    tiger_data: { enabled: boolean };
    nvidia_nemotron: { enabled: boolean };
    mongodb: { enabled: boolean };
  };
}

export default function App() {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Backend connection check failed:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 p-6 flex flex-col justify-between">
      {/* Top Banner */}
      <header className="border-b border-slate-800 pb-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xl font-bold tracking-wider uppercase font-mono text-cyan-400">
            TIDEWATCH
          </h1>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
            Avon Salt-Water Operations
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <span>SHIFT: NIGHT (02:00)</span>
          <span className="text-slate-600">|</span>
          <span>ROLE: LEAD OPERATOR</span>
          <span className="text-slate-600">|</span>
          <span className="px-2 py-1 rounded bg-amber-950/40 text-amber-400 border border-amber-800/50">
            SYNTHETIC DATA LABELED
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6 flex-grow">
        {/* Status Card */}
        <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" /> System Status
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              NORMAL
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Avon produced-water gathering network is balanced. Monitoring 2 tanks, 3 transfer pumps, and 4 well feeds.
          </p>
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-500">Tank A (Rig Node):</span>
              <span className="text-slate-200">41% (Normal)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-500">Transfer Pump P-1:</span>
              <span className="text-emerald-400">RUNNING (120 bbl/h)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/50">
              <span className="text-slate-500">Standby Pump P-2:</span>
              <span className="text-slate-400">READY</span>
            </div>
          </div>
        </div>

        {/* Integration Status Card */}
        <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-400" /> Platform Services
            </h2>
            <span className="text-xs text-slate-400 font-mono">Phase 0 Scaffolding</span>
          </div>
          {loading ? (
            <p className="text-xs text-slate-500">Connecting to backend...</p>
          ) : (
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">FastAPI Backend:</span>
                <span className="text-emerald-400 font-semibold">{health?.status || 'Connecting...'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">SpacetimeDB State:</span>
                <span className="text-amber-400">Module Initialized</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">Tiger Data Telemetry:</span>
                <span className="text-slate-500">PostgreSQL Adapter Ready</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/50">
                <span className="text-slate-400">NVIDIA Nemotron:</span>
                <span className="text-slate-500">NIM Provider Ready</span>
              </div>
            </div>
          )}
        </div>

        {/* Safety & Protocol Card */}
        <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> Safety Boundary
            </h2>
            <span className="text-xs px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800/40">
              ENFORCED
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed mb-3">
            Deterministic Python decision engine owns all math, forecasts, and plan evaluations.
          </p>
          <div className="bg-slate-900/60 border border-slate-800 rounded p-3 text-[11px] text-amber-300/90 font-mono">
            Safety Invariant: The AI assistant cannot approve plans or actuate field hardware. Only certified human operators may execute response actions.
          </div>
        </div>
      </main>

      {/* Footer Audit Bar */}
      <footer className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500 font-mono">
        <div>Tidewatch v0.1.0 • EOG Produced Water Console</div>
        <div className="flex items-center gap-4">
          <span>Decisions Synchronized: SpacetimeDB</span>
          <span>Deterministic Seed: 42</span>
        </div>
      </footer>
    </div>
  );
}
