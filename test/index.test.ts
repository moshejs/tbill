import { describe, expect, it } from "vitest";
import {
  bondEquivalentYield,
  bondEquivalentYieldFromDays,
  daysToMaturity,
  discountFromPrice,
  moneyMarketYield,
  priceFromBondEquivalentYield,
  priceFromDiscount,
  yearBasis,
} from "../src/index.js";
import { AUCTIONS as FISCAL_DATA } from "./fixtures.js";

// Live TreasuryDirect auction records (fetched 2026-07-10). Each row is the
// government's own published triple: high discount rate, price per 100, and
// high investment rate (bond-equivalent yield) for the same auction.
const AUCTIONS = [
  { cusip: "912797UT2", term: "4-Week", issue: "2026-07-14", maturity: "2026-08-11", days: 28, discount: 0.0363, price: 99.717667, investmentRate: 0.03691 },
  { cusip: "912797UJ4", term: "13-Week", issue: "2026-07-09", maturity: "2026-10-08", days: 91, discount: 0.03735, price: 99.055875, investmentRate: 0.03823 },
  { cusip: "912797VS3", term: "26-Week", issue: "2026-07-09", maturity: "2027-01-07", days: 182, discount: 0.0383, price: 98.063722, investmentRate: 0.0396 },
  { cusip: "912797VQ7", term: "52-Week", issue: "2026-07-09", maturity: "2027-07-08", days: 364, discount: 0.0386, price: 96.097111, investmentRate: 0.04032 },
];

describe("reproduces TreasuryDirect's published auction results", () => {
  for (const a of AUCTIONS) {
    it(`${a.term} bill ${a.cusip}`, () => {
      expect(daysToMaturity(a.issue, a.maturity)).toBe(a.days);
      // discount rate → published price (TreasuryDirect rounds to 6 decimals)
      expect(priceFromDiscount(a.discount, a.days)).toBeCloseTo(a.price, 5);
      // price → discount rate
      expect(discountFromPrice(a.price, a.days)).toBeCloseTo(a.discount, 6);
      // price + dates → published investment rate (published to 3 decimals in %)
      const bey = bondEquivalentYield({ price: a.price, issueDate: a.issue, maturityDate: a.maturity });
      expect(bey).toBeCloseTo(a.investmentRate, 5);
    });
  }

  it("uses the quadratic branch for the 52-week bill", () => {
    // Confirm > 182 days actually differs from the simple formula
    const simple = ((100 - 96.097111) / 96.097111) * (365 / 364);
    const quad = bondEquivalentYieldFromDays(96.097111, 364, 365);
    expect(quad).not.toBeCloseTo(simple, 5);
    expect(quad).toBeCloseTo(0.04032, 5);
  });
});

describe("reproduces Fiscal Data auction records (test/fixtures.ts)", () => {
  it(`matches price and investment rate for ${FISCAL_DATA.length} auctions`, () => {
    for (const a of FISCAL_DATA) {
      const days = daysToMaturity(a.issue, a.maturity);
      const price = priceFromDiscount(a.discountPct / 100, days);
      expect(Math.abs(price - a.price), `${a.cusip} ${a.issue} price`).toBeLessThan(5.1e-7);
      const bey = bondEquivalentYield({ price: a.price, issueDate: a.issue, maturityDate: a.maturity });
      expect(Math.round(bey * 100_000) / 1000, `${a.cusip} ${a.issue} investment rate`).toBe(
        a.investmentPct,
      );
    }
  });

  it("183-day bill on a 366-day basis returns a number (was NaN)", () => {
    // 912796Y52, issued 2024-01-04: published investment rate 5.264%
    const bey = bondEquivalentYield({ price: 97.435458, issueDate: "2024-01-04", maturityDate: "2024-07-05" });
    expect(bey).toBeCloseTo(0.05264, 5);
    expect(bondEquivalentYieldFromDays(98, 183, 366)).toBeCloseTo((2 / 98) * 2, 12);
  });

  it("183-day bill on a 365-day basis uses the simple formula, like Treasury", () => {
    // 912797SU2, issued 2026-05-28: published 3.771% (quadratic would give 3.770%)
    const bey = bondEquivalentYieldFromDays(98.144583, 183, 365);
    expect(Math.round(bey * 100_000) / 1000).toBe(3.771);
  });

  it("uses the quadratic past 183 days (191-day CMB 912795T92, issued 2008-10-20)", () => {
    // Published 1.378%: quadratic 1.3782%, simple formula would give 1.3786% → 1.379
    const bey = bondEquivalentYield({ price: 99.28375, issueDate: "2008-10-20", maturityDate: "2009-04-29" });
    expect(Math.round(bey * 100_000) / 1000).toBe(1.378);
  });
});

