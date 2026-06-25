import { calculateFare } from '../src/pricing/pricing.service';

describe('fare calculator', () => {
  it('applies metered pricing, surge, fees, extras and discount', () => {
    const result = calculateFare({
      baseFare: 2_000,
      perKm: 1_000,
      perMinute: 100,
      distanceKm: 10,
      durationMinutes: 20,
      minimumFare: 5_000,
      bookingFee: 500,
      multiplier: 1.5,
      extrasAmount: 1_000,
      discountAmount: 2_000,
    });
    expect(result.subtotal).toBe(21_000);
    expect(result.total).toBe(20_500);
  });

  it('enforces minimum fare and never returns a negative total', () => {
    expect(
      calculateFare({
        baseFare: 500,
        perKm: 0,
        perMinute: 0,
        distanceKm: 0,
        durationMinutes: 0,
        minimumFare: 3_000,
        bookingFee: 0,
        multiplier: 1,
        discountAmount: 10_000,
      }).total,
    ).toBe(0);
  });
});
