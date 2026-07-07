'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { signOut } from '@/actions/auth';
import { Building2, KeyRound, ArrowRight } from 'lucide-react';

interface Props {
  email: string;
}

export default function WelcomeClient({ email }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className='flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-10'>
      <div className='w-full max-w-2xl text-center'>
        <h1 className='text-2xl font-bold text-gray-900'>환영합니다! 어떻게 시작할까요?</h1>
        <p className='mt-2 text-sm text-gray-500'>
          아직 소속된 워크스페이스가 없습니다. 아래에서 선택해주세요.
        </p>

        <div className='mt-8 grid gap-4 sm:grid-cols-2'>
          {/* 새로 도입 */}
          <Link
            href='/onboarding'
            className='group flex flex-col rounded-2xl border-2 border-blue-200 bg-white p-6 text-left shadow-sm transition hover:border-blue-500 hover:shadow-md'
          >
            <span className='grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-600'>
              <Building2 className='h-5 w-5' />
            </span>
            <p className='mt-4 text-base font-bold text-gray-900'>우리 회사에 처음 도입해요</p>
            <p className='mt-1.5 flex-1 text-sm leading-relaxed text-gray-500'>
              새 워크스페이스를 만들고, 필요한 모듈만 골라 우리 회사에 맞게 조합합니다.
            </p>
            <span className='mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-600'>
              워크스페이스 만들기
              <ArrowRight className='h-4 w-4 transition group-hover:translate-x-0.5' />
            </span>
          </Link>

          {/* 초대코드 합류 */}
          <Link
            href='/join'
            className='group flex flex-col rounded-2xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition hover:border-gray-400 hover:shadow-md'
          >
            <span className='grid h-11 w-11 place-items-center rounded-xl bg-gray-100 text-gray-600'>
              <KeyRound className='h-5 w-5' />
            </span>
            <p className='mt-4 text-base font-bold text-gray-900'>이미 쓰고 있는 회사의 직원이에요</p>
            <p className='mt-1.5 flex-1 text-sm leading-relaxed text-gray-500'>
              관리자에게 받은 초대코드(FLX-XXXXXX)를 입력하고 회사 워크스페이스에 합류합니다.
            </p>
            <span className='mt-4 inline-flex items-center gap-1 text-sm font-semibold text-gray-700'>
              초대코드 입력하기
              <ArrowRight className='h-4 w-4 transition group-hover:translate-x-0.5' />
            </span>
          </Link>
        </div>

        <p className='mt-6 text-xs text-gray-400'>
          {email} 계정으로 로그인됨 ·{' '}
          <button
            type='button'
            disabled={isPending}
            onClick={() => startTransition(async () => { await signOut(); })}
            className='underline hover:text-gray-600'
          >
            다른 계정 사용
          </button>
        </p>
      </div>
    </div>
  );
}
