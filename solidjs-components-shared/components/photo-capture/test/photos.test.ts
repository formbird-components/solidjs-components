import { describe, expect, it } from 'vitest';
import {
  acceptsFile,
  canDownscale,
  countText,
  extensionOf,
  isImageEntry,
  isStoredFile,
  newEntry,
  patchEntry,
  removeEntry,
  scaledSize,
  toEntries,
  withExtension,
  type PhotoEntry,
} from '../src/photos';

const file = (fileName: string, extra: Partial<PhotoEntry> = {}): PhotoEntry => ({ fileNo: `no-${fileName}`, fileName, ...extra });

describe('stored files', () => {
  it("reads the field: a list, or fieldtec-web's single file record, keeping unknown entries", () => {
    expect(toEntries([{ fileNo: 'a', fileName: 'a.jpg' }, null, 'x', [1], { note: 'kept' }])).toEqual([{ fileNo: 'a', fileName: 'a.jpg' }, { note: 'kept' }]);
    expect(toEntries({ fileNo: 'a', fileName: 'a.jpg' })).toEqual([{ fileNo: 'a', fileName: 'a.jpg' }]);
    expect(toEntries(undefined)).toEqual([]);
    expect(isStoredFile({ fileNo: 'a' })).toBe(true);
    expect(isStoredFile({ fileNo: '' })).toBe(false);
    expect(isStoredFile({ note: 'kept' })).toBe(false);
  });

  it('tells images from other files by MIME type, fileType or name', () => {
    expect(isImageEntry(file('x.bin', { mimeDetailsObj: { contentType: 'image/jpeg' } }))).toBe(true);
    expect(isImageEntry(file('x.jpg', { mimeDetailsObj: { contentType: 'application/pdf' } }))).toBe(false);
    expect(isImageEntry(file('scan', { fileType: 'PNG' }))).toBe(true);
    expect(isImageEntry(file('scan', { fileType: 'image/webp' }))).toBe(true);
    expect(isImageEntry(file('report.pdf', { fileType: 'pdf' }))).toBe(false);
    expect(isImageEntry(file('IMG_0042.HEIC'))).toBe(true);
    expect(isImageEntry(file('notes.txt'))).toBe(false);
    expect(extensionOf('archive.tar.GZ')).toBe('gz');
    expect(extensionOf('README')).toBe('');
  });

  it('checks files against an accept list, as <input accept> reads it', () => {
    expect(acceptsFile('image/*', { name: 'a.png', type: 'image/png' })).toBe(true);
    expect(acceptsFile('image/*', { name: 'a.pdf', type: 'application/pdf' })).toBe(false);
    expect(acceptsFile('image/*', { name: 'photo.heic', type: '' })).toBe(true);
    expect(acceptsFile('image/*', { name: 'setup.exe', type: '' })).toBe(false);
    expect(acceptsFile('image/*, .pdf', { name: 'Report.PDF', type: '' })).toBe(true);
    expect(acceptsFile('application/pdf', { name: 'r.pdf', type: 'application/pdf' })).toBe(true);
    expect(acceptsFile('', { name: 'anything.zip', type: 'application/zip' })).toBe(true);
    expect(acceptsFile('*/*', { name: 'anything.zip', type: 'application/zip' })).toBe(true);
  });

  it('scales a photo down to fit maxDimension, keeping its shape', () => {
    expect(scaledSize(1600, 1200, 1920)).toEqual({ width: 1600, height: 1200, scaled: false });
    expect(scaledSize(1920, 1080, 1920)).toEqual({ width: 1920, height: 1080, scaled: false });
    expect(scaledSize(4032, 3024, 1920)).toEqual({ width: 1920, height: 1440, scaled: true });
    expect(scaledSize(3024, 4032, 1920)).toEqual({ width: 1440, height: 1920, scaled: true });
    expect(scaledSize(2400, 1601, 1920)).toEqual({ width: 1920, height: 1281, scaled: true });
    expect(scaledSize(10000, 2, 1000)).toEqual({ width: 1000, height: 1, scaled: true });
    expect(scaledSize(4032, 3024, 0)).toEqual({ width: 4032, height: 3024, scaled: false });
    expect(canDownscale('image/jpeg')).toBe(true);
    expect(canDownscale('image/png')).toBe(true);
    expect(canDownscale('image/gif')).toBe(false);
    expect(canDownscale('image/svg+xml')).toBe(false);
    expect(canDownscale('image/heic')).toBe(false);
    expect(withExtension('IMG_0042.PNG', 'jpg')).toBe('IMG_0042.jpg');
    expect(withExtension('scan', 'jpg')).toBe('scan.jpg');
    expect(withExtension('.png', 'jpg')).toBe('photo.jpg');
  });

  it('counts photos and files for the header', () => {
    expect(countText([])).toBe('No photos yet');
    expect(countText([file('a.jpg')])).toBe('1 photo');
    expect(countText([file('a.jpg'), file('b.png')])).toBe('2 photos');
    expect(countText([file('a.jpg'), file('b.pdf'), file('c.jpg'), file('d.jpg')])).toBe('3 photos · 1 file');
    expect(countText([file('b.pdf'), file('c.docx')])).toBe('2 files');
  });

  it('makes the entry for an upload without empty fields', () => {
    expect(newEntry({ fileNo: 'n1', fileName: 'a.jpg', fileType: 'jpg', basePath: '20261105' }, { takenDate: '2026-11-05T01:00:00.000Z', takenBy: { documentId: 'acc', name: 'Alex' }, width: 1920, height: 1440 })).toEqual({
      fileNo: 'n1',
      fileName: 'a.jpg',
      fileType: 'jpg',
      basePath: '20261105',
      takenDate: '2026-11-05T01:00:00.000Z',
      takenByRel: [{ documentId: 'acc', name: 'Alex' }],
      width: 1920,
      height: 1440,
    });
    expect(newEntry({ fileNo: 'n2', fileName: 'r.pdf' }, { takenDate: 'T' })).toEqual({ fileNo: 'n2', fileName: 'r.pdf', takenDate: 'T' });
  });

  it("changes or removes one file's entry and leaves the rest (and unknown fields) alone", () => {
    const list = [
      { fileNo: 'a', fileName: 'a.jpg', mimeDetailsObj: { contentType: 'image/jpeg' } },
      { fileNo: 'b', fileName: 'b.jpg', caption: 'Old' },
      { note: 'kept' },
      { fileNo: 'b', fileName: 'b-copy.jpg' },
    ];
    const captioned = patchEntry(list, 'a', { caption: '  Spill  ' });
    expect(captioned[0]).toEqual({ fileNo: 'a', fileName: 'a.jpg', mimeDetailsObj: { contentType: 'image/jpeg' }, caption: 'Spill' });
    expect(captioned.slice(1)).toEqual(list.slice(1));
    expect(patchEntry(list, 'b', { caption: '' })[1]).toEqual({ fileNo: 'b', fileName: 'b.jpg' });
    expect(patchEntry(list, 'b', { caption: 'Old' })).toEqual(list);
    expect(patchEntry(list, 'zz', { caption: 'x' })).toEqual(list);
    expect(removeEntry(list, 'b')).toEqual([list[0], list[2], list[3]]);
    expect(removeEntry(list, 'zz')).toEqual(list);
  });
});
