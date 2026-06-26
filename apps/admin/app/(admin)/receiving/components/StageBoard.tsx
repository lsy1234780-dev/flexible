'use client';

import { INBOUND_STAGES } from '@/lib/inboundStages';
import { cn } from '@/lib/utils';

interface Props {
  stageCounts: Record<string, number>;
  activeStage: string | null;
  onStageClick: (stage: string | null) => void;
}

export default function StageBoard({ stageCounts, activeStage, onStageClick }: Props) {
  const total = Object.values(stageCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {/* 전체 */}
      <button
        onClick={() => onStageClick(null)}
        className={cn(
          'flex flex-col items-center min-w-[80px] rounded-lg border px-3 py-2 text-xs transition-colors shrink-0',
          activeStage === null
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
        )}
      >
        <span className="text-lg font-bold">{total}</span>
        <span>전체</span>
      </button>

      {INBOUND_STAGES.map((stage) => {
        const count = stageCounts[stage.key] ?? 0;
        const isActive = activeStage === stage.key;

        return (
          <button
            key={stage.key}
            onClick={() => onStageClick(isActive ? null : stage.key)}
            className={cn(
              'flex flex-col items-center min-w-[80px] rounded-lg border px-3 py-2 text-xs transition-colors shrink-0',
              isActive
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            <span className="text-lg font-bold">{count}</span>
            <span>{stage.label}</span>
          </button>
        );
      })}
    </div>
  );
}
