/**
 * tbill — US Treasury bill yield math.
 *
 * Converts between the three numbers every bill quote involves: the discount
 * rate (how bills are auctioned and quoted), the price per $100, and the
 * bond-equivalent yield (the "investment rate" TreasuryDirect publishes,
 * comparable to coupon-bearing Treasuries).
 *
 * Rates are decimals (0.0383 for 3.83%). Formulas follow the US Treasury's
 * published price/yield conventions, including the >183-day quadratic and the
 * Feb-29 year basis rule.
 */

export type DateInput = string | Date;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

interface YMD {
  y: number;
  m: number;
  d: number;
}

function toYMD(input: DateInput, label: string): YMD {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError(`Invalid Date for ${label}`);
    return { y: input.getUTCFullYear(), m: input.getUTCMonth() + 1, d: input.getUTCDate() };
  }
  const m = DATE_RE.exec(input);
  if (!m) throw new RangeError(`Invalid date for ${label}: "${input}" (expected YYYY-MM-DD)`);
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const check = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  if (
    check.getUTCFullYear() !== ymd.y ||
    check.getUTCMonth() + 1 !== ymd.m ||
    check.getUTCDate() !== ymd.d
  ) {
    throw new RangeError(`Invalid calendar date for ${label}: "${input}"`);
  }
  return ymd;
}

function utc(a: YMD): number {
  return Date.UTC(a.y, a.m - 1, a.d);
}

function checkDays(days: number): void {
  if (!Number.isInteger(days) || days <= 0 || days > 730) {
    throw new RangeError(`days must be an integer in 1–730, got ${days}`);
  }
}

function checkRate(rate: number, label: string): void {
  if (!Number.isFinite(rate) || rate < 0) throw new RangeError(`Invalid ${label}: ${rate}`);
  if (rate > 1) {
    throw new RangeError(
      `${label} must be a decimal (got ${rate} — did you mean ${rate / 100}? e.g. 0.0383 for 3.83%)`,
    );
  }
}

function checkPrice(price: number): void {
  if (!Number.isFinite(price) || price <= 0 || price > 100) {
    throw new RangeError(`price must be a per-100 value in (0, 100], got ${price}`);
  }
}

/** Actual days from issue to maturity. */
export function daysToMaturity(issueDate: DateInput, maturityDate: DateInput): number {
  const a = toYMD(issueDate, "issueDate");
  const b = toYMD(maturityDate, "maturityDate");
  const days = Math.round((utc(b) - utc(a)) / MS_PER_DAY);
  if (days <= 0) throw new RangeError("maturityDate must be after issueDate");
  return days;
}

/**
 * The Treasury's year basis for bond-equivalent yield: 366 when February 29
 * falls within the year following issue, else 365.
 */
export function yearBasis(issueDate: DateInput): 365 | 366 {
  const a = toYMD(issueDate, "issueDate");
  const start = utc(a);
  const end = Date.UTC(a.y + 1, a.m - 1, a.d);
  for (const y of [a.y, a.y + 1]) {
    const feb29 = Date.UTC(y, 1, 29);
    // Date.UTC(y, 1, 29) rolls to Mar 1 in non-leap years — verify it's real
    if (new Date(feb29).getUTCDate() !== 29) continue;
    if (feb29 > start && feb29 <= end) return 366;
  }
  return 365;
}

/**
 * Price per $100 face from the discount rate.
 * `priceFromDiscount(0.0363, 28)` → 99.71766666…
 */
export function priceFromDiscount(discountRate: number, days: number): number {
  checkRate(discountRate, "discountRate");
  checkDays(days);
  return 100 * (1 - (discountRate * days) / 360);
}

/**
 * Discount rate (decimal) from the price per $100.
 * `discountFromPrice(99.717667, 28)` → 0.0363
 */
export function discountFromPrice(price: number, days: number): number {
  checkPrice(price);
  checkDays(days);
  return ((100 - price) / 100) * (360 / days);
}

