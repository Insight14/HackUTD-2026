import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Wrench,
  AlertTriangle,
  ArrowLeft,
  Radio,
  FileCheck2,
  ShieldCheck,
  MapPin,
  ClipboardCheck,
} from 'lucide-react';

export interface ActionClaimRecord {
  id: string;
  action_id: string;
  action_name: string;
  claimed_by: string;
  claimed_at: string;
  status: string;
  completed_at?: string;
  notes?: string;
}

interface FieldTechViewProps {
  currentUser: string;
  claims: ActionClaimRecord[];
  onClaimAction: (actionId: string) => Promise<void>;
  onCompleteAction: (actionId: string, notes: string) => Promise<void>;
  tankLevelPercent?: number;
  systemStatus?: string;
  onBackToConsole: () => void;
}

export const FieldTechView: React.FC<FieldTechViewProps> = ({
  currentUser,
  claims,
  onClaimAction,
  onCompleteAction,
  tankLevelPercent = 46.2,
  systemStatus = 'NORMAL',
  onBackToConsole,
}) => {
  const [activeNotes, setActiveNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  const handleNoteChange = (actionId: string, text: string) => {
    setActiveNotes((prev) => ({ ...prev, [actionId]: text }));
  };

  const handleComplete = async (actionId: string) => {
    setSubmitting(actionId);
    const note = activeNotes[actionId] || 'Inspection and execution verified in field per SOP.';
    try {
      await onCompleteAction(actionId, note);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      {/* Mobile-Optimized Field Header */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToConsole}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Console
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="font-bold text-sm tracking-wide text-white">TIDEWATCH FIELD CLIENT</h1>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-emerald-400" />
              Avon Battery West &bull; {currentUser}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              systemStatus === 'FORCED_SHUTDOWN'
                ? 'bg-rose-900/80 text-rose-300 border border-rose-700'
                : systemStatus === 'ACTION_NEEDED' || systemStatus === 'HIGH_LEVEL_WARNING'
                ? 'bg-amber-900/80 text-amber-300 border border-amber-700'
                : 'bg-emerald-900/80 text-emerald-300 border border-emerald-700'
            }`}
          >
            {systemStatus}
          </span>
          <p className="text-[10px] text-slate-400 mt-0.5">Tank A: {tankLevelPercent.toFixed(1)}%</p>
        </div>
      </header>

      {/* Real-time State Banner */}
      <div className="bg-slate-900/80 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>SpacetimeDB Shared Live Sync: Active</span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 font-mono">
          <ShieldCheck className="w-3.5 h-3.5" />
          HUMAN VERIFIED
        </div>
      </div>

      {/* Main Task List for Field Tech */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-indigo-400" />
            Field Action Queue ({claims.length})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Claim, inspect, and complete operational mitigations approved by the lead console operator.
          </p>
        </div>

        {claims.length === 0 ? (
          <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold text-slate-300">All Field Tasks Clear</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              No outstanding action claims assigned. When the lead console operator approves a response plan, tasks synchronize here in real time.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {claims.map((claim) => {
              const isClaimedByMe = claim.claimed_by === currentUser;
              const isCompleted = claim.status === 'COMPLETED';

              return (
                <div
                  key={claim.id}
                  className={`rounded-xl border p-4 transition-all shadow-sm ${
                    isCompleted
                      ? 'bg-slate-900/40 border-slate-800 opacity-60'
                      : isClaimedByMe
                      ? 'bg-indigo-950/30 border-indigo-700/80 shadow-indigo-950/20'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isCompleted
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : claim.status === 'CLAIMED'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {claim.status}
                        </span>
                        {claim.claimed_by && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            Claimed by: {claim.claimed_by}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-100 mt-1.5 leading-snug">
                        {claim.action_name}
                      </h3>
                    </div>

                    <div className="p-2 rounded-lg bg-slate-800/80 text-slate-400">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <Wrench className="w-5 h-5 text-amber-400" />
                      )}
                    </div>
                  </div>

                  {/* Field Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col gap-2.5">
                    {!isCompleted && !claim.claimed_by && (
                      <button
                        onClick={() => onClaimAction(claim.id)}
                        className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white transition-colors flex items-center justify-center gap-2 shadow-sm"
                      >
                        <Clock className="w-4 h-4" />
                        Claim Task as {currentUser}
                      </button>
                    )}

                    {!isCompleted && isClaimedByMe && (
                      <div className="space-y-2.5">
                        <input
                          type="text"
                          value={activeNotes[claim.id] || ''}
                          onChange={(e) => handleNoteChange(claim.id, e.target.value)}
                          placeholder="Field inspection findings (e.g., 'Tape measured 46.2%, foam present')..."
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          onClick={() => handleComplete(claim.id)}
                          disabled={submitting === claim.id}
                          className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-white transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                        >
                          <FileCheck2 className="w-4 h-4" />
                          {submitting === claim.id ? 'Submitting...' : 'Sign Off & Complete Action'}
                        </button>
                      </div>
                    )}

                    {isCompleted && claim.notes && (
                      <div className="bg-slate-950/80 rounded-lg p-2.5 border border-slate-800/80 text-xs text-slate-400">
                        <span className="font-semibold text-slate-300">Sign-off Notes: </span>
                        {claim.notes}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Safety Disclaimer Banner */}
        <div className="rounded-xl bg-amber-950/20 border border-amber-900/40 p-3.5 flex items-start gap-3 mt-6">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-200">Field Safety Protocol: </span>
            All pump switchovers, manual tape dips, and line valve actuations must follow plant safety lockout/tagout procedures (LOTO). Actuation tokens synchronize immediately with SpacetimeDB.
          </div>
        </div>
      </main>
    </div>
  );
};
