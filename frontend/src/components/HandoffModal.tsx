import React, { useState } from 'react';
import {
  X,
  FileText,
  Send,
  Clock,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

interface HandoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: string;
  onSignHandoff: (summary: string) => Promise<void>;
  tankLevelPercent?: number;
  openClaimsCount?: number;
}

export const HandoffModal: React.FC<HandoffModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSignHandoff,
  tankLevelPercent = 46.2,
  openClaimsCount = 0,
}) => {
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState(
    `SHIFT 1 (NIGHT) HANDOFF REPORT — AVON GATHERING BATTERY
Outgoing Operator: ${currentUser}
Timestamp: ${new Date().toLocaleTimeString()} UTC
Tank A Level: ${tankLevelPercent.toFixed(1)}% | Tank B Level: 28.5%
Pumps: P-1 RUNNING, P-2 STANDBY, P-3 RUNNING
Outstanding Claims: ${openClaimsCount} active field inspections
Alerts: System operational within safe bounds; 3-way sensor trust verified.`
  );

  const handleDraftWithAI = async () => {
    setDrafting(true);
    try {
      const res = await fetch('/api/agent/execute-tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_name: 'draft_handoff',
          arguments: { outgoing_operator: currentUser },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.output?.draft_handoff_text) {
          setNotes(data.output.draft_handoff_text);
        }
      }
    } catch {
      // Fallback to existing text
    } finally {
      setDrafting(false);
    }
  };

  const handleSign = async () => {
    setSubmitting(true);
    try {
      await onSignHandoff(notes);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col text-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-950 border border-blue-700 text-blue-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                OPERATIONAL SHIFT HANDOFF & AUDIT LOG
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                SpacetimeDB synchronized digital logbook and shift change sign-off.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Shift Transfer Narrative:</span>
            <button
              onClick={handleDraftWithAI}
              disabled={drafting}
              className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Clock className="w-3.5 h-3.5" />
              {drafting ? 'Generating with Nemotron...' : 'Draft with AI Assistant'}
            </button>
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 font-mono leading-relaxed focus:outline-none focus:border-indigo-500 shadow-inner"
          />

          <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Sign-off Authority: <strong className="text-slate-200">{currentUser}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
              <ShieldCheck className="w-4 h-4" />
              SpacetimeDB Reducer Protected
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 flex items-center justify-between bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={submitting}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-white transition-colors flex items-center gap-2 shadow-md disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Signing...' : 'Approve & Sign Shift Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
};
