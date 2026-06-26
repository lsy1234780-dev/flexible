'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { signIn } from '@/actions/auth';
import { Truck } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const result = await signIn(new FormData(e.currentTarget));
    setLoading(false);
    if (result?.error) toast.error(result.error);
    else router.push('/delivery');
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center mx-auto">
            <Truck size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">물류 관리 시스템</h1>
          <p className="text-sm text-gray-500">물류팀 계정으로 로그인하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-gray-400 uppercase tracking-widest">이메일</label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              placeholder="email@company.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-gray-400 uppercase tracking-widest">비밀번호</label>
            <input
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-base transition-colors disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
