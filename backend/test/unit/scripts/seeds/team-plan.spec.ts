import {
  buildTeamPlan,
  type DemoTeamFixtures,
} from '@/scripts/seeds/team-plan';

function makeFixtures(
  overrides: Partial<DemoTeamFixtures> = {},
): DemoTeamFixtures {
  return {
    demoProjects: ['checkout-ui', 'dashboard-ui', 'admin-ui'],
    users: [
      { username: 'checkout-lead', role: 'MEMBER', teams: ['Checkout'] },
      { username: 'viewer', role: 'VIEWER', teams: [] },
    ],
    teams: { Checkout: ['checkout-ui'], Backoffice: ['dashboard-ui'] },
    sharedProjects: ['admin-ui'],
    ...overrides,
  };
}

describe('buildTeamPlan', () => {
  it('maps every demo project to its team or to shared', () => {
    const plan = buildTeamPlan(makeFixtures());

    expect(plan.teams).toEqual([
      {
        name: 'Checkout',
        projectNames: ['checkout-ui'],
        usernames: ['checkout-lead'],
      },
      { name: 'Backoffice', projectNames: ['dashboard-ui'], usernames: [] },
    ]);
    expect(plan.sharedProjects).toEqual(['admin-ui']);
  });

  it('puts a user into every team it names', () => {
    const plan = buildTeamPlan(
      makeFixtures({
        users: [
          {
            username: 'both',
            role: 'MEMBER',
            teams: ['Checkout', 'Backoffice'],
          },
        ],
      }),
    );

    expect(plan.teams.map((team) => team.usernames)).toEqual([
      ['both'],
      ['both'],
    ]);
  });

  it('rejects a demo project that is neither owned nor shared', () => {
    expect(() =>
      buildTeamPlan(
        makeFixtures({
          demoProjects: [
            'checkout-ui',
            'dashboard-ui',
            'admin-ui',
            'billing-ui',
          ],
        }),
      ),
    ).toThrow(/billing-ui belong to no team and are not listed as shared/);
  });

  it('rejects a project owned by two teams', () => {
    expect(() =>
      buildTeamPlan(
        makeFixtures({
          teams: { Checkout: ['checkout-ui'], Backoffice: ['checkout-ui'] },
        }),
      ),
    ).toThrow(/owned by both "Checkout" and "Backoffice"/);
  });

  it('rejects a project that is owned and shared at once', () => {
    expect(() =>
      buildTeamPlan(makeFixtures({ sharedProjects: ['checkout-ui'] })),
    ).toThrow(/owned by "Checkout" and listed in DEMO_SHARED_PROJECTS/);
  });

  it('rejects a team naming a project outside the demo set', () => {
    expect(() =>
      buildTeamPlan(makeFixtures({ teams: { Checkout: ['no-such-project'] } })),
    ).toThrow(/Team "Checkout" names project "no-such-project"/);
  });

  it('rejects a shared project outside the demo set', () => {
    expect(() =>
      buildTeamPlan(makeFixtures({ sharedProjects: ['no-such-project'] })),
    ).toThrow(/DEMO_SHARED_PROJECTS names project "no-such-project"/);
  });

  it('rejects a user naming a team the fixtures do not define', () => {
    expect(() =>
      buildTeamPlan(
        makeFixtures({
          users: [{ username: 'ghost', role: 'MEMBER', teams: ['Nope'] }],
        }),
      ),
    ).toThrow(/"ghost" names team "Nope"/);
  });
});
