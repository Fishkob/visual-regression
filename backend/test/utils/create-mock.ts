const mockCache = new WeakMap();

function createMockHandler(target: object): ProxyHandler<object> {
  return {
    get(_, prop: string | symbol) {
      if (
        prop === 'then' ||
        prop === Symbol.toPrimitive ||
        prop === Symbol.iterator
      ) {
        return undefined;
      }
      if (prop in target) {
        return (target as Record<string | symbol, unknown>)[prop];
      }
      if (!mockCache.has(target)) {
        mockCache.set(target, {});
      }
      const cache = mockCache.get(target)!;
      if (!(prop in cache)) {
        (cache as Record<string | symbol, jest.Mock>)[prop] = jest.fn();
      }
      return (cache as Record<string | symbol, jest.Mock>)[prop];
    },
    set(_, prop: string | symbol, value: unknown) {
      (target as Record<string | symbol, unknown>)[prop] = value;
      return true;
    },
    has(_, prop: string | symbol) {
      return prop in target;
    },
    ownKeys() {
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor() {
      return {
        configurable: true,
        enumerable: true,
        writable: true,
        value: undefined,
      };
    },
  };
}

export function createMock<T = Record<string, jest.Mock>>(): jest.Mocked<T> {
  const target = Object.create(null);
  return new Proxy(
    target,
    createMockHandler(target),
  ) as unknown as jest.Mocked<T>;
}
