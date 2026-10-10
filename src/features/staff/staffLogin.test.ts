import { describe, expect, it } from 'vitest';

import { RpcError } from '@/lib/supabase/rpcResult';

import {
  StaffLinkError,
  linkErrorKey,
  loginOptions,
  NO_LOGIN,
  type LoginMember,
} from './staffLogin';

const labels = { noLoginLabel: 'No login', pendingLabel: 'invited', unnamedLabel: 'Unnamed' };

const members: LoginMember[] = [
  {
    id: 'm1',
    status: 'active',
    fullName: 'Olivia Owner',
    email: 'o@x.test',
    roles: [{ roleName: 'Owner' }],
  },
  {
    id: 'm2',
    status: 'active',
    fullName: null,
    email: 'sam@x.test',
    roles: [{ roleName: 'Staff' }],
  },
  {
    id: 'm3',
    status: 'invited',
    fullName: null,
    email: 'new@x.test',
    roles: [{ roleName: 'Staff' }],
  },
  { id: 'm4', status: 'disabled', fullName: 'Gone', email: 'g@x.test', roles: [] },
];

describe('loginOptions', () => {
  it('starts with "no login" and lists active and invited members only', () => {
    const options = loginOptions({ members, staff: [], currentStaffId: null, ...labels });
    expect(options.map((o) => o.value)).toEqual([NO_LOGIN, 'm1', 'm2', 'm3']);
  });

  it('labels by name, falls back to email, marks pending invites', () => {
    const options = loginOptions({ members, staff: [], currentStaffId: null, ...labels });
    expect(options[1]).toMatchObject({ label: 'Olivia Owner', hint: 'o@x.test · Owner' });
    expect(options[2]).toMatchObject({ label: 'sam@x.test', hint: 'Staff' });
    expect(options[3]?.label).toBe('new@x.test (invited)');
  });

  it("hides logins that already own ANOTHER profile but keeps this profile's own", () => {
    const staff = [
      { id: 's1', memberId: 'm1' },
      { id: 's2', memberId: 'm2' },
    ];
    const forS1 = loginOptions({ members, staff, currentStaffId: 's1', ...labels });
    expect(forS1.map((o) => o.value)).toEqual([NO_LOGIN, 'm1', 'm3']);
    const forNew = loginOptions({ members, staff, currentStaffId: null, ...labels });
    expect(forNew.map((o) => o.value)).toEqual([NO_LOGIN, 'm3']);
  });
});

describe('linkErrorKey', () => {
  it('maps the codes the RPCs return', () => {
    expect(linkErrorKey(new RpcError('member_already_linked'))).toBe(
      'staff.login.errors.memberAlreadyLinked',
    );
    expect(linkErrorKey(new RpcError('already_staff'))).toBe('staff.login.errors.alreadyStaff');
  });

  it('returns null for anything else', () => {
    expect(linkErrorKey(new RpcError('mystery'))).toBeNull();
    expect(linkErrorKey(new Error('boom'))).toBeNull();
  });
});

describe('StaffLinkError (profile saved, login refused)', () => {
  it('carries the saved profile id and the reason the link was refused', () => {
    const refusal = new RpcError('member_already_linked');
    const error = new StaffLinkError('staff-1', refusal);
    expect(error.staffId).toBe('staff-1');
    expect(error.cause).toBe(refusal);
    expect(error.message).toBe('member_already_linked');
    // the screen turns the cause into a specific message, never the raw code
    expect(linkErrorKey(error.cause)).toBe('staff.login.errors.memberAlreadyLinked');
    // and it is distinguishable from an ordinary save failure
    expect(error instanceof StaffLinkError).toBe(true);
    expect(new Error('boom') instanceof StaffLinkError).toBe(false);
  });
});
