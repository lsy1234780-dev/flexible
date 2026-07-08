// Sidebar 메뉴 구조 — 실제 사이드바와 온보딩 모듈 미리보기가 공유하는 단일 소스.
import type { ComponentType } from 'react';
import {
  Package, ClipboardList, Building2, FileText, ShoppingCart,
  Tags, FolderTree, ExternalLink, ClipboardCheck, Wrench, Layers,
  PackageCheck, Warehouse, ShieldCheck, TrendingUp, Target, MessageSquare, LayoutDashboard, Inbox,
  Clock, CalendarDays, Users, SlidersHorizontal, Receipt, Banknote,
} from 'lucide-react';

const LOGISTICS_URL = process.env.NEXT_PUBLIC_LOGISTICS_URL ?? 'http://localhost:3003';

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  exact?: boolean;
  external?: boolean;
  managerOnly?: 'attendance' | 'expense'; // 해당 모듈 관리자(명시 부여)에게만 노출
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const allNavGroups: NavGroup[] = [
  {
    label: '홈',
    items: [
      { href: '/inbox', label: '인박스', icon: Inbox, exact: true },
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
    label: '근태',
    items: [
      { href: '/attendance', label: '내 근태', icon: Clock, exact: true },
      { href: '/attendance/leaves', label: '휴가', icon: CalendarDays, exact: true },
      { href: '/attendance/team', label: '팀 현황', icon: Users, exact: true, managerOnly: 'attendance' },
      { href: '/attendance/policy', label: '근태 설정', icon: SlidersHorizontal, exact: true, managerOnly: 'attendance' },
    ],
  },
  {
    label: '경비',
    items: [
      { href: '/expenses', label: '내 경비', icon: Receipt },
      { href: '/expenses/finance', label: '정산 관리', icon: Banknote, exact: true, managerOnly: 'expense' },
    ],
  },
  {
    label: '경영지원',
    items: [
      { href: '/profit-loss', label: '손익계산서', icon: TrendingUp },
    ],
  },
];
