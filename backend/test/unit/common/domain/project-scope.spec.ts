import {
  ALL_PROJECTS,
  restrictScope,
  scopeAllows,
} from '@common/domain/project-scope';

describe('project-scope', () => {
  const ids = (values: string[]) => ({
    kind: 'ids' as const,
    ids: new Set(values),
  });

  describe('scopeAllows', () => {
    it('allows every project for an unrestricted scope', () => {
      expect(scopeAllows(ALL_PROJECTS, 'p-1')).toBe(true);
      expect(scopeAllows(ALL_PROJECTS, 'p-anything')).toBe(true);
    });

    it('allows only the ids in an explicit scope', () => {
      expect(scopeAllows(ids(['p-1']), 'p-1')).toBe(true);
      expect(scopeAllows(ids(['p-1']), 'p-2')).toBe(false);
    });

    it('allows nothing for an empty scope', () => {
      expect(scopeAllows(ids([]), 'p-1')).toBe(false);
    });
  });

  describe('restrictScope', () => {
    it('leaves the scope untouched when the allowlist is empty', () => {
      const scope = ids(['p-1', 'p-2']);

      expect(restrictScope(scope, [])).toBe(scope);
    });

    it('intersects an explicit scope with the allowlist', () => {
      const restricted = restrictScope(ids(['p-1', 'p-2']), ['p-2', 'p-3']);

      expect(restricted).toEqual({ kind: 'ids', ids: new Set(['p-2']) });
    });

    it('turns the unrestricted scope into exactly the allowlist', () => {
      expect(restrictScope(ALL_PROJECTS, ['p-9'])).toEqual({
        kind: 'ids',
        ids: new Set(['p-9']),
      });
    });

    it('narrows to nothing when the allowlist and the scope do not overlap', () => {
      expect(restrictScope(ids(['p-1']), ['p-2'])).toEqual({
        kind: 'ids',
        ids: new Set(),
      });
    });
  });
});
