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
    teams: {
      Checkout: ['checkout-ui'],
      Backoffice: ['dashboard-ui'],
      general: ['admin-ui'],
    },
    sharedProjects: ['admin-ui'],
    ...overrides,
  };
}

describe('buildTeamPlan', () => {
  it('maps every demo project to its owning team', () => {
    const plan = buildTeamPlan(makeFixtures());

    expect(plan.teams).toEqual([
      {
        name: 'Checkout',
        projectNames: ['checkout-ui'],
        usernames: ['checkout-lead'],
      },
      { name: 'Backoffice', projectNames: ['dashboard-ui'], usernames: [] },
      { name: 'general', projectNames: ['admin-ui'], usernames: [] },
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
      [],
    ]);
  });

  it('rejects a demo project that no team owns', () => {
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
    ).toThrow(/billing-ui belong to no team/);
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

  it('accepts a project that is owned and shared at once', () => {
    const plan = buildTeamPlan(
      makeFixtures({ sharedProjects: ['checkout-ui'] }),
    );

    expect(plan.sharedProjects).toEqual(['checkout-ui']);
    expect(plan.teams[0].projectNames).toEqual(['checkout-ui']);
  });

  it('rejects a shared project that no team owns', () => {
    expect(() =>
      buildTeamPlan(
        makeFixtures({
          teams: { Checkout: ['checkout-ui'], Backoffice: ['dashboard-ui'] },
          sharedProjects: ['admin-ui'],
        }),
      ),
    ).toThrow(/admin-ui".*no team owns/);
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
