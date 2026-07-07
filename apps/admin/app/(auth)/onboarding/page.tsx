'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWorkspaceForCurrentUser } from '@/actions/workspaces';
import { MODULE_CATALOG } from '@/lib/modules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Lock, ArrowLeft, Sparkles } from 'lucide-react';

// 회사명 → slug 자동 변환 (영소문자/숫자/하이픈)
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9가-힣\s-]/g, '')
    .replace(/[\s가-힣]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const OPTIONAL_MODULES = MODULE_CATALOG.filter((m) => m.tier === 'optional');
const CORE_MODULES = MODULE_CATALOG.filter((m) => m.tier === 'core');

// 업종 프리셋 — 시작점일 뿐, 아래 칩에서 자유롭게 조정
const PRESETS: { name: string; keys: string[] }[] = [
  {
    name: '제조·유통',
    keys: ['inventory', 'serials', 'receiving', 'logistics', 'purchasing', 'supply', 'orders', 'quotations', 'fulfillment', 'analytics', 'chat'],
  },
  {
    name: '영업 중심',
    keys: ['quotations', 'orders', 'crm_basic', 'crm_pipeline', 'chat', 'analytics', 'b2b_portal'],
  },
  {
    name: '서비스·A/S',
    keys: ['service', 'crm_basic', 'orders', 'quotations', 'chat', 'analytics'],
  },
  {
    name: '전부 켜기',
    keys: OPTIONAL_MODULES.filter((m) => !m.comingSoon).map((m) => m.key),
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(PRESETS[0].keys));
  const [activePreset, setActivePreset] = useState<string | null>(PRESETS[0].name);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleNameChange(value: string) {
    setCompanyName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function goStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    if (!companyName.trim()) { setError('회사명을 입력하세요'); return; }
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length < 2) {
      setError('주소(slug)는 영소문자/숫자/하이픈 2자 이상이어야 합니다');
      return;
    }
    setStep(2);
  }

  function applyPreset(name: string, keys: string[]) {
    setSelected(new Set(keys));
    setActivePreset(name);
  }

  function toggleModule(key: string) {
    setActivePreset(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCreate() {
    setError('');
    startTransition(async () => {
      // 선택 안 된 optional 모듈은 명시적으로 OFF (기본 시드와 무관하게 위저드 결과 = 최종 상태)
      const modules = OPTIONAL_MODULES.filter((m) => !m.comingSoon).map((m) => ({
        key: m.key,
        enabled: selected.has(m.key),
      }));
      const result = await createWorkspaceForCurrentUser({ companyName, slug, modules });
      if (result?.error) {
        setError(result.error);
        setStep(1);
        return;
      }
      router.replace('/products');
    });
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10'>
      <Card className={`w-full ${step === 1 ? 'max-w-sm' : 'max-w-2xl'}`}>
        <CardHeader className='text-center'>
          <p className='text-xs font-semibold tracking-widest text-blue-600'>
            {step === 1 ? 'STEP 1 / 2' : 'STEP 2 / 2'}
          </p>
          <CardTitle className='text-xl'>
            {step === 1 ? '회사 정보를 입력하세요' : '필요한 모듈을 조합하세요'}
          </CardTitle>
          <p className='text-sm text-gray-500'>
            {step === 1
              ? '워크스페이스의 이름과 주소를 정합니다'
              : '지금 고른 조합이 우리 회사 메뉴가 됩니다 — 나중에 설정에서 언제든 바꿀 수 있어요'}
          </p>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={goStep2} className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='companyName'>회사명</Label>
                <Input
                  id='companyName'
                  value={companyName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder='예: 플렉시블 주식회사'
                  autoFocus
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='slug'>워크스페이스 주소 (영문)</Label>
                <Input
                  id='slug'
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
                  placeholder='예: flexible-inc'
                />
              </div>
              {error && <p className='text-sm text-red-500'>{error}</p>}
              <Button type='submit' className='w-full'>
                다음 — 모듈 조합하기
              </Button>
            </form>
          ) : (
            <div className='space-y-5'>
              {/* 프리셋 */}
              <div>
                <p className='mb-2 flex items-center gap-1.5 text-sm font-medium text-gray-700'>
                  <Sparkles className='h-4 w-4 text-blue-500' />
                  업종으로 빠르게 시작
                </p>
                <div className='flex flex-wrap gap-2'>
                  {PRESETS.map((p) => (
                    <button
                      key={p.name}
                      type='button'
                      onClick={() => applyPreset(p.name, p.keys)}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                        activePreset === p.name
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400'
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 기본 포함 (코어) */}
              <div>
                <p className='mb-2 text-sm font-medium text-gray-700'>기본 포함</p>
                <div className='flex flex-wrap gap-2'>
                  {CORE_MODULES.map((m) => (
                    <span
                      key={m.key}
                      className='inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500'
                      title={m.description}
                    >
                      <Lock className='h-3.5 w-3.5' />
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* 선택 모듈 조합 */}
              <div>
                <p className='mb-2 text-sm font-medium text-gray-700'>
                  선택 모듈 <span className='text-blue-600'>({selected.size}개 켜짐)</span>
                </p>
                <div className='grid gap-2 sm:grid-cols-2'>
                  {OPTIONAL_MODULES.map((m) => {
                    const on = selected.has(m.key);
                    if (m.comingSoon) {
                      return (
                        <div
                          key={m.key}
                          className='flex items-center justify-between rounded-lg border border-dashed border-gray-200 px-3 py-2.5 opacity-60'
                        >
                          <div>
                            <p className='text-sm font-medium text-gray-400'>{m.label}</p>
                            <p className='text-xs text-gray-400'>{m.description}</p>
                          </div>
                          <span className='shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-400'>준비 중</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={m.key}
                        type='button'
                        onClick={() => toggleModule(m.key)}
                        className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                          on
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div>
                          <p className={`text-sm font-medium ${on ? 'text-blue-900' : 'text-gray-700'}`}>{m.label}</p>
                          <p className={`text-xs ${on ? 'text-blue-600/70' : 'text-gray-400'}`}>{m.description}</p>
                        </div>
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${
                            on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-transparent'
                          }`}
                        >
                          <Check className='h-3 w-3' />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && <p className='text-sm text-red-500'>{error}</p>}

              <div className='flex items-center gap-3 pt-1'>
                <Button type='button' variant='outline' onClick={() => setStep(1)} disabled={isPending}>
                  <ArrowLeft className='mr-1 h-4 w-4' />
                  이전
                </Button>
                <Button type='button' className='flex-1' onClick={handleCreate} disabled={isPending}>
                  {isPending ? '워크스페이스 만드는 중...' : `이 조합으로 시작하기 (${selected.size}개 모듈)`}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
