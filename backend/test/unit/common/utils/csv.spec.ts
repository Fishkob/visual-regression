import { escapeCsvCell, toCsvCell } from '@common/utils/csv';

describe('escapeCsvCell', () => {
  it('quotes and doubles embedded quotes', () => {
    expect(escapeCsvCell('plain')).toBe('"plain"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'prefixes the formula trigger %s with a single quote',
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value.replace(/"/g, '""')}"`);
    },
  );

  it('leaves a value that merely contains a trigger alone', () => {
    expect(escapeCsvCell('a=b')).toBe('"a=b"');
  });
});

describe('toCsvCell', () => {
  it('renders null and undefined as an empty cell', () => {
    expect(toCsvCell(null)).toBe('');
    expect(toCsvCell(undefined)).toBe('');
  });

  it('guards a formula string', () => {
    expect(toCsvCell('=HYPERLINK("http://evil")')).toBe(
      `"'=HYPERLINK(""http://evil"")"`,
    );
  });

  it('keeps numbers numeric instead of quoting them as text formulas', () => {
    expect(toCsvCell(-5)).toBe('"-5"');
    expect(toCsvCell(true)).toBe('"true"');
  });

  it('serialises a date and an object', () => {
    expect(toCsvCell(new Date('2026-01-01T00:00:00.000Z'))).toBe(
      '"2026-01-01T00:00:00.000Z"',
    );
    expect(toCsvCell({ a: 1 })).toBe('"{""a"":1}"');
  });
});
