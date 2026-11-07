import React, { useState } from 'react';
import {
  X,
  Play,
  TrendingDown,
  Clock,
  Sparkles,
  Award,
  CheckCircle2,
} from 'lucide-react';

interface StrategyMetrics {
  strategy_id: string;
  strategy_name: string;
  shutdown_rate_pct: number;
  mean_cost_usd: number;
  mean_warning_minutes_gained: number;
  top1_diagnosis_accuracy_pct: number;
  forecast_mae_minutes: number;
  incident_count: number;
}

interface BenchmarkComparisonReport {
  baseline_0_do_nothing: StrategyMetrics;
  baseline_1_fixed_heuristic: StrategyMetrics;
  baseline_2_tidewatch: StrategyMetrics;
  cost_savings_vs_b0_usd: number;
  cost_savings_vs_b1_usd: number;
  additional_warning_minutes_vs_b1: number;
  is_synthetic: boolean;
  provenance: string;
}

interface BenchmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BenchmarkModal: React.FC<BenchmarkModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<BenchmarkComparisonReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runBenchmark = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scenarios/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n_trials: 50, seed: 42 }),
      });
      if (!res.ok) throw new Error('Benchmark failed to execute');
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Benchmark error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col text-slate-100">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-950 border border-indigo-700 text-indigo-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                OPERATIONAL STRATEGY EVALUATION BENCHMARK
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Monte Carlo statistical evaluation comparing 3 operational baselines across 50 seeded emergency trials.
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

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          {/* Top Value Cards if report exists */}
          {report && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-emerald-950/40 border border-emerald-800/80 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <TrendingDown className="w-4 h-4" />
                  Cost Savings vs B0
                </span>
                <div className="mt-2">
                  <span className="text-2xl font-black text-emerald-300 font-mono">
                    ${report.cost_savings_vs_b0_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  <p className="text-[11px] text-emerald-400/80 mt-1">Per incident avoided shutdown</p>
                </div>
              </div>

              <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  Advance Warning Gained
                </span>
                <div className="mt-2">
                  <span className="text-2xl font-black text-cyan-300 font-mono">
                    +{report.additional_warning_minutes_vs_b1.toFixed(1)} min
                  </span>
                  <p className="text-[11px] text-cyan-400/80 mt-1">Faster notice than 70% heuristic</p>
                </div>
              </div>

              <div className="bg-indigo-950/40 border border-indigo-800/80 rounded-xl p-4 flex flex-col justify-between">
                <span className="text-xs font-semibold text-indigo-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Forced Shutdown Rate
                </span>
                <div className="mt-2">
                  <span className="text-2xl font-black text-indigo-300 font-mono">
                    {report.baseline_2_tidewatch.shutdown_rate_pct.toFixed(1)}%
                  </span>
                  <p className="text-[11px] text-indigo-400/80 mt-1">vs {report.baseline_0_do_nothing.shutdown_rate_pct.toFixed(1)}% unassisted</p>
                </div>
              </div>
            </div>
          )}

          {/* Benchmark Comparison Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 shadow-inner">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800/80 text-slate-300 font-semibold border-b border-slate-800">
                  <th className="py-3 px-4">Operational Strategy</th>
                  <th className="py-3 px-4 text-center">Shutdown Rate</th>
                  <th className="py-3 px-4 text-right">Mean Incident Cost</th>
                  <th className="py-3 px-4 text-right">Warning Gained</th>
                  <th className="py-3 px-4 text-center">Top-1 Diagnosis</th>
                  <th className="py-3 px-4 text-right">Forecast MAE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {report ? (
                  <>
                    {/* Baseline 0 */}
                    <tr className="hover:bg-slate-900/60 text-slate-400">
                      <td className="py-3 px-4 font-sans font-medium text-slate-300">
                        {report.baseline_0_do_nothing.strategy_name}
                      </td>
                      <td className="py-3 px-4 text-center text-rose-400 font-bold">
                        {report.baseline_0_do_nothing.shutdown_rate_pct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right text-rose-300 font-bold">
                        ${report.baseline_0_do_nothing.mean_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-500">
                        {report.baseline_0_do_nothing.mean_warning_minutes_gained.toFixed(1)} min
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500">N/A</td>
                      <td className="py-3 px-4 text-right text-slate-500">N/A</td>
                    </tr>

                    {/* Baseline 1 */}
                    <tr className="hover:bg-slate-900/60 text-slate-400">
                      <td className="py-3 px-4 font-sans font-medium text-slate-300">
                        {report.baseline_1_fixed_heuristic.strategy_name}
                      </td>
                      <td className="py-3 px-4 text-center text-amber-400 font-bold">
                        {report.baseline_1_fixed_heuristic.shutdown_rate_pct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right text-amber-300 font-bold">
                        ${report.baseline_1_fixed_heuristic.mean_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300">
                        {report.baseline_1_fixed_heuristic.mean_warning_minutes_gained.toFixed(1)} min
                      </td>
                      <td className="py-3 px-4 text-center text-slate-400">
                        {report.baseline_1_fixed_heuristic.top1_diagnosis_accuracy_pct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
                        {report.baseline_1_fixed_heuristic.forecast_mae_minutes.toFixed(1)} min
                      </td>
                    </tr>

                    {/* Baseline 2 - Tidewatch */}
                    <tr className="bg-indigo-950/40 hover:bg-indigo-950/60 text-indigo-100 font-semibold border-t-2 border-indigo-700/60">
                      <td className="py-3.5 px-4 font-sans font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        {report.baseline_2_tidewatch.strategy_name}
                      </td>
                      <td className="py-3.5 px-4 text-center text-emerald-400 font-black">
                        {report.baseline_2_tidewatch.shutdown_rate_pct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4 text-right text-emerald-300 font-black">
                        ${report.baseline_2_tidewatch.mean_cost_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-right text-cyan-300 font-black">
                        {report.baseline_2_tidewatch.mean_warning_minutes_gained.toFixed(1)} min
                      </td>
                      <td className="py-3.5 px-4 text-center text-indigo-300 font-black">
                        {report.baseline_2_tidewatch.top1_diagnosis_accuracy_pct.toFixed(1)}%
                      </td>
                      <td className="py-3.5 px-4 text-right text-cyan-300 font-black">
                        &plusmn;{report.baseline_2_tidewatch.forecast_mae_minutes.toFixed(2)} min
                      </td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 font-sans">
                      Click below to execute the 50-trial Monte Carlo benchmark harness.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Provenance and execution notes */}
          <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
            <span>Methodology: 50 Seeded Pseudo-Random Trials | Seed: 42</span>
            <span className="font-mono text-slate-400">SYNTHETIC_DATA_LABELED</span>
          </div>

          {error && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-lg text-rose-300 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-5 border-t border-slate-800 flex items-center justify-between bg-slate-900 sticky bottom-0">
          <p className="text-xs text-slate-400">
            Authoritative evaluation benchmark for EOG Resources & MLH evaluation.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
            >
              Close
            </button>
            <button
              onClick={runBenchmark}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white transition-colors flex items-center gap-2 shadow-md disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              {loading ? 'Running 50 Trials...' : 'Run 50-Trial Benchmark'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
