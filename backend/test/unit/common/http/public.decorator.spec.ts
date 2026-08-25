import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, Public } from '@common/http/public.decorator';

describe('Public decorator', () => {
  const reflector = new Reflector();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks a handler as public', () => {
    class C {
      @Public()
      handler(): void {}
    }

    const meta = reflector.get(IS_PUBLIC_KEY, C.prototype.handler);
    expect(meta).toBe(true);
  });

  it('leaves an undecorated handler unmarked', () => {
    class C {
      handler(): void {}
    }

    const meta = reflector.get(IS_PUBLIC_KEY, C.prototype.handler);
    expect(meta).toBeUndefined();
  });

  it('marks a whole controller public when applied at class level', () => {
    @Public()
    class C {
      handler(): void {}
    }

    const meta = reflector.get(IS_PUBLIC_KEY, C);
    expect(meta).toBe(true);
  });
});
