'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, X, Pencil } from 'lucide-react';
import { type ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataTable } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { updateUserRole } from '@/actions/auth';
import { createRoleGroup, updateRoleGroup, deleteRoleGroup, assignRoleGroup, removeRoleGroup } from '@/actions/roleGroups';
import { saveMenuAccessRules } from '@/actions/menuAccess';
import {
  createDepartment, updateDepartment, deleteDepartment,
  createPosition, updatePosition, deletePosition,
} from '@/actions/departments';
import { updateSuperAdminMinLevel } from '@/actions/settings';
import { isSuperAdmin, ALL_MENUS } from '@/lib/roles';
import type { UserRole, MenuAccessRule } from '@/lib/roles';
import type { DepartmentRow, PositionRow } from '@/actions/departments';
import dayjs from 'dayjs';

interface AdminUser {
  id: string;
  email: string;
  department: string | null;
  position: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

interface RoleGroup {
  id: string;
  name: string;
  description: string | null;
  allowed_menus: string[];
  created_at: string;
}

interface UserGroupMapping {
  user_id: string;
  role_group_id: string;
}

interface MenuRow {
  id: string;
  label: string;
  href: string;
  group?: string;
  isGroupHeader?: boolean;
}

interface Props {
  role: UserRole;
  users: AdminUser[];
  groups: RoleGroup[];
  userGroupMappings: UserGroupMapping[];
  menuRules: MenuAccessRule[];
  departments: DepartmentRow[];
  positions: PositionRow[];
  superAdminMinLevel: number;
}

export default function SettingsClient({
  role, users, groups, userGroupMappings, menuRules, departments, positions, superAdminMinLevel,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canManage = isSuperAdmin(role, superAdminMinLevel);
  const [masterLevel, setMasterLevel] = useState(superAdminMinLevel);

  // 마스터 레벨 이상인 직급은 메뉴 접근 규칙에서 제외 (항상 전체 접근)
  const nonMasterPositions = positions.filter((p) => p.level < superAdminMinLevel);

  // label lookup
  const deptLabel: Record<string, string> = {};
  for (const d of departments) deptLabel[d.id] = d.label;
  const posLabel: Record<string, string> = {};
  for (const p of positions) posLabel[p.id] = p.label;

  // ─── 메뉴 접근 규칙 ───
  const [localRules, setLocalRules] = useState<MenuAccessRule[]>(menuRules);
  const [rulesDirty, setRulesDirty] = useState(false);

  function getRule(href: string): MenuAccessRule {
    return localRules.find((r) => r.menu_href === href) ?? { menu_href: href, allowed_departments: [], allowed_positions: [] };
  }

  function toggleRuleDept(href: string, dept: string) {
    setLocalRules((prev) => {
      const rule = prev.find((r) => r.menu_href === href);
      if (rule) {
        const depts = rule.allowed_departments.includes(dept)
          ? rule.allowed_departments.filter((d) => d !== dept)
          : [...rule.allowed_departments, dept];
        return prev.map((r) => r.menu_href === href ? { ...r, allowed_departments: depts } : r);
      }
      return [...prev, { menu_href: href, allowed_departments: [dept], allowed_positions: [] }];
    });
    setRulesDirty(true);
  }

  function toggleRulePos(href: string, pos: string) {
    setLocalRules((prev) => {
      const rule = prev.find((r) => r.menu_href === href);
      if (rule) {
        const poss = rule.allowed_positions.includes(pos)
          ? rule.allowed_positions.filter((p) => p !== pos)
          : [...rule.allowed_positions, pos];
        return prev.map((r) => r.menu_href === href ? { ...r, allowed_positions: poss } : r);
      }
      return [...prev, { menu_href: href, allowed_departments: [], allowed_positions: [pos] }];
    });
    setRulesDirty(true);
  }

  function handleSaveRules() {
    startTransition(async () => {
      const result = await saveMenuAccessRules(localRules);
      if (result.error) toast.error(result.error);
      else {
        toast.success('메뉴 접근 권한이 저장되었습니다');
        setRulesDirty(false);
        router.refresh();
      }
    });
  }

  // ─── 그룹 생성/편집 ───
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupMenus, setGroupMenus] = useState<Set<string>>(new Set());

  function openCreateGroup() {
    setGroupName(''); setGroupDesc(''); setGroupMenus(new Set());
    setGroupDialog({ open: true });
  }

  function openEditGroup(group: RoleGroup) {
    setGroupName(group.name); setGroupDesc(group.description ?? '');
    setGroupMenus(new Set(group.allowed_menus));
    setGroupDialog({ open: true, editId: group.id });
  }

  function toggleGroupMenu(href: string) {
    setGroupMenus((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href); else next.add(href);
      return next;
    });
  }