/**
 * Money-market (CD-equivalent) yield from the discount rate:
 * `360·d / (360 − d·t)`.
 */
export function moneyMarketYield(discountRate: number, days: number): number {
  checkRate(discountRate, "discountRate");
  checkDays(days);
  return (360 * discountRate) / (360 - discountRate * days);
}

/**
 * Longest term (in days) that uses the simple ("not more than one half-year")
 * investment-rate formula: 183 days for both the 365- and 366-day basis.
 *
 * Treasury prices 183-day 26-week bills with the simple formula even on a
 * 365-day basis (e.g. 912797SU2, issued 2026-05-28: published 3.771%, simple
 * 3.7707%, quadratic 3.7705%), while longer bills (e.g. a 191-day CMB) use the
 * quadratic. At exactly half the basis both formulas agree.
 */
const HALF_YEAR_DAYS = 183;

function checkBasis(basis: number): void {
  if (basis !== 365 && basis !== 366) {
    throw new RangeError(`basis must be 365 or 366, got ${basis}`);
  }
}

/**
 * Bond-equivalent yield ("investment rate") from price and term in days,
 * with an explicit year basis (365 or 366).
 *
 * - ≤ 183 days (one half-year): simple — `((100 − P)/P) · (y/t)`
 * - > 183 days: the Treasury's quadratic —
 *   solves `P · (1 + (t − y/2)/y · i) · (1 + i/2) = 100`
 */
export function bondEquivalentYieldFromDays(
  price: number,
  days: number,
  basis: 365 | 366 = 365,
): number {
  checkPrice(price);
  checkDays(days);
  checkBasis(basis);
  const y = basis;
  if (days <= HALF_YEAR_DAYS) {
    return ((100 - price) / price) * (y / days);
  }
  // P(1 + ((t − y/2)/y)·i)(1 + i/2) = 100, expanded to a·i² + b·i + c = 0.
  // Solved in the numerically stable form i = −2c / (b + √(b² − 4ac)), which
  // avoids cancellation when a is small (t just past half a year).
  const k = (days - y / 2) / y;
  const a = k / 2;
  const b = k + 0.5;
  const c = 1 - 100 / price;
  return (-2 * c) / (b + Math.sqrt(b * b - 4 * a * c));
}

/**
 * Price per $100 from a bond-equivalent yield (the inverse of
 * {@link bondEquivalentYieldFromDays}).
 *
 * ```ts
 * priceFromBondEquivalentYield(0.04032, 364, 365); // ≈ 96.0971
 * ```
 */
export function priceFromBondEquivalentYield(
  bey: number,
  days: number,
  basis: 365 | 366 = 365,
): number {
  checkRate(bey, "bey");
  checkDays(days);
  checkBasis(basis);
  const y = basis;
  if (days <= HALF_YEAR_DAYS) return 100 / (1 + (bey * days) / y);
  const k = (days - y / 2) / y;
  return 100 / ((1 + k * bey) * (1 + bey / 2));
}

export interface BillYieldParams {
  /** Price per $100 face. */
  price: number;
  issueDate: DateInput;
  maturityDate: DateInput;
}

/**
 * Bond-equivalent yield from price and dates — days and the Feb-29 year
 * basis are derived per the Treasury convention.
 *
 * ```ts
 * // 52-week bill 912797VQ7 — TreasuryDirect publishes
 * // highInvestmentRate 4.032%:
 * bondEquivalentYield({
 *   price: 96.097111,
 *   issueDate: "2026-07-09",
 *   maturityDate: "2027-07-08",
 * }); // 0.040319…
 * ```
 */
export function bondEquivalentYield(params: BillYieldParams): number {
  const days = daysToMaturity(params.issueDate, params.maturityDate);
  return bondEquivalentYieldFromDays(params.price, days, yearBasis(params.issueDate));
}
