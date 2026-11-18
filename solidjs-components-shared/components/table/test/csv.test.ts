import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from '../src/csv';

describe('CSV export', () => {
  it('quotes fields with commas, quotes, line breaks or edge spaces', () => {
    expect(toCsv([['Key', 'Summary'], ['TRK-1', 'Crash, on "start"\nagain'], ['TRK-2', ' padded ']])).toBe(
      'Key,Summary\r\nTRK-1,"Crash, on ""start""\nagain"\r\nTRK-2," padded "',
    );
  });

  it('defuses values a spreadsheet would run as a formula', () => {
    expect(csvField('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvField('+1+2')).toBe("'+1+2");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('-cmd')).toBe("'-cmd");
  });

  it('leaves negative numbers and plain text as they are', () => {
    expect(csvField('-12.5')).toBe('-12.5');
    expect(csvField('In Progress')).toBe('In Progress');
    expect(csvField('')).toBe('');
  });
});
