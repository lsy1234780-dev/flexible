// CSV 생성 헬퍼 — 급여SW/엑셀 임포트용.
// UTF-8 BOM을 반드시 붙인다: 없으면 엑셀(한국어 환경)에서 한글이 전부 깨진다.

function escapeCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  return String.fromCharCode(0xfeff) + lines.join('\r\n'); // BOM + CRLF (엑셀 호환)
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
