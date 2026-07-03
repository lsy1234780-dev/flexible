'use client';

// 글로벌 검색 팔레트 (Cmd/Ctrl+K) — 제품·거래처·수주·견적·A/S 등 켜진 모듈의 레코드를 한 번에 검색.
// layout에 한 번만 마운트하고, 사이드바 버튼이나 단축키로 어디서든 연다 (lib/globalSearchStore).

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Search, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { entityChipClass } from '@/lib/entityLink';
import { globalSearch, type GlobalSearchResult } from '@/actions/search';
import { useGlobalSearch } from '@/lib/globalSearchStore';

export default function GlobalSearch() {
  const router = useRouter();
  const { open, setOpen, toggle } = useGlobalSearch();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  // 어디서든 Cmd/Ctrl+K로 열기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [toggle]);

  // 다이얼로그 open/close 이벤트에서 직접 초기화 (effect로 안 하고 핸들러에서 바로)
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery('');
      setResults([]);
    }
  }

  function handleQueryChange(v: string) {
    setQuery(v);
    if (!v.trim()) setResults([]);
  }

  // 디바운스 검색 — 실제 서버 호출은 setTimeout 콜백 안(비동기)이라 매 렌더 동기 setState가 아님
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await globalSearch(q);
        setResults(r);
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, GlobalSearchResult[]>();
    for (const r of results) {
      if (!groups.has(r.typeLabel)) groups.set(r.typeLabel, []);
      groups.get(r.typeLabel)!.push(r);
    }
    return [...groups.entries()];
  }, [results]);

  function select(r: GlobalSearchResult) {
    setOpen(false);
    if (r.href && r.href !== '#') router.push(r.href);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>글로벌 검색</DialogTitle>
      </DialogHeader>
      <DialogContent className="max-w-lg overflow-hidden p-0" showCloseButton={false}>
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 border-b px-3">
            {isPending
              ? <Loader2 size={16} className="flex-shrink-0 animate-spin text-gray-400" />
              : <Search size={16} className="flex-shrink-0 text-gray-400" />}
            <Command.Input
              autoFocus
              value={query}
              onValueChange={handleQueryChange}
              placeholder="제품·거래처·수주·견적·A/S 검색..."
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            <kbd className="flex-shrink-0 rounded border bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400">ESC</kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            {query.trim() && !isPending && results.length === 0 && (
              <Command.Empty className="py-8 text-center text-sm text-gray-400">
                검색 결과가 없습니다
              </Command.Empty>
            )}
            {!query.trim() && (
              <p className="py-8 text-center text-sm text-gray-400">
                검색어를 입력하세요
              </p>
            )}
            {grouped.map(([typeLabel, items]) => (
              <Command.Group
                key={typeLabel}
                heading={typeLabel}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-gray-400"
              >
                {items.map((r) => (
                  <Command.Item
                    key={`${r.entityType}-${r.id}`}
                    value={`${r.entityType}-${r.id}`}
                    onSelect={() => select(r)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-gray-700 aria-selected:bg-gray-100"
                  >
                    <span className={cn('flex-shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium', entityChipClass(r.entityType))}>
                      {r.typeLabel}
                    </span>
                    <span className="truncate">{r.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
