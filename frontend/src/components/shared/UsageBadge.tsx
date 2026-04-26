// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Leo Song
import type { UsageSummary } from '../../api/client';

interface Props {
  usage: UsageSummary | null;
  showWhenEmpty?: boolean;
}

export default function UsageBadge({ usage, showWhenEmpty = false }: Props) {
  if (!usage) return null;

  if (usage.total_calls === 0) {
    if (!showWhenEmpty) return null;
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-xs text-slate-400 inline-flex items-center gap-2">
        <span className="text-green-400 font-medium">All local processing — no LLM cost</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-xs text-slate-400 inline-flex items-center gap-2">
      <span className="text-slate-300 font-medium">AI Usage:</span>
      {usage.total_calls} call{usage.total_calls > 1 ? 's' : ''} &middot;{' '}
      {(usage.total_input_tokens + usage.total_output_tokens).toLocaleString()} tokens
      {usage.total_images > 0 && <> &middot; {usage.total_images} img</>}
      {' '}&middot;{' '}
      <span className="text-green-400 font-medium">
        ${usage.total_cost_usd < 0.01 ? '< 0.01' : usage.total_cost_usd.toFixed(4)}
      </span>
    </div>
  );
}
