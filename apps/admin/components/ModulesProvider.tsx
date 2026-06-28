'use client';

// 켜진 모듈 목록을 앱 전역(클라이언트)에서 읽기 위한 컨텍스트.
// 레이아웃이 서버에서 한 번 fetch한 enabledModules를 내려주고,
// ShareToChat·RecordChatPanel 등 어느 클라이언트 컴포넌트든 재fetch 없이 게이팅한다.
// (모듈화 OS: "이 워크스페이스가 그 기능을 쓰나"의 단일 출처.)

import { createContext, useContext } from 'react';

const ModulesContext = createContext<string[]>([]);

export function ModulesProvider({ modules, children }: { modules: string[]; children: React.ReactNode }) {
  return <ModulesContext.Provider value={modules}>{children}</ModulesContext.Provider>;
}

export function useEnabledModules(): string[] {
  return useContext(ModulesContext);
}

export function useModuleEnabled(moduleKey: string): boolean {
  return useContext(ModulesContext).includes(moduleKey);
}
