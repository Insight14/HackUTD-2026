import { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Play,
  RotateCcw,
  ShieldAlert,
  Radio,
  TrendingUp,
  SlidersHorizontal,
} from 'lucide-react';


interface TankState {
  id: string;
  name: string;
  total_capacity_bbl: number;
  working_capacity_bbl: number;
  high_high_threshold_bbl: number;
  high_threshold_bbl: number;
  current_level_bbl: number;
  fill_fraction: number;
  surface_area_sq_ft: number;
  inflow_bbl_per_hr: number;
  outflow_bbl_per_hr: number;
  net_rate_bbl_per_hr: number;
  time_to_high_high_minutes: number | null;
  is_hardware_node: boolean;
}

interface PumpState {
  id: string;
  name: string;
  tank_id: string;
  rated_flow_bbl_per_hr: number;
  actual_flow_bbl_per_hr: number;
  is_standby: boolean;
  status: 'RUNNING' | 'STOPPED' | 'FAILED' | 'STANDBY';
  discharge_pressure_psi: number;
  vibration_rms: number;
}

interface SensorReadings {
  tank_id: string;
  ultrasonic_level_fraction: number;
  camera_level_fraction: number | null;
  flow_balance_level_fraction: number;
  trust_status: 'THREE_WAY_AGREEMENT' | 'ODD_ONE_OUT' | 'SPLIT_CONFIDENCE' | 'VISION_OFFLINE';
  suspect_sensor: string | null;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface AlertItem {
  id: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  pump_id?: string;
  created_at: string;
}

interface SystemState {
  timestamp: string;
  simulation_time_minutes: number;
  status: 'NORMAL' | 'ACTION_NEEDED' | 'HIGH_LEVEL_WARNING' | 'FORCED_SHUTDOWN';
  tanks: TankState[];
  pumps: PumpState[];
  sensor_readings: Record<string, SensorReadings>;
  alerts: AlertItem[];
  total_inflow_bbl_per_hr: number;
  total_outflow_bbl_per_hr: number;
  synthetic_label: string;
}

export default function App() {
  const [state, setState] = useState<SystemState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);


  // Connect to Simulator WebSocket or Fallback to HTTP polling
  useEffect(() => {
    let timer: any;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/simulator/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.tanks) {
          setState(data);
        }
      } catch (err) {
        console.error('Failed to parse telemetry frame', err);
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      // Fallback polling
      timer = setInterval(() => {
        fetch('/api/simulator/state')
          .then((r) => r.json())
          .then((d) => setState(d))
          .catch(() => {});
      }, 1000);
    };

