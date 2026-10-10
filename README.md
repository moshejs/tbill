# treasury-bill-yield

US Treasury **bill** yield math — convert between the **discount rate** (how bills are auctioned and quoted), the **price per $100**, and the **bond-equivalent yield** (the "investment rate" TreasuryDirect publishes). Zero dependencies.

```
npm install treasury-bill-yield
```

## Why

T-bills don't pay coupons, so their yields come in three flavors that constantly need converting: the 360-day discount rate, the actual price, and the 365/366-day bond-equivalent yield used to compare bills against notes and bonds. The formulas are the US Treasury's own — including the quadratic for bills longer than a half-year and the February-29 year-basis rule — and npm had none of them.

```ts
import { priceFromDiscount, bondEquivalentYield, discountFromPrice } from "treasury-bill-yield";

// 13-week bill auctioned at a 3.735% discount rate:
priceFromDiscount(0.03735, 91);   // 99.055875 — matches the published price

// 52-week bill 912797VQ7 (uses the half-year quadratic):
bondEquivalentYield({
  price: 96.097111,
  issueDate: "2026-07-09",
  maturityDate: "2027-07-08",
});                                // 0.04032 — TreasuryDirect's investment rate

discountFromPrice(99.717667, 28); // ≈ 0.0363
```

## Verification

Cross-checked against **every bill auction in the Treasury's Fiscal Data API** (`auctions_query`, 8,351 auctions with results, 1979–2026, all tenors including cash-management bills): `priceFromDiscount` reproduces the published price per 100 and `bondEquivalentYield` reproduces the published high investment rate for all 8,351. A sample of 333 auctions — including every 183-day-or-longer bill since 2008 — is committed as a test fixture.

That check settled two details the formula sheets leave implicit:

- **The half-year cut-off is 183 days.** Treasury uses the simple formula for 183-day 26-week bills even on a 365-day basis (912797SU2, issued 2026-05-28: published 3.771%; the quadratic would give 3.770%), and the quadratic beyond that (a 191-day CMB, 912795T92: published 1.378%; the simple formula would give 1.379%).
- **The year basis** is 366 exactly when a February 29 falls after the issue date and on or before its first anniversary.

`priceFromDiscount` returns the exact, unrounded price; Treasury rounds to six decimals (three before 2008), so round half-up yourself when you need the published figure.

## API

Rates are decimals (`0.0383` = 3.83%; passing `3.83` throws with a helpful message). Prices are per-$100. Dates are `"YYYY-MM-DD"` strings or `Date` objects read as UTC.

- **`priceFromDiscount(discountRate, days)`** — `100 · (1 − d·t/360)`
- **`discountFromPrice(price, days)`**
- **`bondEquivalentYield({ price, issueDate, maturityDate })`** — derives days and year basis, then: ≤183 days `((100−P)/P)·(y/t)`; >183 days the Treasury quadratic `P·(1 + (t−y/2)/y·i)·(1 + i/2) = 100`. The formulas are Treasury's for bills of up to one year.
- **`bondEquivalentYieldFromDays(price, days, basis?)`** — explicit-basis variant
- **`priceFromBondEquivalentYield(bey, days, basis?)`** — the inverse: price per 100 from an investment rate
- **`moneyMarketYield(discountRate, days)`** — CD-equivalent, `360·d/(360 − d·t)`
- **`yearBasis(issueDate)`** — 366 when Feb 29 falls within the following year, else 365
- **`daysToMaturity(issueDate, maturityDate)`**

## Related

Part of a small fixed-income toolkit: [`32nds`](https://github.com/moshejs/32nds) (Treasury quote notation) · [`day-count`](https://github.com/moshejs/day-count) · [`accrued-interest`](https://github.com/moshejs/accrued-interest) · [`sifma-holidays`](https://github.com/moshejs/sifma-holidays) · [`treasurydirect`](https://github.com/moshejs/treasurydirect) (fetch the auction data these formulas reproduce).

## Author

Built by **[Moshe Malka](https://moshemalka.com)** — engineering leader in New York City. Studio work at [Quentin.Code](https://www.quentin.software/).

MIT © Moshe Malka
