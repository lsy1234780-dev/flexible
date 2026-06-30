'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Package, ClipboardList, Building2, FileText, ShoppingCart,
  Tags, FolderTree, Menu, X, ChevronDown, ExternalLink, ClipboardCheck, Settings, Wrench, Layers,
  PanelLeftClose, PanelLeftOpen, LogOut, PackageCheck, Warehouse, Search, ShieldCheck, TrendingUp, Target, MessageSquare, LayoutDashboard,
} from 'lucide-react';
import InventoryFinderModal from '@/components/InventoryFinderModal';
import { useMemo, useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { signOut } from '@/actions/auth';
import { canAccessMenu } from '@/lib/roles';
import { isMenuModuleEnabled } from '@/lib/modules';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { UserRole, MenuAccessRule } from '@/lib/roles';

const LOGISTICS_URL = process.env.NEXT_PUBLIC_LOGISTICS_URL ?? 'http://localhost:3003';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  exact?: boolean;
  external?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const allNavGroups: NavGroup[] = [
  {
    label: '홈',
    items: [
      { href: '/dashboard', label: '대시보드', icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: '상품관리',
    items: [
      { href: '/products', label: '제품 관리', icon: Package },
      { href: '/categories', label: '카테고리', icon: FolderTree },
      { href: '/inventory', label: '재고 현황', icon: ClipboardList, exact: true },
      { href: '/lots', label: 'LOT 관리', icon: Layers },
    ],
  },
  {
    label: '영업관리',
    items: [
      { href: '/companies', label: '거래처 관리', icon: Building2 },
      { href: '/receiving', label: '발주 관리', icon: ClipboardCheck },
      { href: '/orders', label: '수주 관리', icon: ShoppingCart },
      { href: '/quotations', label: '견적서', icon: FileText },
    ],
  },
  {
    label: '협업',
    items: [
      { href: '/chat', label: '채팅', icon: MessageSquare },
    ],
  },
  {
    label: '고객관계',
    items: [
      { href: '/deals', label: '영업 파이프라인', icon: Target },
      { href: '/warranty', label: '출고현황', icon: ShieldCheck },
      { href: '/as', label: 'A/S 관리', icon: Wrench },
    ],
  },
  {
    label: '물류관리',
    items: [
      { href: '/warehouses', label: '창고 관리', icon: Warehouse },
      { href: '/serials', label: '시리얼 관리', icon: Tags },
      { href: '/receiving-orders', label: '입고 작업', icon: PackageCheck },
      { href: LOGISTICS_URL, label: '물류 앱 열기', icon: ExternalLink, external: true },
    ],
  },
  {
    label: '경영지원',
    items: [
      { href: '/profit-loss', label: '손익계산서', icon: TrendingUp },
    ],
  },
];

interface Props {
  role: UserRole;
  menuRules?: MenuAccessRule[];
  departmentLabels?: Record<string, string>;
  positionLabels?: Record<string, string>;
  superAdminMinLevel?: number;
  enabledModules?: string[];
  userName?: string;
}

export default function Sidebar({ role, menuRules, departmentLabels = {}, positionLabels = {}, superAdminMinLevel, enabledModules, userName = '사용자' }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();
  const [finderOpen, setFinderOpen] = useState(false);

  function handleSignOut() {
    if (!confirm('로그아웃하시겠습니까?')) return;
    startTransition(() => signOut());
  }

  // 메뉴 노출 조건: ① 모듈 ON(워크스페이스가 그 기능을 씀) + ② RBAC 권한 OK(이 유저가 접근 가능)
  const navGroups = useMemo(() => {
    return allNavGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            isMenuModuleEnabled(item.href, enabledModules) &&
            canAccessMenu(item.href, role, menuRules, superAdminMinLevel),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [role, menuRules, superAdminMinLevel, enabledModules]);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  function isGroupActive(group: NavGroup) {
    return group.items.some((item) => isActive(item.href, item.exact));
  }

  function toggleGroup(label: string) {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const positionLabel = positionLabels[role.position] ?? role.position;
  const departmentLabel = departmentLabels[role.department] ?? role.department;

  // 접힌 상태에서 tooltip을 감싸주는 헬퍼
  function withTooltip(content: React.ReactNode, label: string) {
    if (!sidebarCollapsed) return content;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>{label}</TooltipContent>
      </Tooltip>
    );
  }

  const NavLinks = () => (
    <nav className="flex flex-col gap-0.5 p-3">
      {navGroups.map((group) => {
        const groupActive = isGroupActive(group);
        const isCollapsed = collapsed[group.label] && !groupActive;

        return (
          <div key={group.label} className="mb-1">
            {!sidebarCollapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap',
                  groupActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600',
                )}
              >
                {group.label}
                <ChevronDown
                  size={14}
                  className={cn(
                    'transition-transform',
                    isCollapsed && '-rotate-90',
                  )}
                />
              </button>
            )}
            {!isCollapsed && (
              <div className="flex flex-col gap-0.5 mt-0.5">
                {group.label === '물류관리' && withTooltip(
                  <button
                    onClick={() => { setFinderOpen(true); setOpen(false); }}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap w-full text-left',
                      'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      sidebarCollapsed && 'justify-center',
                    )}
                  >
                    <Search size={18} />
                    {!sidebarCollapsed && '재고 위치 찾기'}
                  </button>,
                  '재고 위치 찾기',
                )}
                {group.items.map(({ href, label, icon: Icon, exact, external }) => {
                  if (external) {
                    return (
                      <div key={href}>
                        {withTooltip(
                          <a
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => setOpen(false)}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap',
                              sidebarCollapsed && 'justify-center',
                            )}
                          >
                            <Icon size={18} />
                            {!sidebarCollapsed && label}
                          </a>,
                          label,
                        )}
                      </div>
                    );
                  }
                  return (
                    <div key={href}>
                      {withTooltip(
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                            isActive(href, exact)
                              ? 'bg-gray-900 text-white'
                              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                            sidebarCollapsed && 'justify-center',
                          )}
                        >
                          <Icon size={18} />
                          {!sidebarCollapsed && label}
                        </Link>,
                        label,
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  const BottomNav = () => (
    <div className="border-t">
      <div className="p-3 space-y-0.5">
        {withTooltip(
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
              isActive('/settings')
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              sidebarCollapsed && 'justify-center',
            )}
          >
            <Settings size={18} />
            {!sidebarCollapsed && '설정'}
          </Link>,
          '설정',
        )}
      </div>
      {!sidebarCollapsed && (
        <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
            <p className="text-xs text-gray-500 truncate">
              {positionLabel} / {departmentLabel}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSignOut}
                disabled={isPending}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-200"
              >
                <LogOut size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>로그아웃</TooltipContent>
          </Tooltip>
        </div>
      )}
      {sidebarCollapsed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleSignOut}
              disabled={isPending}
              className="w-full px-2 py-3 border-t bg-gray-50 flex justify-center cursor-pointer hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium text-gray-700">
                {userName.charAt(0)}
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {userName} · {positionLabel} / {departmentLabel} · 클릭하여 로그아웃
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <>
      {/* 모바일 상단바 */}
      <div className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b bg-white px-4 md:hidden">
        <span className="font-bold text-gray-900">ERP 어드민</span>
        <button onClick={() => setOpen(!open)} className="p-1 text-gray-600">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* 모바일 드로어 */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute left-0 top-14 bottom-0 w-56 bg-white shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto"><NavLinks /></div>
            <BottomNav />
          </div>
        </div>
      )}

      {/* 데스크톱 사이드바 */}
      <aside className={cn(
        'hidden md:flex md:flex-col border-r bg-white transition-all duration-200 overflow-hidden',
        sidebarCollapsed ? 'md:w-16' : 'md:w-52',
      )}>
        <div className="flex h-14 items-center justify-between px-4 border-b">
          {!sidebarCollapsed && <span className="font-bold text-gray-900">ERP 어드민</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex-1 overflow-y-auto"><NavLinks /></div>
        <BottomNav />
      </aside>

      {/* 모바일 top padding 확보 */}
      <div className="md:hidden h-14 w-0 flex-shrink-0" />

      {/* 재고 위치 찾기 모달 */}
      <InventoryFinderModal open={finderOpen} onOpenChange={setFinderOpen} />
    </>
  );
}
