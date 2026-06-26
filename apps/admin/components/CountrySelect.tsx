'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { ALL_COUNTRIES, PRIMARY_COUNTRY_CODES, type Country } from '@/lib/countries';
import { cn } from '@/lib/utils';

interface Props {
  value: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function CountrySelect({ value, onChange, placeholder = '국가 선택', className, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => ALL_COUNTRIES.find((c) => c.code === value),
    [value],
  );

  const filtered = useMemo(() => {
    if (!search) return ALL_COUNTRIES;
    const q = search.toLowerCase();
    return ALL_COUNTRIES.filter(
      (c) =>
        c.nameKo.includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.phoneCode.includes(q),
    );
  }, [search]);

  // 주요 국가 / 기타 국가 분리
  const primary = useMemo(() => filtered.filter((c) => PRIMARY_COUNTRY_CODES.has(c.code)), [filtered]);
  const others = useMemo(() => filtered.filter((c) => !PRIMARY_COUNTRY_CODES.has(c.code)), [filtered]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleSelect(country: Country) {
    onChange(country.code);
    setOpen(false);
    setSearch('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* 트리거 */}
      <button
        type="button"
        onClick={() => { if (!disabled) { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 0); } }}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 w-full h-9 rounded-md border bg-white px-3 text-sm transition-colors hover:bg-gray-50',
          open && 'ring-2 ring-ring ring-offset-1',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {selected ? (
          <span className="flex items-center gap-1.5 flex-1 text-left">
            <span>{selected.flag}</span>
            <span>{selected.nameKo}</span>
            <span className="text-gray-400 text-xs">{selected.code} {selected.phoneCode}</span>
          </span>
        ) : (
          <span className="flex-1 text-left text-gray-400">{placeholder}</span>
        )}
        {selected && !disabled ? (
          <X size={14} className="text-gray-400 hover:text-gray-600 shrink-0" onClick={handleClear} />
        ) : (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        )}
      </button>

      {/* 드롭다운 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[320px] rounded-lg border bg-white shadow-lg">
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="국가명, 코드, 국가번호 검색..."
              className="w-full h-8 rounded-md border px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {primary.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">주요 국가</div>
                {primary.map((c) => (
                  <CountryRow key={c.code} country={c} selected={value === c.code} onSelect={handleSelect} />
                ))}
              </>
            )}
            {others.length > 0 && (
              <>
                {primary.length > 0 && <div className="border-t" />}
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">기타 국가</div>
                {others.map((c) => (
                  <CountryRow key={c.code} country={c} selected={value === c.code} onSelect={handleSelect} />
                ))}
              </>
            )}
            {filtered.length === 0 && (
              <div className="py-4 text-center text-sm text-gray-400">일치하는 국가가 없습니다</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CountryRow({ country, selected, onSelect }: { country: Country; selected: boolean; onSelect: (c: Country) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(country)}
      className={cn(
        'flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors text-left',
        selected ? 'bg-gray-100 font-medium' : 'hover:bg-gray-50',
      )}
    >
      <span className="text-base">{country.flag}</span>
      <span className="flex-1 min-w-0">
        <span>{country.nameKo}</span>
        <span className="text-gray-400 text-xs ml-1.5">{country.nameEn}</span>
      </span>
      <span className="text-xs text-gray-400 shrink-0 tabular-nums">{country.code}</span>
      <span className="text-xs text-gray-400 shrink-0 tabular-nums w-12 text-right">{country.phoneCode}</span>
    </button>
  );
}
