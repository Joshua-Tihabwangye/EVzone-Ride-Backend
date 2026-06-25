import { estimatedMinutes, haversineKm } from '../src/common/utils/geo';

describe('geo utilities', () => {
  it('calculates a realistic Kampala-Entebbe distance', () => {
    const distance = haversineKm(
      { latitude: 0.3476, longitude: 32.5825 },
      { latitude: 0.0424, longitude: 32.4435 },
    );
    expect(distance).toBeGreaterThan(30);
    expect(distance).toBeLessThan(40);
  });

  it('estimates travel minutes', () => {
    expect(estimatedMinutes(35, 35)).toBe(60);
    expect(estimatedMinutes(0, 35)).toBe(0);
  });
});
