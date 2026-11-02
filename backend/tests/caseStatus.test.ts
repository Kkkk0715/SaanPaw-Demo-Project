import { CASE_STATUS_LABELS, CASE_STATUS_TRANSITIONS, canChangeCaseStatus } from '../src/config/constants';

describe('case status transitions', () => {
  it('moves from under recovery to any one outcome', () => {
    expect(canChangeCaseStatus('under_rescue', 'reunited')).toBe(true);
    expect(canChangeCaseStatus('under_rescue', 'adopted')).toBe(true);
    expect(canChangeCaseStatus('under_rescue', 'inconclusive')).toBe(true);
  });

  it('never loops back or moves between outcomes', () => {
    for (const closed of ['reunited', 'adopted', 'inconclusive'] as const) {
      expect(CASE_STATUS_TRANSITIONS[closed]).toEqual([]);
      expect(canChangeCaseStatus(closed, 'under_rescue')).toBe(false);
    }
    expect(canChangeCaseStatus('adopted', 'reunited')).toBe(false);
    expect(canChangeCaseStatus('under_rescue', 'under_rescue')).toBe(false);
  });

  it('shows "under rescue" to people as "Under recovery"', () => {
    expect(CASE_STATUS_LABELS.under_rescue).toBe('Under recovery');
  });
});
