/**
 * One CSV field. Quotes when needed, and defuses values a spreadsheet would run as a formula
 * (`=`, `+`, `@`, a leading tab or CR, or `-` not followed by a number): CSV injection.
 * @param value - Cell text
 * @returns The field as written to the file
 */
export function csvField(value: string): string {
  let text = value;
  if (/^[=+@\t\r]/.test(text) || (/^-/.test(text) && !/^-\d+(\.\d+)?$/.test(text))) text = `'${text}`;
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows to CSV text (RFC 4180 line endings).
 * @param rows - Header row first, then data rows
 * @returns CSV text
 * @example
 * ```ts
 * toCsv([['Key', 'Summary'], ['TRK-1', 'Crash, on start']]); // 'Key,Summary\r\nTRK-1,"Crash, on start"'
 * ```
 */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n');
}
