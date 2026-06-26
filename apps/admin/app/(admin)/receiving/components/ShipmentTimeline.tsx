'use client';

import dayjs from 'dayjs';
import { getStageConfig } from '@/lib/inboundStages';

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  from_stage: string | null;
  to_stage: string | null;
  created_at: string;
}

interface Props {
  events: TimelineEvent[];
}

export default function ShipmentTimeline({ events }: Props) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-400 py-4 text-center">이력이 없습니다</p>;
  }

  return (
    <div className="relative pl-6">
      {/* 세로 선 */}
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-gray-200" />

      <div className="space-y-4">
        {events.map((evt) => {
          const isStageChange = evt.event_type === 'stage_change';
          const stageConfig = evt.to_stage ? getStageConfig(evt.to_stage) : null;

          return (
            <div key={evt.id} className="relative flex gap-3">
              {/* 점 */}
              <div
                className={`absolute -left-6 top-1.5 w-[10px] h-[10px] rounded-full border-2 ${
                  isStageChange
                    ? 'border-gray-900 bg-gray-900'
                    : 'border-gray-300 bg-white'
                }`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{evt.title}</span>
                  {isStageChange && stageConfig && (
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${stageConfig.color}`}>
                      {stageConfig.label}
                    </span>
                  )}
                </div>
                {evt.description && (
                  <p className="text-xs text-gray-500 mt-0.5">{evt.description}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {dayjs(evt.created_at).format('YYYY.MM.DD HH:mm')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
