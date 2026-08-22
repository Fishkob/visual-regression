import { RequestContext } from '@common/logging/request-context';
describe('RequestContext', () => {
  it('should return undefined for get outside run context', () => {
    expect(RequestContext.get()).toBeUndefined();
  });

  it('should return undefined for traceId outside run context', () => {
    expect(RequestContext.traceId()).toBeUndefined();
  });

  it('should execute callback and return its value', () => {
    const result = RequestContext.run({ traceId: 'abc' }, () => 'ok');
    expect(result).toBe('ok');
  });

  it('should return store when called inside run', () => {
    const result = RequestContext.run({ traceId: 'abc' }, () =>
      RequestContext.get(),
    );
    expect(result).toEqual({ traceId: 'abc' });
  });

  it('should return traceId when inside run', () => {
    const result = RequestContext.run({ traceId: 'xyz' }, () =>
      RequestContext.traceId(),
    );
    expect(result).toBe('xyz');
  });

  it('should return undefined when traceId not in store', () => {
    const result = RequestContext.run({}, () => RequestContext.traceId());
    expect(result).toBeUndefined();
  });

  it('should isolate nested contexts', () => {
    const result = RequestContext.run({ traceId: 'outer' }, () =>
      RequestContext.run({ traceId: 'inner' }, () => RequestContext.traceId()),
    );
    expect(result).toBe('inner');
  });
});