    return () => {
      if (ws) ws.close();
      if (timer) clearInterval(timer);
    };
  }, []);

  const handleStep = async (dt = 5.0) => {
    try {
      const res = await fetch('/api/simulator/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dt_seconds: dt }),
      });
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error('Step request failed', err);
    }
  };

  const handleReset = async () => {
    try {
      const res = await fetch('/api/simulator/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 42 }),
      });
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error('Reset request failed', err);
    }
  };

  const handleTripPump = async (pumpId: string) => {
    try {
      const res = await fetch('/api/simulator/fault/pump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pump_id: pumpId }),
      });
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error('Pump trip failed', err);
    }
  };

  const handleRestorePump = async (pumpId: string) => {
    try {
      const res = await fetch('/api/simulator/fault/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pump_id: pumpId, status: 'RUNNING' }),
      });
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error('Pump restore failed', err);
    }
  };

  const handleInjectDrift = async (tankId: string, drift: number) => {
    try {
      const res = await fetch('/api/simulator/fault/sensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tank_id: tankId, drift_fraction: drift }),
      });
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error('Sensor drift failed', err);
    }
  };

  const handleSurge = async (multiplier: number) => {
    try {
      const res = await fetch('/api/simulator/fault/surge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiplier }),
      });
      const data = await res.json();
      setState(data);
    } catch (err) {
      console.error('Inflow surge failed', err);
    }
  };

  const primaryTank = state?.tanks.find((t) => t.id === 'tank_a');
  const primarySensor = state?.sensor_readings['tank_a'];
  const p1 = state?.pumps.find((p) => p.id === 'p_1');

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'ACTION_NEEDED':
        return (
          <span className="px-3 py-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold flex items-center gap-1.5 animate-pulse">
            <AlertTriangle className="w-4 h-4" /> STATUS: ACTION NEEDED
          </span>
        );
      case 'FORCED_SHUTDOWN':
        return (
          <span className="px-3 py-1 rounded bg-red-500/20 text-red-400 border border-red-500/40 font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" /> STATUS: FORCED SHUTDOWN
          </span>
        );
      case 'HIGH_LEVEL_WARNING':
        return (
          <span className="px-3 py-1 rounded bg-amber-600/20 text-amber-300 border border-amber-600/40 font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> HIGH LEVEL WARNING
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> STATUS: NORMAL
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Top Banner */}
      <header className="border-b border-slate-800 bg-[#0E1522] px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-lg font-black tracking-widest text-cyan-400 font-mono">TIDEWATCH</span>
          </div>
          <span className="text-xs text-slate-400 font-mono border-l border-slate-700 pl-3">
            AVON WATER SYSTEM • PERMIAN BASIN
          </span>
        </div>

        <div className="flex items-center gap-3">
          {getStatusBadge(state?.status)}
          <div className="text-xs font-mono bg-slate-900 px-3 py-1.5 rounded border border-slate-800 flex items-center gap-3 text-slate-300">
            <span>CLOCK: 02:07 NIGHT</span>
            <span className="text-slate-600">|</span>
            <span>SIM TIME: {state?.simulation_time_minutes ?? 0}m</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400 font-semibold">{state?.synthetic_label ?? 'SYNTHETIC'}</span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Top KPI Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Tank A Level Card */}
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-4 relative overflow-hidden">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-mono uppercase text-slate-400">Tank A (Rig Node)</span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400">
                CAP: {primaryTank?.total_capacity_bbl} bbl
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-3xl font-black font-mono text-white">
                {Math.round((primaryTank?.fill_fraction ?? 0) * 100)}%
              </span>
              <span className="text-xs text-slate-400 font-mono">
                ({primaryTank?.current_level_bbl.toFixed(0)} bbl)
              </span>
            </div>
            {/* Fill Level Bar */}
            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden mb-2">
              <div
                className={`h-full transition-all duration-300 ${
                  (primaryTank?.fill_fraction ?? 0) > 0.8
                    ? 'bg-red-500'
                    : (primaryTank?.fill_fraction ?? 0) > 0.7
                    ? 'bg-amber-400'
                    : 'bg-cyan-500'
                }`}
                style={{ width: `${Math.min(100, (primaryTank?.fill_fraction ?? 0) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono text-slate-400">
              <span>Hi-Hi: {primaryTank?.high_high_threshold_bbl} bbl</span>
              <span className={primaryTank?.net_rate_bbl_per_hr && primaryTank.net_rate_bbl_per_hr > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                Net: {primaryTank?.net_rate_bbl_per_hr ?? 0 > 0 ? `+${primaryTank?.net_rate_bbl_per_hr}` : primaryTank?.net_rate_bbl_per_hr} bbl/h
              </span>
            </div>
          </div>

          {/* Time to High-High Alert Card */}
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Time to High-High
              </span>
              <span className="text-[11px] font-mono text-slate-500">Tank A</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className={`text-3xl font-black font-mono ${primaryTank?.time_to_high_high_minutes ? 'text-amber-400' : 'text-slate-400'}`}>
                {primaryTank?.time_to_high_high_minutes !== null ? `${primaryTank?.time_to_high_high_minutes} min` : 'BALANCED'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-tight">
              {primaryTank?.time_to_high_high_minutes !== null
                ? 'Deterministic time remaining before forced wellhead shutdown.'
                : 'Current outflow meets or exceeds inflow rate.'}
            </p>
          </div>

          {/* Network Inflow vs Outflow */}
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" /> Network Flow
              </span>
              <span className="text-[11px] font-mono text-slate-500">Total</span>
            </div>
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between py-0.5 border-b border-slate-800">
                <span className="text-slate-400">Total Inflow:</span>
                <span className="text-cyan-400 font-bold">{state?.total_inflow_bbl_per_hr ?? 0} bbl/h</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-800">
                <span className="text-slate-400">Total Outflow:</span>
                <span className="text-emerald-400 font-bold">{state?.total_outflow_bbl_per_hr ?? 0} bbl/h</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-400">Net Accumulation:</span>
                <span className={(state?.total_inflow_bbl_per_hr ?? 0) > (state?.total_outflow_bbl_per_hr ?? 0) ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                  {Math.round(((state?.total_inflow_bbl_per_hr ?? 0) - (state?.total_outflow_bbl_per_hr ?? 0)) * 10) / 10} bbl/h
                </span>
              </div>
            </div>
          </div>

          {/* 3-Estimate Sensor Trust Card */}
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-mono uppercase text-slate-400 flex items-center gap-1">
                <Radio className="w-3.5 h-3.5 text-indigo-400" /> Sensor Trust
              </span>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                  primarySensor?.confidence_level === 'HIGH'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : primarySensor?.confidence_level === 'MEDIUM'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-red-950 text-red-400 border border-red-800'
                }`}
              >
                {primarySensor?.confidence_level} CONFIDENCE
              </span>
            </div>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">1. Ultrasonic:</span>
                <span className="text-slate-200">{Math.round((primarySensor?.ultrasonic_level_fraction ?? 0) * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">2. Optical Camera:</span>
                <span className="text-slate-200">
                  {primarySensor?.camera_level_fraction !== null
                    ? `${Math.round((primarySensor?.camera_level_fraction ?? 0) * 100)}%`
                    : 'OFFLINE'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">3. Flow Balance:</span>
                <span className="text-slate-200">{Math.round((primarySensor?.flow_balance_level_fraction ?? 0) * 100)}%</span>
              </div>
            </div>
            {primarySensor?.suspect_sensor && (
              <div className="mt-2 text-[10px] text-amber-400 font-mono bg-amber-950/40 p-1 rounded border border-amber-800/40">
                Suspect: {primarySensor.suspect_sensor.toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Equipment Status & Transfer Pumps */}
        <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase font-mono mb-4 flex items-center gap-2">
            <Gauge className="w-4 h-4 text-cyan-400" /> Transfer Pumps & Gathering Infrastructure
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state?.pumps.map((pump) => (
              <div
                key={pump.id}
                className={`p-4 rounded-lg border font-mono text-xs transition-all ${
                  pump.status === 'FAILED'
                    ? 'bg-red-950/20 border-red-800/80 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                    : pump.status === 'RUNNING'
                    ? 'bg-slate-900/60 border-slate-700'
                    : 'bg-slate-950/40 border-slate-800'
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-slate-200">{pump.name}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      pump.status === 'RUNNING'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : pump.status === 'FAILED'
                        ? 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {pump.status}
                  </span>
                </div>
                <div className="space-y-1.5 text-slate-400">
                  <div className="flex justify-between">
                    <span>Flow Rate:</span>
                    <span className="text-slate-100 font-bold">{pump.actual_flow_bbl_per_hr} bbl/h</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discharge Pressure:</span>
                    <span className="text-slate-100">{pump.discharge_pressure_psi} psi</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vibration RMS:</span>
                    <span className="text-slate-100">{pump.vibration_rms} in/s</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Role:</span>
                    <span className="text-slate-400">{pump.is_standby ? 'Standby Unit' : 'Primary Duty'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Scenario & Simulator Test Bench */}
        <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase font-mono flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-amber-400" /> Scenario Injection & Simulator Controls
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleStep(5.0)}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-xs font-mono font-bold flex items-center gap-1.5 shadow"
              >
                <Play className="w-3.5 h-3.5" /> Step (+5s)
              </button>
              <button
                onClick={() => handleReset()}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold flex items-center gap-1.5 border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset (Seed 42)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
            {/* Trip Pump 1 */}
            <button
              onClick={() => (p1?.status === 'FAILED' ? handleRestorePump('p_1') : handleTripPump('p_1'))}
              className={`p-3 rounded border text-left flex flex-col justify-between transition-colors ${
                p1?.status === 'FAILED'
                  ? 'bg-emerald-950/40 border-emerald-700 hover:bg-emerald-900/50'
                  : 'bg-red-950/40 border-red-800 hover:bg-red-900/50'
              }`}
            >
              <span className="text-slate-300 font-bold mb-1">
                {p1?.status === 'FAILED' ? '✓ Restore Pump P-1' : '⚠ Inject Failure: Pump P-1'}
              </span>
              <span className="text-[10px] text-slate-400">
                {p1?.status === 'FAILED' ? 'Resume 120 bbl/h outflow' : 'Drops outflow to 0 bbl/h (S1)'}
              </span>
            </button>

            {/* Drift Sensor */}
            <button
              onClick={() => handleInjectDrift('tank_a', 0.22)}
              className="p-3 rounded border border-amber-800/80 bg-amber-950/30 hover:bg-amber-900/40 text-left flex flex-col justify-between"
            >
              <span className="text-amber-300 font-bold mb-1">⚠ Inject Sensor Drift (+22%)</span>
              <span className="text-[10px] text-slate-400">Forces 3-way split confidence (S3)</span>
            </button>

            {/* Inflow Surge */}
            <button
              onClick={() => handleSurge(1.6)}
              className="p-3 rounded border border-indigo-800/80 bg-indigo-950/30 hover:bg-indigo-900/40 text-left flex flex-col justify-between"
            >
              <span className="text-indigo-300 font-bold mb-1">⚠ Water-Cut Surge (+60%)</span>
              <span className="text-[10px] text-slate-400">Simulates well production spike (S4)</span>
            </button>

            {/* Clear Faults */}
            <button
              onClick={handleReset}
              className="p-3 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-left flex flex-col justify-between"
            >
              <span className="text-slate-300 font-bold mb-1">Reset Baseline State</span>
              <span className="text-[10px] text-slate-500">Restore normal operations</span>
            </button>
          </div>
        </div>

        {/* Live Alerts Feed */}
        {state?.alerts && state.alerts.length > 0 && (
          <div className="bg-[#121A27] border border-red-900/60 rounded-lg p-4">
            <h3 className="text-xs font-mono font-bold text-red-400 uppercase mb-2 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" /> Active Operational Alerts ({state.alerts.length})
            </h3>
            <div className="space-y-1.5 font-mono text-xs">
              {state.alerts.map((alert) => (
                <div key={alert.id} className="p-2 rounded bg-red-950/40 border border-red-900/50 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-red-300 mr-2">[{alert.severity}]</span>
                    <span className="text-slate-200">{alert.title}: </span>
                    <span className="text-slate-400">{alert.message}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{new Date(alert.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-[#0E1522] px-6 py-3 flex justify-between items-center text-xs text-slate-500 font-mono">
        <div>TIDEWATCH CONSOLE • PHASE 1 VERTICAL SLICE VALIDATED</div>
        <div className="flex gap-4">
          <span>SEED: 42</span>
          <span>SPACETIMEDB SCHEMA: READY</span>
          <span>HUMAN APPROVAL GATE: ACTIVE</span>
        </div>
      </footer>
    </div>
  );
}
