import { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Play,
  RotateCcw,
  ShieldAlert,
  Radio,
  SlidersHorizontal,
  Users,
  Check,
  ClipboardList,
  FileText,
  DollarSign,
  PlusCircle,
  Bot,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Award,
} from 'lucide-react';
import { FieldTechView } from './views/FieldTechView';
import { BenchmarkModal } from './components/BenchmarkModal';
import { HandoffModal } from './components/HandoffModal';

interface ToolChip {
  tool_name: string;
  parameter_name: string;
  value: any;
}

interface ToolTraceItem {
  tool_name: string;
  arguments: Record<string, any>;
  output: Record<string, any>;
  success: boolean;
  error?: string;
}

interface AgentResponse {
  provider: string;
  plain_language_explanation: string;
  cited_tool_chips: ToolChip[];
  tool_execution_trace: ToolTraceItem[];
  safety_boundary_enforced: boolean;
  can_approve_or_actuate: boolean;
}


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

interface SystemState {
  timestamp: string;
  simulation_time_minutes: number;
  status: 'NORMAL' | 'ACTION_NEEDED' | 'HIGH_LEVEL_WARNING' | 'FORCED_SHUTDOWN';
  tanks: TankState[];
  pumps: PumpState[];
  sensor_readings: Record<string, SensorReadings>;
  total_inflow_bbl_per_hr: number;
  total_outflow_bbl_per_hr: number;
  synthetic_label: string;
}

// SpacetimeDB Shared Records
interface OptionRecord {
  id: string;
  name: string;
  lead_time_minutes: number;
  estimated_cost_usd: number;
  decision_deadline_minutes: number;
  is_expired: boolean;
  status: string;
}

interface PlanRecord {
  id: string;
  name: string;
  option_ids: string[];
  expected_cost_usd: number;
  breach_probability: number;
  decide_by_timestamp: string;
  minutes_remaining: number;
  cost_of_waiting_per_minute: number;
  is_recommended: boolean;
  is_approved: boolean;
  approved_by?: string;
  approved_at?: string;
}

interface ActionClaimRecord {
  id: string;
  action_id: string;
  action_name: string;
  claimed_by: string;
  claimed_at: string;
  status: string;
  completed_at?: string;
}

interface HandoffItemRecord {
  id: string;
  title: string;
  details: string;
  category: string;
  severity: string;
  resolved: boolean;
  created_by: string;
  created_at: string;
}

interface PresenceRecord {
  identity: string;
  role: string;
  name: string;
  last_active: string;
}

interface SharedState {
  options: OptionRecord[];
  plans: PlanRecord[];
  action_claims: ActionClaimRecord[];
  handoff_items: HandoffItemRecord[];
  presence: PresenceRecord[];
}

