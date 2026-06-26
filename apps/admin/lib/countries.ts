// 국가 데이터 (국가 선택 컴포넌트용)
// 주요 거래 국가를 상단 배치, 나머지 가나다순

export interface Country {
  code: string;      // ISO 3166-1 alpha-2 (KR, US, CN, ...)
  flag: string;      // emoji flag
  nameKo: string;    // 국문명
  nameEn: string;    // 영문명
  phoneCode: string; // 국가번호 (+82, +1, ...)
  currency?: string; // 주요 통화 (참고용)
}

// 주요 거래국 (상단 고정)
const PRIMARY_COUNTRIES: Country[] = [
  { code: 'KR', flag: '🇰🇷', nameKo: '대한민국', nameEn: 'South Korea', phoneCode: '+82', currency: 'KRW' },
  { code: 'CN', flag: '🇨🇳', nameKo: '중국', nameEn: 'China', phoneCode: '+86', currency: 'CNY' },
  { code: 'US', flag: '🇺🇸', nameKo: '미국', nameEn: 'United States', phoneCode: '+1', currency: 'USD' },
  { code: 'JP', flag: '🇯🇵', nameKo: '일본', nameEn: 'Japan', phoneCode: '+81', currency: 'JPY' },
  { code: 'TW', flag: '🇹🇼', nameKo: '대만', nameEn: 'Taiwan', phoneCode: '+886', currency: 'TWD' },
  { code: 'VN', flag: '🇻🇳', nameKo: '베트남', nameEn: 'Vietnam', phoneCode: '+84', currency: 'VND' },
  { code: 'DE', flag: '🇩🇪', nameKo: '독일', nameEn: 'Germany', phoneCode: '+49', currency: 'EUR' },
];

// 기타 국가
const OTHER_COUNTRIES: Country[] = [
  { code: 'GB', flag: '🇬🇧', nameKo: '영국', nameEn: 'United Kingdom', phoneCode: '+44', currency: 'GBP' },
  { code: 'FR', flag: '🇫🇷', nameKo: '프랑스', nameEn: 'France', phoneCode: '+33', currency: 'EUR' },
  { code: 'IT', flag: '🇮🇹', nameKo: '이탈리아', nameEn: 'Italy', phoneCode: '+39', currency: 'EUR' },
  { code: 'ES', flag: '🇪🇸', nameKo: '스페인', nameEn: 'Spain', phoneCode: '+34', currency: 'EUR' },
  { code: 'NL', flag: '🇳🇱', nameKo: '네덜란드', nameEn: 'Netherlands', phoneCode: '+31', currency: 'EUR' },
  { code: 'AU', flag: '🇦🇺', nameKo: '호주', nameEn: 'Australia', phoneCode: '+61', currency: 'AUD' },
  { code: 'CA', flag: '🇨🇦', nameKo: '캐나다', nameEn: 'Canada', phoneCode: '+1', currency: 'CAD' },
  { code: 'SG', flag: '🇸🇬', nameKo: '싱가포르', nameEn: 'Singapore', phoneCode: '+65', currency: 'SGD' },
  { code: 'HK', flag: '🇭🇰', nameKo: '홍콩', nameEn: 'Hong Kong', phoneCode: '+852', currency: 'HKD' },
  { code: 'TH', flag: '🇹🇭', nameKo: '태국', nameEn: 'Thailand', phoneCode: '+66', currency: 'THB' },
  { code: 'MY', flag: '🇲🇾', nameKo: '말레이시아', nameEn: 'Malaysia', phoneCode: '+60', currency: 'MYR' },
  { code: 'ID', flag: '🇮🇩', nameKo: '인도네시아', nameEn: 'Indonesia', phoneCode: '+62', currency: 'IDR' },
  { code: 'PH', flag: '🇵🇭', nameKo: '필리핀', nameEn: 'Philippines', phoneCode: '+63', currency: 'PHP' },
  { code: 'IN', flag: '🇮🇳', nameKo: '인도', nameEn: 'India', phoneCode: '+91', currency: 'INR' },
  { code: 'RU', flag: '🇷🇺', nameKo: '러시아', nameEn: 'Russia', phoneCode: '+7', currency: 'RUB' },
  { code: 'BR', flag: '🇧🇷', nameKo: '브라질', nameEn: 'Brazil', phoneCode: '+55', currency: 'BRL' },
  { code: 'MX', flag: '🇲🇽', nameKo: '멕시코', nameEn: 'Mexico', phoneCode: '+52', currency: 'MXN' },
  { code: 'TR', flag: '🇹🇷', nameKo: '튀르키예', nameEn: 'Turkey', phoneCode: '+90', currency: 'TRY' },
  { code: 'SA', flag: '🇸🇦', nameKo: '사우디아라비아', nameEn: 'Saudi Arabia', phoneCode: '+966', currency: 'SAR' },
  { code: 'AE', flag: '🇦🇪', nameKo: 'UAE', nameEn: 'United Arab Emirates', phoneCode: '+971', currency: 'AED' },
  { code: 'PL', flag: '🇵🇱', nameKo: '폴란드', nameEn: 'Poland', phoneCode: '+48', currency: 'PLN' },
  { code: 'SE', flag: '🇸🇪', nameKo: '스웨덴', nameEn: 'Sweden', phoneCode: '+46', currency: 'SEK' },
  { code: 'CH', flag: '🇨🇭', nameKo: '스위스', nameEn: 'Switzerland', phoneCode: '+41', currency: 'CHF' },
  { code: 'NZ', flag: '🇳🇿', nameKo: '뉴질랜드', nameEn: 'New Zealand', phoneCode: '+64', currency: 'NZD' },
  { code: 'BD', flag: '🇧🇩', nameKo: '방글라데시', nameEn: 'Bangladesh', phoneCode: '+880', currency: 'BDT' },
  { code: 'KH', flag: '🇰🇭', nameKo: '캄보디아', nameEn: 'Cambodia', phoneCode: '+855', currency: 'KHR' },
  { code: 'MM', flag: '🇲🇲', nameKo: '미얀마', nameEn: 'Myanmar', phoneCode: '+95', currency: 'MMK' },
];

export const ALL_COUNTRIES: Country[] = [
  ...PRIMARY_COUNTRIES,
  ...OTHER_COUNTRIES.sort((a, b) => a.nameKo.localeCompare(b.nameKo, 'ko')),
];

export const PRIMARY_COUNTRY_CODES = new Set(PRIMARY_COUNTRIES.map((c) => c.code));

export function getCountryByCode(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return ALL_COUNTRIES.find((c) => c.code === code);
}

// 국가 코드 → 표시용 문자열
export function formatCountry(code: string | null | undefined): string {
  const country = getCountryByCode(code);
  if (!country) return code ?? '';
  return `${country.flag} ${country.nameKo}`;
}
