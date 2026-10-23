import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceSchema, feeSchema, memberSchema } from '../src/validation';

test('member records trim names and apply the starter belt rank', () => {
  const result = memberSchema.safeParse({ fullName: '  Aiko Tanaka  ' });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.fullName, 'Aiko Tanaka');
    assert.equal(result.data.beltRank, 'White belt');
    assert.equal(result.data.phone, null);
  }
});

test('attendance requires a valid member ID and calendar date', () => {
  assert.equal(
    attendanceSchema.safeParse({
      memberId: '7e47a7ef-5ad2-4caf-855f-4016602cc66f',
      attendanceDate: '2026-02-30',
    }).success,
    false,
  );
});

test('fee entries reject zero amounts and unsupported payment methods', () => {
  const base = {
    memberId: '7e47a7ef-5ad2-4caf-855f-4016602cc66f',
    feePeriod: '2026-10',
  };
  assert.equal(feeSchema.safeParse({ ...base, amount: 0 }).success, false);
  assert.equal(feeSchema.safeParse({ ...base, amount: 1.999 }).success, false);
  assert.equal(feeSchema.safeParse({ ...base, amount: 50, paymentMethod: 'cheque' }).success, false);
  assert.equal(
    feeSchema.safeParse({ ...base, amount: 50, paymentMethod: 'cash', paidOn: '2026-10-22' }).success,
    true,
  );
  assert.equal(feeSchema.safeParse({ ...base, amount: 50, feePeriod: 'October' }).success, false);
});
