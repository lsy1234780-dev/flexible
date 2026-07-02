import { redirect } from 'next/navigation';

// 로그인 후 첫 화면 = 통합 인박스 (멘션·레코드 대화·긴급 이벤트 피드)
export default function Home() {
  redirect('/inbox');
}
