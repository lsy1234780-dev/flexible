'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { createDeal, moveDealStage } from '@/actions/deals';
import DealSheet from './DealSheet';
import type { DealCard } from './page';

interface Stage {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  sort_order: number;
}

interface Forecast {
  byStage: { stageId: string; name: string; kind: string; total: number; count: number }[];
  openTotal: number;
  wonTotal: number;
  weightedForecast?: number;
}

interface Props {
  stages: Stage[];
  deals: DealCard[];
  forecast: Forecast;
  companies: { id: string; name: string }[];
}

const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

export default function DealsBoard({ stages, deals, forecast, companies }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [openDeal, setOpenDeal] = useState<DealCard | null>(null);

  // 딜 추가 다이얼로그
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', company_id: '', value: '', expected_close_date: '', source: '' });

  function handleCreate() {
    if (!form.title.trim()) { toast.error('딜 이름을 입력하세요'); return; }
    startTransition(async () => {
      const result = await createDeal({
        title: form.title,
        company_id: form.company_id || null,
        value: form.value ? Number(form.value) : 0,
        expected_close_date: form.expected_close_date || null,
        source: form.source || null,
      });
      if (result?.error) { toast.error(result.error); return; }
      toast.success('딜이 추가되었습니다');
      setCreateOpen(false);
      setForm({ title: '', company_id: '', value: '', expected_close_date: '', source: '' });
      router.refresh();
    });
  }

  function handleDrop(stageId: string) {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal || deal.stage_id === stageId) return;
    startTransition(async () => {
      const result = await moveDealStage(id, stageId);
      if (result?.error) { toast.error(result.error); return; }
      router.refresh();
    });
  }

  const dealsByStage = (stageId: string) => deals.filter((d) => d.stage_id === stageId);

  return (
    <div className="space-y-4">
      {/* 헤더 + 매출 예측 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">영업 파이프라인</h1>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-500">
            <span>열린 딜 <b className="text-gray-900">{won(forecast.openTotal)}</b></span>
            {forecast.weightedForecast !== undefined && (
              <span>가중 예측 <b className="text-indigo-600">{won(forecast.weightedForecast)}</b></span>
            )}
            <span>계약 <b className="text-emerald-600">{won(forecast.wonTotal)}</b></span>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus size={16} /> 딜 추가
        </Button>
      </div>

      {/* 칸반 */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const items = dealsByStage(stage.id);
          const sum = items.reduce((s, d) => s + Number(d.value ?? 0), 0);
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={() => handleDrop(stage.id)}
              className={cn(
                'flex w-72 flex-shrink-0 flex-col rounded-lg bg-gray-100/70 transition-colors',
                overStage === stage.id && 'bg-indigo-100 ring-2 ring-indigo-300',
              )}
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color ?? '#cbd5e1' }} />
                  <span className="text-sm font-semibold text-gray-800">{stage.name}</span>
                  <span className="text-xs text-gray-400">{items.length}</span>
                </div>
                <span className="text-[11px] text-gray-500">{won(sum)}</span>
              </div>

              <div className="flex flex-col gap-2 p-2 min-h-24">
                {items.map((deal) => (
                  <button
                    key={deal.id}
                    draggable
                    onDragStart={() => setDragId(deal.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setOpenDeal(deal)}
                    className={cn(
                      'rounded-md border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:border-indigo-300 hover:shadow',
                      dragId === deal.id && 'opacity-40',
                    )}
                  >
                    <p className="text-sm font-medium text-gray-900 line-clamp-2">{deal.title}</p>
                    {deal.companies && (
                      <p className="mt-0.5 text-xs text-gray-500">{deal.companies.name}</p>
                    )}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700">{won(Number(deal.value ?? 0))}</span>
                      {deal.expected_close_date && (
                        <span className="text-[10px] text-gray-400">{deal.expected_close_date}</span>
                      )}
                    </div>
                  </button>
                ))}
                {items.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-gray-400">딜 없음</p>
                )}
              </div>
            </div>
          );
        })}
        {stages.length === 0 && (
          <p className="text-sm text-gray-500">파이프라인 단계가 없습니다. 새로고침하면 기본 단계가 생성됩니다.</p>
        )}
      </div>

      {/* 딜 추가 다이얼로그 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>딜 추가</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>딜 이름 *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 정욱상사 로봇 납품" className="mt-1" autoFocus />
            </div>
            <div>
              <Label>거래처</Label>
              <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="선택 안 함" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>예상 매출(₩)</Label>
                <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>예상 마감일</Label>
                <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>유입 경로</Label>
              <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="추천 / 인바운드 / 광고…" className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>취소</Button>
              <Button onClick={handleCreate} disabled={isPending}>추가</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 딜 상세 + 통합 타임라인 */}
      {openDeal && (
        <DealSheet
          deal={openDeal}
          stages={stages}
          companies={companies}
          onClose={() => setOpenDeal(null)}
        />
      )}
    </div>
  );
}
