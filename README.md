# tbill

US Treasury **bill** yield math — convert between the **discount rate** (how bills are auctioned and quoted), the **price per $100**, and the **bond-equivalent yield** (the "investment rate" TreasuryDirect publishes). Zero dependencies.

```
npm install tbill
```

## Why

T-bills don't pay coupons, so their yields come in three flavors that constantly need converting: the 360-day discount rate, the actual price, and the 365/366-day bond-equivalent yield used to compare bills against notes and bonds. The formulas are the US Treasury's own — including the quadratic for bills longer than 182 days and the February-29 year-basis rule — and npm had none of them.

```ts
import { priceFromDiscount, bondEquivalentYield, discountFromPrice } from "tbill";

// 13-week bill auctioned at a 3.735% discount rate:
priceFromDiscount(0.03735, 91);   // 99.055875 — matches the published price

// 52-week bill 912797VQ7 (uses the >182-day quadratic):
bondEquivalentYield({
  price: 96.097111,
  issueDate: "2026-07-09",
  maturityDate: "2027-07-08",
});                                // 0.04032 — TreasuryDirect's investment rate

discountFromPrice(99.717667, 28); // 0.0363
```

Every function is tested against **live TreasuryDirect auction records**: for each fixture the government publishes all three numbers (discount rate, price, investment rate), and the tests reproduce each from the others — across 4-week, 13-week, 26-week, and 52-week tenors.

## API

Rates are decimals (`0.0383` = 3.83%; passing `3.83` throws with a helpful message). Prices are per-$100. Dates are `"YYYY-MM-DD"` strings or `Date` objects read as UTC.

- **`priceFromDiscount(discountRate, days)`** — `100 · (1 − d·t/360)`
- **`discountFromPrice(price, days)`**
- **`bondEquivalentYield({ price, issueDate, maturityDate })`** — derives days and year basis, then: ≤182 days `((100−P)/P)·(y/t)`; >182 days the Treasury quadratic `P·(1 + (t−y/2)/y·i)·(1 + i/2) = 100`
- **`bondEquivalentYieldFromDays(price, days, basis?)`** — explicit-basis variant
- **`moneyMarketYield(discountRate, days)`** — CD-equivalent, `360·d/(360 − d·t)`
- **`yearBasis(issueDate)`** — 366 when Feb 29 falls within the following year, else 365
- **`daysToMaturity(issueDate, maturityDate)`**

## Related

Part of a small fixed-income toolkit: [`32nds`](https://github.com/moshejs/32nds) (Treasury quote notation) · [`day-count`](https://github.com/moshejs/day-count) · [`accrued-interest`](https://github.com/moshejs/accrued-interest) · [`sifma-holidays`](https://github.com/moshejs/sifma-holidays) · [`treasurydirect`](https://github.com/moshejs/treasurydirect) (fetch the auction data these formulas reproduce).

## Author

Built by **[Moshe Malka](https://moshemalka.com)** — engineering leader in New York City. Studio work at [Quentin.Code](https://www.quentin.software/).

MIT © Moshe Malka