  function handleSaveGroup() {
    if (!groupName.trim()) { toast.error('그룹명을 입력하세요'); return; }
    const menus = Array.from(groupMenus);
    startTransition(async () => {
      const result = groupDialog.editId
        ? await updateRoleGroup(groupDialog.editId, groupName.trim(), groupDesc.trim(), menus)
        : await createRoleGroup(groupName.trim(), groupDesc.trim(), menus);
      if (result.error) toast.error(result.error);
      else {
        toast.success(groupDialog.editId ? '그룹이 수정되었습니다' : '그룹이 생성되었습니다');
        setGroupDialog({ open: false });
        router.refresh();
      }
    });
  }

  function handleDeleteGroup(id: string, name: string) {
    if (!confirm(`'${name}' 그룹을 삭제하시겠습니까?\n배정된 멤버의 그룹 권한도 함께 해제됩니다.`)) return;
    startTransition(async () => {
      const result = await deleteRoleGroup(id);
      if (result.error) toast.error(result.error);
      else { toast.success('그룹이 삭제되었습니다'); router.refresh(); }
    });
  }

  // ─── 유저 역할 ───
  function handleRoleChange(userId: string, field: 'department' | 'position', value: string) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    const dept = field === 'department' ? value : (user.department ?? 'management');
    const pos = field === 'position' ? value : (user.position ?? 'staff');
    startTransition(async () => {
      const result = await updateUserRole(userId, dept, pos);
      if (result.error) toast.error(result.error);
      else { toast.success('역할이 변경되었습니다'); router.refresh(); }
    });
  }

  function handleAssignGroup(userId: string, groupId: string) {
    startTransition(async () => {
      const result = await assignRoleGroup(userId, groupId);
      if (result.error) toast.error(result.error);
      else { toast.success('그룹이 배정되었습니다'); router.refresh(); }
    });
  }

  function handleRemoveGroup(userId: string, groupId: string) {
    startTransition(async () => {
      const result = await removeRoleGroup(userId, groupId);
      if (result.error) toast.error(result.error);
      else { toast.success('그룹이 해제되었습니다'); router.refresh(); }
    });
  }

  // ─── 부서/직급 관리 ───
  const [deptDialog, setDeptDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [deptId, setDeptId] = useState('');
  const [deptLabelInput, setDeptLabelInput] = useState('');
  const [deptSort, setDeptSort] = useState(0);

  const [posDialog, setPosDialog] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [posId, setPosId] = useState('');
  const [posLabelInput, setPosLabelInput] = useState('');
  const [posLevel, setPosLevel] = useState(0);

  function openCreateDept() {
    setDeptId(''); setDeptLabelInput(''); setDeptSort(departments.length + 1);
    setDeptDialog({ open: true });
  }

  function openEditDept(d: DepartmentRow) {
    setDeptId(d.id); setDeptLabelInput(d.label); setDeptSort(d.sort_order);
    setDeptDialog({ open: true, editId: d.id });
  }

  function handleSaveDept() {
    if (!deptId.trim() || !deptLabelInput.trim()) { toast.error('ID와 이름을 입력하세요'); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(deptId.trim())) {
      toast.error('ID는 영문 소문자, 숫자, 밑줄(_)만 사용 가능합니다'); return;
    }
    startTransition(async () => {
      const result = deptDialog.editId
        ? await updateDepartment(deptDialog.editId, deptLabelInput.trim(), deptSort)
        : await createDepartment(deptId.trim().toLowerCase(), deptLabelInput.trim(), deptSort);
      if (result.error) toast.error(result.error);
      else {
        toast.success(deptDialog.editId ? '부서가 수정되었습니다' : '부서가 추가되었습니다');
        setDeptDialog({ open: false });
        router.refresh();
      }
    });
  }

  function handleDeleteDept(id: string, label: string) {
    if (!confirm(`'${label}' 부서를 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await deleteDepartment(id);
      if (result.error) toast.error(result.error);
      else { toast.success('부서가 삭제되었습니다'); router.refresh(); }
    });
  }

  function openCreatePos() {
    setPosId(''); setPosLabelInput(''); setPosLevel(positions.length + 1);
    setPosDialog({ open: true });
  }

  function openEditPos(p: PositionRow) {
    setPosId(p.id); setPosLabelInput(p.label); setPosLevel(p.level);
    setPosDialog({ open: true, editId: p.id });
  }

  function handleSavePos() {
    if (!posId.trim() || !posLabelInput.trim()) { toast.error('ID와 이름을 입력하세요'); return; }
    if (!/^[a-z][a-z0-9_]*$/.test(posId.trim())) {
      toast.error('ID는 영문 소문자, 숫자, 밑줄(_)만 사용 가능합니다'); return;
    }
    startTransition(async () => {
      const result = posDialog.editId
        ? await updatePosition(posDialog.editId, posLabelInput.trim(), posLevel)
        : await createPosition(posId.trim().toLowerCase(), posLabelInput.trim(), posLevel);
      if (result.error) toast.error(result.error);
      else {
        toast.success(posDialog.editId ? '직급이 수정되었습니다' : '직급이 추가되었습니다');
        setPosDialog({ open: false });
        router.refresh();
      }
    });
  }

  function handleDeletePos(id: string, label: string) {
    if (!confirm(`'${label}' 직급을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await deletePosition(id);
      if (result.error) toast.error(result.error);
      else { toast.success('직급이 삭제되었습니다'); router.refresh(); }
    });
  }

  function handleSaveMasterLevel() {
    const myLevel = role.positionLevel ?? 0;
    if (masterLevel > myLevel) {
      const confirmed = confirm(
        '현재 로그인한 직급보다 높은 레벨이 선택되었습니다.\n' +
        '설정 적용 시, 현재 계정으로 더 이상 접근 권한 수정이 불가능할 수 있습니다.\n\n' +
        '계속 진행하시겠습니까?',
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      const result = await updateSuperAdminMinLevel(masterLevel);
      if (result.error) toast.error(result.error);
      else { toast.success('마스터 최소 레벨이 변경되었습니다'); router.refresh(); }
    });
  }

  // ─── Column Definitions ───

  const departmentColumns = useMemo<ColumnDef<DepartmentRow, unknown>[]>(() => [
    {
      accessorKey: 'id',
      header: () => <span className="text-xs">ID</span>,
      cell: ({ row }) => <span className="text-xs text-gray-500 font-mono">{row.original.id}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'label',
      header: () => <span className="text-xs">이름</span>,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.label}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'sort_order',
      header: () => <span className="text-xs">순서</span>,
      size: 64,
      cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.sort_order}</span>,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: () => <span className="text-xs">관리</span>,
      size: 80,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditDept(row.original)}>
            <Pencil size={12} />
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
            onClick={() => handleDeleteDept(row.original.id, row.original.label)}
            disabled={isPending}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isPending]);

  const positionColumns = useMemo<ColumnDef<PositionRow, unknown>[]>(() => [
    {
      accessorKey: 'id',
      header: () => <span className="text-xs">ID</span>,
      cell: ({ row }) => <span className="text-xs text-gray-500 font-mono">{row.original.id}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'label',
      header: () => <span className="text-xs">이름</span>,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.label}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'level',
      header: () => <span className="text-xs">레벨</span>,
      size: 64,
      cell: ({ row }) => <span className="text-xs text-gray-500">{row.original.level}</span>,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: () => <span className="text-xs">관리</span>,
      size: 80,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => openEditPos(row.original)}>
            <Pencil size={12} />
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
            onClick={() => handleDeletePos(row.original.id, row.original.label)}
            disabled={isPending}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isPending]);

  const groupColumns = useMemo<ColumnDef<RoleGroup, unknown>[]>(() => [
    {
      accessorKey: 'name',
      header: '그룹명',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      enableSorting: false,
    },
    {
      accessorKey: 'description',
      header: '설명',
      cell: ({ row }) => <span className="text-sm text-gray-500">{row.original.description ?? '-'}</span>,
      enableSorting: false,
    },
    {
      id: 'allowed_menus',
      header: '접근 메뉴',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.allowed_menus.map((m) => {
            const menu = ALL_MENUS.find((am) => am.href === m);
            return (
              <Badge key={m} variant="secondary" className="text-[10px]">
                {menu?.label ?? m}
              </Badge>
            );
          })}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '관리',
      size: 112,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEditGroup(row.original)}>
            수정
          </Button>
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-red-500 hover:text-red-700"
            onClick={() => handleDeleteGroup(row.original.id, row.original.name)}
            disabled={isPending}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [isPending]);

  const menuRows = useMemo<MenuRow[]>(() => {
    const groups: { group: string; menus: { href: string; label: string }[] }[] = [
      { group: '상품관리', menus: [
        { href: '/products', label: '제품 관리' },
        { href: '/categories', label: '카테고리' },
        { href: '/inventory', label: '재고 현황' },
        { href: '/lots', label: 'LOT 관리' },
      ]},
      { group: '영업관리', menus: [
        { href: '/companies', label: '거래처 관리' },
        { href: '/receiving', label: '발주 관리' },
        { href: '/orders', label: '수주 관리' },
        { href: '/quotations', label: '견적서' },
      ]},
      { group: '고객관리', menus: [
        { href: '/as', label: 'A/S 관리' },
      ]},
      { group: '물류관리', menus: [
        { href: '/serials', label: '시리얼 관리' },
      ]},
    ];
    const rows: MenuRow[] = [];
    for (const g of groups) {
      rows.push({ id: `group-${g.group}`, label: g.group, href: '', group: g.group, isGroupHeader: true });
      for (const m of g.menus) {
        rows.push({ id: m.href, label: m.label, href: m.href, group: g.group });
      }
    }
    return rows;
  }, []);

  const menuAccessColumns = useMemo<ColumnDef<MenuRow, unknown>[]>(() => [
    {
      accessorKey: 'label',
      header: () => <span className="w-32">메뉴</span>,
      size: 128,
      cell: ({ row }) => {
        if (row.original.isGroupHeader) {
          return <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{row.original.label}</span>;
        }
        return <span className="text-sm font-medium pl-3">{row.original.label}</span>;
      },
      enableSorting: false,
    },
    {
      id: 'departments',
      enableSorting: false,
      header: () => (
        <div>
          <span className="text-[10px] text-gray-400">부서</span>
          <div className="flex gap-3 mt-0.5">
            {departments.map((d) => (
              <span key={d.id} className="text-[10px] font-normal">{d.label}</span>
            ))}
          </div>
        </div>
      ),
      cell: ({ row }) => {
        if (row.original.isGroupHeader) return null;
        const rule = getRule(row.original.href);
        return (
          <div className="flex gap-3">
            {departments.map((d) => (
              <div key={d.id} className="flex items-center justify-center w-8">
                <Checkbox
                  checked={rule.allowed_departments.includes(d.id)}
                  onCheckedChange={() => toggleRuleDept(row.original.href, d.id)}
                />
              </div>
            ))}
          </div>
        );
      },
    },
    {
      id: 'positions',
      enableSorting: false,
      header: () => (
        <div>
          <span className="text-[10px] text-gray-400">직급</span>
          <div className="flex gap-3 mt-0.5">
            {nonMasterPositions.map((p) => (
              <span key={p.id} className="text-[10px] font-normal">{p.label}</span>
            ))}
          </div>
        </div>
      ),
      cell: ({ row }) => {
        if (row.original.isGroupHeader) return null;
        const rule = getRule(row.original.href);
        return (
          <div className="flex gap-3">
            {nonMasterPositions.map((p) => (
              <div key={p.id} className="flex items-center justify-center w-8">
                <Checkbox
                  checked={rule.allowed_positions.includes(p.id)}
                  onCheckedChange={() => toggleRulePos(row.original.href, p.id)}
                />
              </div>
            ))}
          </div>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [departments, nonMasterPositions, localRules]);

  const userColumns = useMemo<ColumnDef<AdminUser, unknown>[]>(() => [
    {
      accessorKey: 'email',
      header: '이메일',
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.email}</span>,
      enableSorting: false,
    },
    {
      id: 'department',
      header: '부서',
      size: 112,
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.department ?? 'management'}
          onValueChange={(v) => handleRoleChange(row.original.id, 'department', v)}
          disabled={isPending}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'position',
      header: '직급',
      size: 112,
      enableSorting: false,
      cell: ({ row }) => (
        <Select
          value={row.original.position ?? 'staff'}
          onValueChange={(v) => handleRoleChange(row.original.id, 'position', v)}
          disabled={isPending}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {positions.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      id: 'groups',
      header: '그룹 롤',
      enableSorting: false,
      cell: ({ row }) => {
        const assignedGroupIds = userGroupMappings
          .filter((m) => m.user_id === row.original.id)
          .map((m) => m.role_group_id);
        const assignedGroups = groups.filter((g) => assignedGroupIds.includes(g.id));
        const availableGroups = groups.filter((g) => !assignedGroupIds.includes(g.id));

        return (
          <div className="flex items-center gap-1 flex-wrap">
            {assignedGroups.map((g) => (
              <Badge key={g.id} variant="secondary" className="text-[10px] gap-0.5 pr-0.5">
                {g.name}
                <button
                  onClick={() => handleRemoveGroup(row.original.id, g.id)}
                  disabled={isPending}
                  className="ml-0.5 rounded-full hover:bg-gray-300 p-0.5"
                >
                  <X size={10} />
                </button>
              </Badge>
            ))}
            {availableGroups.length > 0 && (
              <Select onValueChange={(gId) => handleAssignGroup(row.original.id, gId)} disabled={isPending}>
                <SelectTrigger className="h-6 text-[10px] w-24 border-dashed">
                  <SelectValue placeholder="+ 추가" />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        );
      },
    },
    {
      id: 'last_sign_in',
      header: '마지막 로그인',
      size: 112,
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-sm text-gray-500">
          {row.original.last_sign_in_at ? dayjs(row.original.last_sign_in_at).format('MM.DD HH:mm') : '-'}
        </span>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [departments, positions, groups, userGroupMappings, isPending]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">설정</h1>

      {canManage && (
        <>
          {/* 마스터 레벨 설정 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">마스터 권한 기준</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-sm text-gray-600 mb-1 block">
                    최소 레벨 (이 레벨 이상의 직급은 모든 메뉴 접근 + 설정 관리 가능)
                  </label>
                  <Select
                    value={String(masterLevel)}
                    onValueChange={(v) => setMasterLevel(Number(v))}
                  >
                    <SelectTrigger className="h-9 w-64">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {positions
                        .sort((a, b) => a.level - b.level)
                        .map((p) => (
                          <SelectItem key={p.level} value={String(p.level)}>
                            레벨 {p.level} — {p.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleSaveMasterLevel}
                  disabled={isPending || masterLevel === superAdminMinLevel}
                  size="sm"
                  className="h-9"
                >
                  저장
                </Button>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                현재 기준: 레벨 {superAdminMinLevel} 이상
                ({positions.filter((p) => p.level >= superAdminMinLevel).map((p) => p.label).join(', ') || '해당 없음'})
              </p>
            </CardContent>
          </Card>

          {/* 부서/직급 관리 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 부서 관리 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">부서 관리</CardTitle>
                  <Button size="sm" className="h-7 text-xs" onClick={openCreateDept}>
                    <Plus size={12} /> 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable columns={departmentColumns} data={departments} />
              </CardContent>
            </Card>

            {/* 직급 관리 */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">직급 관리</CardTitle>
                  <Button size="sm" className="h-7 text-xs" onClick={openCreatePos}>
                    <Plus size={12} /> 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <DataTable columns={positionColumns} data={positions} />
              </CardContent>
            </Card>
          </div>

          {/* 역할 그룹 관리 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">역할 그룹</CardTitle>
                <Button size="sm" className="h-8" onClick={openCreateGroup}>
                  <Plus size={14} /> 그룹 생성
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable columns={groupColumns} data={groups} emptyMessage="역할 그룹이 없습니다" />
            </CardContent>
          </Card>

          {/* 메뉴 접근 권한 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">메뉴 접근 권한</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">
                    빈 칸 = 전체 허용 / 체크된 항목만 접근 가능 / 마스터 레벨 이상은 항상 전체 접근
                  </p>
                </div>
                {rulesDirty && (
                  <Button size="sm" className="h-8" onClick={handleSaveRules} disabled={isPending}>
                    저장
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable columns={menuAccessColumns} data={menuRows} />
            </CardContent>
          </Card>

          {/* 사용자 역할 관리 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">사용자 역할 관리</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable columns={userColumns} data={users} />
            </CardContent>
          </Card>
        </>
      )}

      {/* 그룹 생성/편집 다이얼로그 */}
      <Dialog open={groupDialog.open} onOpenChange={(o) => setGroupDialog({ open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{groupDialog.editId ? '그룹 수정' : '그룹 생성'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">그룹명</label>
              <Input placeholder="예: 2610행사TF" value={groupName} onChange={(e) => setGroupName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">설명</label>
              <Input placeholder="선택사항" value={groupDesc} onChange={(e) => setGroupDesc(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">접근 가능 메뉴</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MENUS.map((m) => (
                  <label key={m.href} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={groupMenus.has(m.href)} onCheckedChange={() => toggleGroupMenu(m.href)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setGroupDialog({ open: false })}>취소</Button>
              <Button onClick={handleSaveGroup} disabled={isPending}>
                {groupDialog.editId ? '수정' : '생성'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 부서 추가/수정 다이얼로그 */}
      <Dialog open={deptDialog.open} onOpenChange={(o) => setDeptDialog({ open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{deptDialog.editId ? '부서 수정' : '부서 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">ID (영문)</label>
              <Input
                placeholder="예: marketing"
                value={deptId}
                onChange={(e) => setDeptId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                disabled={!!deptDialog.editId}
                className="mt-1 font-mono"
              />
              {!deptDialog.editId && (
                <p className="text-[10px] text-gray-400 mt-1">영문 소문자·숫자·밑줄만 가능, 생성 후 변경 불가</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">표시 이름</label>
              <Input placeholder="예: 마케팅" value={deptLabelInput} onChange={(e) => setDeptLabelInput(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">정렬 순서</label>
              <Input type="number" value={deptSort} onChange={(e) => setDeptSort(Number(e.target.value))} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDeptDialog({ open: false })}>취소</Button>
              <Button onClick={handleSaveDept} disabled={isPending}>
                {deptDialog.editId ? '수정' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 직급 추가/수정 다이얼로그 */}
      <Dialog open={posDialog.open} onOpenChange={(o) => setPosDialog({ open: o })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{posDialog.editId ? '직급 수정' : '직급 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">ID (영문)</label>
              <Input
                placeholder="예: intern"
                value={posId}
                onChange={(e) => setPosId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                disabled={!!posDialog.editId}
                className="mt-1 font-mono"
              />
              {!posDialog.editId && (
                <p className="text-[10px] text-gray-400 mt-1">영문 소문자·숫자·밑줄만 가능, 생성 후 변경 불가</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">표시 이름</label>
              <Input placeholder="예: 인턴" value={posLabelInput} onChange={(e) => setPosLabelInput(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">레벨 (높을수록 상위)</label>
              <Input type="number" value={posLevel} onChange={(e) => setPosLevel(Number(e.target.value))} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPosDialog({ open: false })}>취소</Button>
              <Button onClick={handleSavePos} disabled={isPending}>
                {posDialog.editId ? '수정' : '추가'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