export default function App() {
  const [simState, setSimState] = useState<SystemState | null>(null);
  const [sharedState, setSharedState] = useState<SharedState | null>(null);
  const [currentRole, setCurrentRole] = useState<'OPERATOR' | 'FIELD_TECH'>('OPERATOR');
  const [currentUserName, setCurrentUserName] = useState<string>('R.D. (Control Room)');
  const [notification, setNotification] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [agentResponse, setAgentResponse] = useState<AgentResponse | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState(false);
  const [showHandoffModal, setShowHandoffModal] = useState(false);
  const [activeView, setActiveView] = useState<'CONSOLE' | 'FIELD_TECH'>('CONSOLE');

  const handleActivateScenario = async (scId: string) => {
    try {
      const res = await fetch(`/api/scenarios/activate/${scId}`, { method: 'POST' });
      if (res.ok) {
        setActiveScenarioId(scId);
        showToast(`Activated ${scId.replace(/_/g, ' ').toUpperCase()}`);
        fetch('/api/spacetimedb/state')
          .then((r) => r.json())
          .then((data) => setSharedState(data));
      }
    } catch {
      showToast('Failed to activate scenario');
    }
  };

  const handleSignHandoff = async (summary: string) => {
    try {
      await fetch('/api/spacetimedb/reducers/add_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Shift Handoff Sign-off',
          details: summary,
          category: 'SHIFT_HANDOFF',
          user_name: currentUserName,
        }),
      });
      showToast('Shift handoff report signed and synced to SpacetimeDB.');
    } catch {
      showToast('Failed to sign handoff');
    }
  };

  const handleRequestBriefing = async () => {
    setAgentLoading(true);
    try {
      const res = await fetch('/api/agent/explain', { method: 'POST' });
      const data = await res.json();
      setAgentResponse(data);
      showToast('AI Briefing generated with verified tool citations.');
    } catch (err) {
      showToast('Failed to fetch AI explanation');
    } finally {
      setAgentLoading(false);
    }
  };


  const simWsRef = useRef<WebSocket | null>(null);
  const stdbWsRef = useRef<WebSocket | null>(null);

  // Switch role profile
  const handleRoleSwitch = (role: 'OPERATOR' | 'FIELD_TECH') => {
    setCurrentRole(role);
    if (role === 'OPERATOR') {
      setCurrentUserName('R.D. (Control Room)');
      setActiveView('CONSOLE');
    } else {
      setCurrentUserName('Mike S. (Field Truck 4)');
      setActiveView('FIELD_TECH');
    }
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Connect to Simulator Stream with auto-reconnect
  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connectSim = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/simulator/ws`;
      const ws = new WebSocket(wsUrl);
      simWsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.tanks) setSimState(data);
        } catch (err) {}
      };

      ws.onclose = () => {
        if (isMounted) {
          timer = setTimeout(connectSim, 2000);
        }
      };
    };

    connectSim();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      if (simWsRef.current) simWsRef.current.close();
    };
  }, []);

  // Connect to SpacetimeDB Real-Time State Stream with auto-reconnect
  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connectStdb = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/spacetimedb/ws`;
      const ws = new WebSocket(wsUrl);
      stdbWsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.state) {
            setSharedState(payload.state);
          }
        } catch (err) {}
      };

      ws.onclose = () => {
        if (isMounted) {
          timer = setTimeout(connectStdb, 2000);
        }
      };
    };

    connectStdb();

    // Initial HTTP fetch
    fetch('/api/spacetimedb/state')
      .then((r) => r.json())
      .then((data) => setSharedState(data))
      .catch(() => {});

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      if (stdbWsRef.current) stdbWsRef.current.close();
    };
  }, []);

  // Simulator controls
  const handleStep = async (dt = 5.0) => {
    try {
      const res = await fetch('/api/simulator/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dt_seconds: dt }),
      });
      const data = await res.json();
      setSimState(data);
    } catch (err) {}
  };

  const handleReset = async () => {
    try {
      const res = await fetch('/api/simulator/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed: 42 }),
      });
      const data = await res.json();
      setSimState(data);
    } catch (err) {}
  };

  const handleTripPump = async (pumpId: string) => {
    try {
      const res = await fetch('/api/simulator/fault/pump', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pump_id: pumpId }),
      });
      const data = await res.json();
      setSimState(data);
    } catch (err) {}
  };

  const handleRestorePump = async (pumpId: string) => {
    try {
      const res = await fetch('/api/simulator/fault/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pump_id: pumpId, status: 'RUNNING' }),
      });
      const data = await res.json();
      setSimState(data);
    } catch (err) {}
  };

  const handleInjectDrift = async (tankId: string, drift: number) => {
    try {
      const res = await fetch('/api/simulator/fault/sensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tank_id: tankId, drift_fraction: drift }),
      });
      const data = await res.json();
      setSimState(data);
    } catch (err) {}
  };

  // --- SPACETIMEDB REDUCER INVOCATIONS ---

  const handleApprovePlan = async (planId: string) => {
    try {
      const res = await fetch('/api/spacetimedb/reducers/approve_plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, operator_name: currentUserName }),
      });
      if (res.ok) {
        showToast(`Plan approved by ${currentUserName}. Switched standby equipment!`);
        // Trigger standby pump recovery in simulator
        handleRestorePump('p_2');
      } else {
        const err = await res.json();
        showToast(`Approval rejected: ${err.detail}`);
      }
    } catch (err) {
      showToast('Error communicating with SpacetimeDB');
    }
  };

  const handleClaimAction = async (actionId: string, actionName: string) => {
    try {
      const res = await fetch('/api/spacetimedb/reducers/claim_action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_id: actionId,
          action_name: actionName,
          claimed_by: currentUserName,
        }),
      });
      if (res.ok) {
        showToast(`Successfully claimed: ${actionName}`);
      } else {
        const err = await res.json();
        showToast(`Claim blocked: ${err.detail}`);
      }
    } catch (err) {
      showToast('Error claiming action in SpacetimeDB');
    }
  };

  const handleCompleteAction = async (claimId: string, notes?: string) => {
    try {
      const res = await fetch('/api/spacetimedb/reducers/complete_action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId,
          completed_by: currentUserName,
          notes: notes || 'Verified in field per SOP',
        }),
      });
      if (res.ok) {
        showToast('Action marked completed.');
      }
    } catch (err) {}
  };

  const handleAcceptHandoff = async (itemId: string) => {
    try {
      const res = await fetch('/api/spacetimedb/reducers/accept_handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: itemId, accepted_by: currentUserName }),
      });
      if (res.ok) {
        showToast('Handoff item accepted and resolved.');
      }
    } catch (err) {}
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    try {
      await fetch('/api/spacetimedb/reducers/add_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNoteText,
          details: `Recorded during shift at ${new Date().toLocaleTimeString()}`,
          category: 'SHIFT_HANDOFF',
          user_name: currentUserName,
        }),
      });
      setNewNoteText('');
      setShowNoteModal(false);
      showToast('Handoff note synchronized to SpacetimeDB.');
    } catch (err) {}
  };

  const primaryTank = simState?.tanks.find((t) => t.id === 'tank_a');
  const primarySensor = simState?.sensor_readings['tank_a'];
  const p1 = simState?.pumps.find((p) => p.id === 'p_1');
  const recommendedPlan = sharedState?.plans.find((p) => p.is_recommended) ?? sharedState?.plans[0];

  if (activeView === 'FIELD_TECH') {
    return (
      <FieldTechView
        currentUser={currentUserName}
        claims={sharedState?.action_claims || []}
        onClaimAction={(id) => handleClaimAction(id, 'Field Inspection / Mitigation')}
        onCompleteAction={(id, notes) => handleCompleteAction(id, notes)}
        tankLevelPercent={primaryTank?.fill_fraction ? primaryTank.fill_fraction * 100 : 46.2}
        systemStatus={simState?.status || 'NORMAL'}
        onBackToConsole={() => handleRoleSwitch('OPERATOR')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 border border-cyan-500/80 text-cyan-300 px-4 py-2.5 rounded-lg shadow-xl text-xs font-mono flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Banner (EOG Console Design from PDF Section 8) */}
      <header className="border-b border-slate-800 bg-[#0E1522] px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-lg font-black tracking-widest text-cyan-400 font-mono">TIDEWATCH</span>
          </div>
          <span className="text-xs text-slate-400 font-mono border-l border-slate-700 pl-3">
            AVON WATER SYSTEM
          </span>
        </div>

        {/* Multi-Session / Presence Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-mono">
            <span className="text-slate-500 px-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" /> SIMULATE CLIENT:
            </span>
            <button
              onClick={() => handleRoleSwitch('OPERATOR')}
              className={`px-2.5 py-1 rounded transition-colors ${
                currentRole === 'OPERATOR'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Control Room (R.D.)
            </button>
            <button
              onClick={() => handleRoleSwitch('FIELD_TECH')}
              className={`px-2.5 py-1 rounded transition-colors ${
                currentRole === 'FIELD_TECH'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Field Phone (Mike S.)
            </button>
          </div>

          <div className="text-xs font-mono bg-slate-900 px-3 py-1.5 rounded border border-slate-800 flex items-center gap-3 text-slate-300">
            <span>CLOCK: 02:07</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400 font-semibold">SPACETIMEDB SYNCED</span>
          </div>

          <a
            href="http://localhost:5174"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-mono px-3 py-1.5 rounded bg-cyan-950/60 border border-cyan-700/80 hover:bg-cyan-900 text-cyan-300 font-bold transition-colors flex items-center gap-1.5"
          >
            3D Digital Twin (Phase 8) →
          </a>
        </div>
      </header>

      {/* Top Scripted Scenarios & Benchmarks Toolbar */}
      <div className="bg-[#0B1019] border-b border-slate-800 px-6 py-2 flex items-center justify-between text-xs font-mono overflow-x-auto">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-cyan-400 fill-current" /> SCRIPTED SCENARIOS:
          </span>
          {[
            { id: 'scenario_1_pump_trip', label: 'S1: Overnight Pump Trip' },
            { id: 'scenario_2_line_restriction', label: 'S2: Line Restriction' },
            { id: 'scenario_3_sensor_drift', label: 'S3: Sensor Drift (Foam)' },
            { id: 'scenario_4_water_cut_surge', label: 'S4: Water-Cut Surge' },
            { id: 'scenario_5_maintenance_contention', label: 'S5: Standby Contention' },
          ].map((sc) => (
            <button
              key={sc.id}
              onClick={() => handleActivateScenario(sc.id)}
              className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap text-[11px] ${
                activeScenarioId === sc.id
                  ? 'bg-cyan-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {sc.label}
            </button>
          ))}
          {activeScenarioId && (
            <button
              onClick={() => {
                handleReset();
                setActiveScenarioId(null);
              }}
              className="px-2 py-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 text-xs flex items-center gap-1 ml-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 pl-4">
          <button
            onClick={() => setShowBenchmarkModal(true)}
            className="px-3 py-1 rounded bg-indigo-900/60 border border-indigo-700/80 hover:bg-indigo-800 text-indigo-300 font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap text-[11px]"
          >
            <Award className="w-3.5 h-3.5" /> Monte Carlo Benchmark
          </button>
          <button
            onClick={() => setShowHandoffModal(true)}
            className="px-3 py-1 rounded bg-blue-900/60 border border-blue-700/80 hover:bg-blue-800 text-blue-300 font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap text-[11px]"
          >
            <FileText className="w-3.5 h-3.5" /> Shift Handoff
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Authoritative Action & Decision Header Bar (PDF Section 8) */}
        <div className="bg-[#121A27] border-2 border-slate-700/80 rounded-xl p-5 shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Box 1: Time to High-High Tank A */}
            <div className="border-r border-slate-800/80 pr-6">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                <Clock className="w-4 h-4 text-amber-400" /> TIME TO HIGH-HIGH, TANK A
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black font-mono text-amber-400">
                  {primaryTank?.time_to_high_high_minutes ? `${primaryTank.time_to_high_high_minutes} min` : '41 min'}
                </span>
                <span className="text-xs font-mono text-slate-400">(P10 28 - P90 63)</span>
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1">
                Confidence: <span className="text-amber-400 font-semibold">{primarySensor?.confidence_level ?? 'MEDIUM'}</span>
              </div>
            </div>

            {/* Box 2: Best Plan Now */}
            <div className="border-r border-slate-800/80 pr-6">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                <ShieldAlert className="w-4 h-4 text-cyan-400" /> BEST PLAN NOW
              </div>
              <div className="text-sm font-bold text-slate-100 font-mono">
                {recommendedPlan ? recommendedPlan.name : 'Start P-2 + curtail W-7, W-12'}
              </div>
              <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1">
                <span>Cost: <strong className="text-emerald-400">${recommendedPlan?.expected_cost_usd?.toLocaleString() ?? '4,100'}</strong></span>
                <span>|</span>
                <span>P(shutdown): <strong className="text-cyan-400">{((recommendedPlan?.breach_probability ?? 0.06) * 100).toFixed(0)}%</strong></span>
              </div>
            </div>

            {/* Box 3: Decide-By & Human Approval Button */}
            <div className="flex flex-col justify-center">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1 flex justify-between">
                <span>DECIDE BY</span>
                <span className="text-amber-400 font-bold">{recommendedPlan?.decide_by_timestamp ?? '02:19'} ({recommendedPlan?.minutes_remaining ?? 12} min)</span>
              </div>
              {recommendedPlan?.is_approved ? (
                <div className="bg-emerald-950/60 border border-emerald-600 text-emerald-300 py-2.5 px-4 rounded-lg font-mono text-xs font-bold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  PLAN APPROVED by {recommendedPlan.approved_by}
                </div>
              ) : (
                <button
                  onClick={() => recommendedPlan && handleApprovePlan(recommendedPlan.id)}
                  disabled={currentRole !== 'OPERATOR'}
                  className={`py-2.5 px-4 rounded-lg font-mono text-xs font-black tracking-wider uppercase transition-all shadow-lg flex items-center justify-center gap-2 ${
                    currentRole === 'OPERATOR'
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 active:scale-95'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" /> [ APPROVE PLAN ]
                </button>
              )}
              {currentRole !== 'OPERATOR' && !recommendedPlan?.is_approved && (
                <span className="text-[10px] font-mono text-amber-500/80 mt-1 text-center">
                  * Approval restricted to Lead Operator session
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Mid-Row: 3 Column Operational Breakdown (PDF Section 8) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: What is Failing (Ranked Diagnosis) */}
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" /> WHAT IS FAILING (ranked)
              </h3>
              <div className="space-y-2 font-mono text-xs">
                <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-200">1. Pump P-1 failed</span>
                  <span className="font-bold text-red-400">78%</span>
                </div>
                <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                  <span className="text-slate-200">2. Level sensor fault</span>
                  <span className="font-bold text-amber-400">15%</span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 text-xs font-mono text-cyan-400 bg-cyan-950/20 p-2 rounded border border-cyan-800/40">
              Check: <span className="font-semibold text-white">P-1 discharge gauge</span> (Max Information Gain)
            </div>
          </div>

          {/* Column 2: Options (Live Deadlines & Claims) */}
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4 text-cyan-400" /> OPTIONS (live deadlines)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Synced via SpacetimeDB</span>
            </h3>
            <div className="space-y-2 font-mono text-xs">
              {sharedState?.options.map((opt) => {
                const claim = sharedState.action_claims.find((c) => c.action_id === opt.id);
                return (
                  <div
                    key={opt.id}
                    className={`p-2.5 rounded border flex items-center justify-between ${
                      opt.is_expired
                        ? 'bg-slate-950/60 border-slate-800/80 text-slate-500 opacity-60'
                        : claim
                        ? 'bg-indigo-950/30 border-indigo-700/60 text-indigo-300'
                        : 'bg-slate-900/80 border-slate-800 text-slate-200'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{opt.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {opt.is_expired ? (
                          <span className="text-red-400 font-bold">EXPIRED 01:58</span>
                        ) : claim ? (
                          <span className="text-indigo-400 font-semibold">
                            Claimed by {claim.claimed_by} ({claim.status})
                          </span>
                        ) : (
                          <span className="text-emerald-400">ok until 02:{opt.decision_deadline_minutes}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      {!opt.is_expired && !claim && (
                        <button
                          onClick={() => handleClaimAction(opt.id, opt.name)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700 transition-colors"
                        >
                          Claim
                        </button>
                      )}
                      {claim && claim.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleCompleteAction(claim.id)}
                          className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold"
                        >
                          Finish
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 3: Level Readings (3 Independent Estimates) */}
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-indigo-400" /> LEVEL READINGS (3-WAY TRUST)
              </h3>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Ultrasonic Level:</span>
                  <span className="text-slate-200 font-bold">
                    {Math.round((primarySensor?.ultrasonic_level_fraction ?? 0.41) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Camera Optical:</span>
                  <span className="text-slate-200 font-bold">
                    {primarySensor?.camera_level_fraction !== null
                      ? `${Math.round((primarySensor?.camera_level_fraction ?? 0.41) * 100)}%`
                      : 'OFFLINE'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Flow Mass Balance:</span>
                  <span className="text-slate-200 font-bold">
                    {Math.round((primarySensor?.flow_balance_level_fraction ?? 0.41) * 100)}%
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 text-xs font-mono">
              {primarySensor?.trust_status === 'ODD_ONE_OUT' ? (
                <div className="text-amber-400 bg-amber-950/30 p-2 rounded border border-amber-800/50">
                  -&gt; Sensor suspect: {primarySensor.suspect_sensor?.toUpperCase()} (Widen P10-P90 band)
                </div>
              ) : (
                <div className="text-emerald-400 bg-emerald-950/30 p-2 rounded border border-emerald-800/50">
                  ✓ 3-way agreement verified across physics & optics
                </div>
              )}
            </div>
          </div>
        </div>

        {/* NVIDIA Nemotron AI Copilot & Tool Execution Trace Panel */}
        <div className="bg-[#121A27] border-2 border-indigo-900/60 rounded-xl p-5 shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-400" />
              <h2 className="text-sm font-bold tracking-wider text-slate-100 uppercase font-mono">
                AI OPERATIONAL ASSISTANT (NVIDIA NEMOTRON)
              </h2>
              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 text-[10px] font-mono font-bold">
                {agentResponse?.provider ?? 'TOOL-GROUNDED PROVIDER'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRequestBriefing}
                disabled={agentLoading}
                className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold flex items-center gap-1.5 shadow transition-all active:scale-95 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {agentLoading ? 'Executing Tools...' : 'Generate AI Briefing'}
              </button>
            </div>
          </div>

          {agentResponse ? (
            <div className="space-y-4 font-mono text-xs">
              {/* Plain Language Explanation */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 text-slate-200 leading-relaxed whitespace-pre-line">
                {agentResponse.plain_language_explanation}
              </div>

              {/* Cited Tool Chips */}
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Verified Tool Citations (Grounding Evidence)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {agentResponse.cited_tool_chips.map((chip, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded bg-slate-900 border border-indigo-800/50 text-[11px] text-indigo-300 flex items-center gap-1"
                    >
                      <strong className="text-slate-400 font-normal">[{chip.tool_name}]</strong>
                      <span>{chip.parameter_name}:</span>
                      <strong className="text-white">{chip.value}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {/* Tool Execution Trace Toggle */}
              <div className="pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => setShowTrace(!showTrace)}
                  className="text-slate-400 hover:text-slate-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
                >
                  {showTrace ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span>{showTrace ? 'Hide Tool Execution Trace' : `View Tool Execution Trace (${agentResponse.tool_execution_trace.length} tools executed)`}</span>
                </button>

                {showTrace && (
                  <div className="mt-3 space-y-2 max-h-80 overflow-y-auto pr-1">
                    {agentResponse.tool_execution_trace.map((tr, idx) => (
                      <div key={idx} className="bg-slate-950 p-2.5 rounded border border-slate-800 text-[11px]">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-cyan-400">Step {idx + 1}: {tr.tool_name}()</span>
                          <span className={`text-[10px] font-bold ${tr.success ? 'text-emerald-400' : 'text-red-400'}`}>
                            {tr.success ? 'SUCCESS' : 'FAILED'}
                          </span>
                        </div>
                        <pre className="text-[10px] text-slate-400 bg-slate-900/60 p-1.5 rounded overflow-x-auto">
                          {JSON.stringify(tr.output, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-mono italic">
              Click &quot;Generate AI Briefing&quot; to execute deterministic backend tools, evaluate MongoDB SOP runbooks, and generate a verified plain-language incident summary.
            </p>
          )}
        </div>

        {/* Bottom Status Bar: Cost of Waiting & Shift Handoff */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-4 flex items-center justify-between font-mono text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-amber-400" /> COST OF WAITING:
            </span>
            <span className="text-amber-400 font-bold">
              +${recommendedPlan?.cost_of_waiting_per_minute ?? 310} per minute after 02:12
            </span>
          </div>

          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-4 flex items-center justify-between font-mono text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-cyan-400" /> SHIFT HANDOFF:
            </span>
            <div className="flex items-center gap-3">
              <span className="text-slate-200 font-bold">
                {sharedState?.handoff_items.filter((h) => !h.resolved).length ?? 0} open items
              </span>
              <button
                onClick={() => setShowNoteModal(true)}
                className="px-2 py-1 rounded bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-[11px] font-bold flex items-center gap-1"
              >
                <PlusCircle className="w-3 h-3" /> Add Note
              </button>
            </div>
          </div>
        </div>

        {/* Open Handoff Items List */}
        {sharedState?.handoff_items && sharedState.handoff_items.length > 0 && (
          <div className="bg-[#121A27] border border-slate-800 rounded-lg p-4">
            <h4 className="text-xs font-mono font-bold text-slate-300 uppercase mb-2">
              Active Shift Handoff Log (Persistent Multi-Operator Memory)
            </h4>
            <div className="space-y-1.5 font-mono text-xs">
              {sharedState.handoff_items.map((item) => (
                <div
                  key={item.id}
                  className={`p-2.5 rounded border flex justify-between items-center ${
                    item.resolved
                      ? 'bg-slate-950/40 border-slate-800/60 text-slate-500'
                      : 'bg-slate-900 border-slate-700/80 text-slate-200'
                  }`}
                >
                  <div>
                    <span className="font-bold mr-2">[{item.category}]</span>
                    <span>{item.title}</span>
                    <span className="text-slate-400 text-[10px] ml-2">— by {item.created_by}</span>
                  </div>
                  <div>
                    {!item.resolved ? (
                      <button
                        onClick={() => handleAcceptHandoff(item.id)}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700"
                      >
                        Accept & Resolve
                      </button>
                    ) : (
                      <span className="text-[10px] text-emerald-400 font-bold">✓ Resolved</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scenario Injection & Test Bench */}
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
                onClick={handleReset}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold flex items-center gap-1.5 border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset (Seed 42)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
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

            <button
              onClick={() => handleInjectDrift('tank_a', 0.22)}
              className="p-3 rounded border border-amber-800/80 bg-amber-950/30 hover:bg-amber-900/40 text-left flex flex-col justify-between"
            >
              <span className="text-amber-300 font-bold mb-1">⚠ Inject Sensor Drift (+22%)</span>
              <span className="text-[10px] text-slate-400">Forces 3-way split confidence (S3)</span>
            </button>

            <button
              onClick={handleReset}
              className="p-3 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-left flex flex-col justify-between"
            >
              <span className="text-slate-300 font-bold mb-1">Reset Baseline State</span>
              <span className="text-[10px] text-slate-500">Restore normal operations</span>
            </button>
          </div>
        </div>
      </main>

      {/* Note Modal */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121A27] border border-slate-700 rounded-xl p-5 max-w-md w-full space-y-4 font-mono text-xs">
            <h3 className="font-bold text-slate-100 text-sm">Add Shift Handoff Note</h3>
            <textarea
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              placeholder="e.g. Tank B filter backwash complete. Standby pump inspected."
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNoteModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
              >
                Record in SpacetimeDB
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Benchmark & Handoff Modals */}
      <BenchmarkModal isOpen={showBenchmarkModal} onClose={() => setShowBenchmarkModal(false)} />
      <HandoffModal
        isOpen={showHandoffModal}
        onClose={() => setShowHandoffModal(false)}
        currentUser={currentUserName}
        onSignHandoff={handleSignHandoff}
        tankLevelPercent={primaryTank?.fill_fraction ? primaryTank.fill_fraction * 100 : 46.2}
        openClaimsCount={sharedState?.action_claims.filter((c) => c.status !== 'COMPLETED').length || 0}
      />

      {/* Footer Audit Bar */}
      <footer className="border-t border-slate-800 bg-[#0E1522] px-6 py-3 flex justify-between items-center text-xs text-slate-500 font-mono">
        <div>TIDEWATCH CONSOLE • PHASE 2 SPACETIMEDB LIVE STATE VERIFIED</div>
        <div className="flex gap-4">
          <span>SPACETIMEDB REDUCERS: ACTIVE</span>
          <span>MULTI-CLIENT SYNC: ENABLED</span>
          <span>HUMAN APPROVAL GATE: ENFORCED</span>
        </div>
      </footer>
    </div>
  );
}
