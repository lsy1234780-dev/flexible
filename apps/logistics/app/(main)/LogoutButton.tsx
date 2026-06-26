'use client';

import { useTransition } from 'react';
import { LogOut } from 'lucide-react';
import { signOut } from '@/actions/auth';

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => signOut())}
      disabled={isPending}
      className="p-1.5 text-gray-500 hover:text-white transition-colors"
      title="로그아웃"
    >
      <LogOut size={18} />
    </button>
  );
}
