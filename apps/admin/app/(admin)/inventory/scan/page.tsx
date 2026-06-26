import ScanClient from './ScanClient';
import { getRecentLogs } from '@/actions/inventory';

export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const recentLogs = await getRecentLogs(10);
  return <ScanClient recentLogs={recentLogs} />;
}