describe("priceFromBondEquivalentYield", () => {
  it("inverts bondEquivalentYieldFromDays on both branches and bases", () => {
    for (const basis of [365, 366] as const) {
      for (const t of [28, 91, 182, 183, 184, 190, 364]) {
        for (const p of [97, 98.144583, 99.99]) {
          const i = bondEquivalentYieldFromDays(p, t, basis);
          expect(priceFromBondEquivalentYield(i, t, basis)).toBeCloseTo(p, 10);
        }
      }
    }
  });

  it("reproduces a published price from the investment rate", () => {
    expect(priceFromBondEquivalentYield(0.04032, 364, 365)).toBeCloseTo(96.097111, 3);
  });
});

describe("year basis (Feb-29 rule)", () => {
  it("is 365 when no Feb 29 falls in the following year", () => {
    expect(yearBasis("2026-07-09")).toBe(365);
    expect(yearBasis("2025-03-01")).toBe(365);
  });

  it("is 366 when Feb 29 falls within the following year", () => {
    expect(yearBasis("2027-07-09")).toBe(366); // Feb 29 2028 inside
    expect(yearBasis("2028-02-28")).toBe(366); // Feb 29 2028 the next day
    expect(yearBasis("2028-02-29")).toBe(365); // starts ON Feb 29 — next one is 4y out
  });
});

describe("round trips and identities", () => {
  it("price ↔ discount round-trips exactly", () => {
    for (const d of [0.01, 0.0363, 0.0525]) {
      for (const t of [28, 91, 182, 364]) {
        expect(discountFromPrice(priceFromDiscount(d, t), t)).toBeCloseTo(d, 12);
      }
    }
  });

  it("money-market yield exceeds the discount rate", () => {
    const mmy = moneyMarketYield(0.0383, 182);
    expect(mmy).toBeGreaterThan(0.0383);
    expect(mmy).toBeCloseTo((360 * 0.0383) / (360 - 0.0383 * 182), 12);
  });

  it("BEY exceeds MMY exceeds discount (for a typical bill)", () => {
    const d = 0.0383;
    const t = 182;
    const p = priceFromDiscount(d, t);
    const bey = bondEquivalentYieldFromDays(p, t);
    expect(bey).toBeGreaterThan(moneyMarketYield(d, t));
  });
});

describe("validation", () => {
  it("catches percent-instead-of-decimal rates", () => {
    expect(() => priceFromDiscount(3.83, 91)).toThrow(/decimal/);
  });

  it("rejects bad days, prices, dates, and basis", () => {
    expect(() => priceFromDiscount(0.04, 0)).toThrow(RangeError);
    expect(() => priceFromDiscount(0.04, 90.5)).toThrow(RangeError);
    expect(() => discountFromPrice(0, 91)).toThrow(RangeError);
    expect(() => discountFromPrice(101, 91)).toThrow(RangeError);
    expect(() => bondEquivalentYieldFromDays(99, 91, 364 as never)).toThrow(RangeError);
    expect(() => daysToMaturity("2026-07-09", "2026-07-09")).toThrow(RangeError);
    expect(() => daysToMaturity("2026-7-9", "2026-10-08")).toThrow(RangeError);
    expect(() => yearBasis("2026-02-30")).toThrow(RangeError);
  });
});
