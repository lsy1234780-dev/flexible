'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import dayjs from 'dayjs';
import { Trash2, Phone, Users, CheckSquare, StickyNote, ArrowRightLeft, Cog, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { updateDeal, moveDealStage, deleteDeal } from '@/actions/deals';
import { getTimeline, addActivity, toggleActivityDone } from '@/actions/crm';
import type { DealCard } from './page';

interface Stage { id: string; name: string; kind: string; color: string | null }
interface TimelineItem {
  id: string; kind: string; action: string; memo: string | null;
  due_at: string | null; done: boolean; created_at: string;
}
interface Props {
  deal: DealCard;
  stages: Stage[];
  companies: { id: string; name: string }[];
  onClose: () => void;
}

const KIND_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  system: Cog, note: StickyNote, call: Phone, meeting: Users, task: CheckSquare, stage_change: ArrowRightLeft, email: Mail,
};
type AddKind = 'note' | 'call' | 'meeting' | 'task';
const ADD_KINDS: { value: AddKind; label: string }[] = [
  { value: 'note', label: '메모' },
  { value: 'call', label: '통화' },
  { value: 'meeting', label: '미팅' },
  { value: 'task', label: '할일' },
];
const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

export default function DealSheet({ deal, stages, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 편집 가능한 필드 (로컬 상태)
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(String(deal.value ?? 0));
  const [closeDate, setCloseDate] = useState(deal.expected_close_date ?? '');
  const [source, setSource] = useState(deal.source ?? '');
  const [notes, setNotes] = useState(deal.notes ?? '');

  // 활동 추가 폼
  const [actKind, setActKind] = useState<AddKind>('note');
  const [actText, setActText] = useState('');
  const [actDue, setActDue] = useState('');

  const loadTimeline = useCallback(() => {
    setLoading(true);
    getTimeline('deal', deal.id)
      .then((rows) => setTimeline((rows ?? []) as TimelineItem[]))
      .finally(() => setLoading(false));
  }, [deal.id]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  function saveFields() {
    startTransition(async () => {
      const result = await updateDeal(deal.id, {
        title: title.trim(),
        value: Number(value) || 0,
        expected_close_date: closeDate || null,
        source: source || null,
        notes: notes || null,
      });
      if (result?.error) { toast.error(result.error); return; }
      toast.success('저장되었습니다');
      router.refresh();
    });
  }

  function handleStageChange(stageId: string) {
    startTransition(async () => {
      const result = await moveDealStage(deal.id, stageId);
      if (result?.error) { toast.error(result.error); return; }
      router.refresh();
      loadTimeline();
    });
  }

  function handleAddActivity() {
    if (!actText.trim()) { toast.error('내용을 입력하세요'); return; }
    startTransition(async () => {
      const result = await addActivity({
        entityType: 'deal', entityId: deal.id, kind: actKind,
        action: ADD_KINDS.find((k) => k.value === actKind)?.label ?? '활동',
        memo: actText.trim(),
        dueAt: actKind === 'task' && actDue ? actDue : null,
      });
      if (result?.error) { toast.error(result.error); return; }
      setActText(''); setActDue('');
      loadTimeline();
    });
  }

  function handleToggleTask(id: string, done: boolean) {
    setTimeline((prev) => prev.map((t) => (t.id === id ? { ...t, done } : t)));
    startTransition(async () => {
      const result = await toggleActivityDone(id, done);
      if (result?.error) { toast.error(result.error); loadTimeline(); }
    });
  }

  function handleDelete() {
    if (!confirm(`'${deal.title}' 딜을 삭제하시겠습니까?\n관련 활동도 함께 삭제됩니다.`)) return;
    startTransition(async () => {
      const result = await deleteDeal(deal.id);
      if (result?.error) { toast.error(result.error); return; }
      toast.success('삭제되었습니다');
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        <SheetTitle className="sr-only">딜 상세</SheetTitle>
        <SheetDescription className="sr-only">딜 정보 편집 및 활동 타임라인</SheetDescription>

        {/* 헤더 */}
        <div className="border-b p-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveFields}
            className="border-0 px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          />
          <div className="mt-2 flex items-center gap-2">
            <Select value={deal.stage_id ?? ''} onValueChange={handleStageChange}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {deal.companies && <span className="text-sm text-gray-500">{deal.companies.name}</span>}
          </div>
        </div>

        {/* 필드 */}
        <div className="space-y-3 border-b p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">예상 매출</label>
              <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} onBlur={saveFields} className="mt-1 h-8" />
              <p className="mt-0.5 text-[11px] text-gray-400">{won(Number(value) || 0)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500">예상 마감일</label>
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} onBlur={saveFields} className="mt-1 h-8" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">유입 경로</label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} onBlur={saveFields} className="mt-1 h-8" />
          </div>
          <div>
            <label className="text-xs text-gray-500">메모</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveFields} className="mt-1" rows={2} />
          </div>
        </div>

        {/* 활동 추가 */}
        <div className="border-b p-4">
          <div className="flex gap-2">
            <Select value={actKind} onValueChange={(v) => setActKind(v as AddKind)}>
              <SelectTrigger className="h-9 w-24 flex-shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADD_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={actText}
              onChange={(e) => setActText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddActivity(); }}
              placeholder={actKind === 'task' ? '할 일 내용' : '기록할 내용…'}
              className="h-9"
            />
            <Button onClick={handleAddActivity} disabled={isPending} size="sm" className="h-9 flex-shrink-0">추가</Button>
          </div>
          {actKind === 'task' && (
            <Input type="date" value={actDue} onChange={(e) => setActDue(e.target.value)} className="mt-2 h-8 w-40" />
          )}
        </div>

        {/* 통합 타임라인 */}
        <div className="p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">타임라인</p>
          {loading ? (
            <p className="text-sm text-gray-400">불러오는 중…</p>
          ) : timeline.length === 0 ? (
            <p className="text-sm text-gray-400">아직 활동이 없습니다.</p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((t) => {
                const Icon = KIND_ICON[t.kind] ?? Cog;
                return (
                  <li key={t.id} className="flex gap-3">
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                      <Icon size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {t.kind === 'task' && (
                          <Checkbox checked={t.done} onCheckedChange={(c) => handleToggleTask(t.id, !!c)} />
                        )}
                        <span className={`text-sm font-medium text-gray-900 ${t.done ? 'line-through text-gray-400' : ''}`}>{t.action}</span>
                        {t.due_at && <span className="text-[11px] text-amber-600">~{dayjs(t.due_at).format('MM.DD')}</span>}
                      </div>
                      {t.memo && <p className="text-sm text-gray-600 whitespace-pre-wrap">{t.memo}</p>}
                      <p className="text-[11px] text-gray-400">{dayjs(t.created_at).format('YYYY.MM.DD HH:mm')}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="p-4">
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={isPending} className="text-red-500 hover:text-red-700">
            <Trash2 size={14} /> 딜 삭제
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
