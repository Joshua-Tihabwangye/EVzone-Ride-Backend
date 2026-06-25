import { ServiceType } from '../src/common/enums';
import { normalizeRealtimeServiceType } from '../src/realtime/socket-auth.service';

describe('realtime service channel normalization', () => {
  it.each([
    ['trip', ServiceType.RIDE],
    ['rides', ServiceType.RIDE],
    ['parcel', ServiceType.DELIVERY],
    ['tourist-vehicle', ServiceType.TOURIST_VEHICLE],
    ['car rental', ServiceType.CAR_RENTAL],
    ['school_shuttle', ServiceType.SCHOOL_SHUTTLE],
  ])('maps %s to the canonical service namespace', (input, expected) => {
    expect(normalizeRealtimeServiceType(input)).toBe(expected);
  });

  it('rejects unknown channels rather than joining an unmonitored room', () => {
    expect(() => normalizeRealtimeServiceType('unknown-service')).toThrow('Unsupported service channel');
  });
});
