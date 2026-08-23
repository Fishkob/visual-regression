import { RequestContext } from '@common/logging/request-context';
describe('RequestContext', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns undefined for get outside run context', () => {
    expect(RequestContext.get()).toBeUndefined();
  });

  it('returns undefined for traceId outside run context', () => {
    expect(RequestContext.traceId()).toBeUndefined();
  });

  it('executes callback and returns its value', () => {
    const result = RequestContext.run({ traceId: 'abc' }, () => 'ok');
    expect(result).toBe('ok');
  });

  it('returns store when called inside run', () => {
    const result = RequestContext.run({ traceId: 'abc' }, () =>
      RequestContext.get(),
    );
    expect(result).toEqual({ traceId: 'abc' });
  });

  it('returns traceId when inside run', () => {
    const result = RequestContext.run({ traceId: 'xyz' }, () =>
      RequestContext.traceId(),
    );
    expect(result).toBe('xyz');
  });

  it('returns undefined when traceId not in store', () => {
    const result = RequestContext.run({}, () => RequestContext.traceId());
    expect(result).toBeUndefined();
  });

  it('isolates nested contexts', () => {
    const result = RequestContext.run({ traceId: 'outer' }, () =>
      RequestContext.run({ traceId: 'inner' }, () => RequestContext.traceId()),
    );
    expect(result).toBe('inner');
  });
});
