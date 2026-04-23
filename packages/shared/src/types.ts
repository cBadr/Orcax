export interface JwtUserPayload {
  sub: string;
  role: string;
  email: string;
}

export interface SearchFilters {
  domains?: string[];
  countryIds?: number[];
  totalQty?: number;
  perDomainQty?: Record<string, number>;
  localPartContains?: string;
  localPartStartsWith?: string;
  localPartEndsWith?: string;
  localPartHasDigits?: boolean;
  minLocalLength?: number;
  maxLocalLength?: number;
  allowMixDomains?: boolean;
  randomize?: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
