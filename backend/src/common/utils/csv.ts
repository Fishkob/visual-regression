// The one CSV cell rule for every export this process writes. Quoting alone
// does not stop a spreadsheet: Excel/LibreOffice evaluate a cell whose first
// character is =, +, -, @, TAB or CR even inside quotes, and several exported
// columns are free-form user input (branch/test names, audit metadata). The
// OWASP CSV-injection mitigation is a leading single quote that forces the cell
// to text.
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string): string {
  const guarded = CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

// Same rule for a column whose value is not typed as a string. Numbers,
// booleans and dates are emitted as their canonical text and are not
// formula-guarded (a negative number must stay a number); objects fall back to
// JSON and are guarded like strings.
export function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return `"${String(value)}"`;
  }
  if (value instanceof Date) {
    return `"${value.toISOString()}"`;
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return escapeCsvCell(text);
}
