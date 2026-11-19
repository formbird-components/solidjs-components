// What fieldtec-web's api/getFile/<fileNo> would serve, for the stories: the shared fixtures' sample
// photos, and otherwise a stand-in: a labelled picture, or a one-page PDF naming the file.
import { fixtures } from '@solidjs-components/testing';

type FileRef = { fileNo: string; fileName?: string; fileType?: string };
type Resources = { url?: string; base64strData?: string | null };

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const escapeXml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function picture(name: string): string {
  return svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#d9dee6"/>` +
      `<path d="M0 700 L320 420 L560 640 L760 480 L1200 820 L1200 900 L0 900Z" fill="#b5bdc9"/><circle cx="930" cy="230" r="90" fill="#eef1f5"/>` +
      `<text x="600" y="120" text-anchor="middle" font-family="sans-serif" font-size="44" fill="#4a5262">${escapeXml(name)}</text></svg>`,
  );
}

/** A minimal one-page PDF that says which file it stands for. */
function pdf(name: string): string {
  const text = `Sample document: ${name}`.replace(/[()\\]/g, '');
  const stream = `BT /F1 20 Tf 60 760 Td (${text}) Tj ET\nBT /F1 12 Tf 60 730 Td (Stand-in for fieldtec-web's api/getFile in the Storybook.) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return URL.createObjectURL(new Blob([body], { type: 'application/pdf' }));
}

const made = new Map<string, string>();

/** Makes the installed host's FileProviderService serve sample files instead of api/getFile. */
export function serveSampleFiles(): void {
  const files = (globalThis as { FormbirdServiceInjector?: Record<string, unknown> }).FormbirdServiceInjector?.FileProviderService as
    | { getFileResources(file: FileRef): Promise<Resources> }
    | undefined;
  if (!files) return;
  const fromHost = files.getFileResources.bind(files);
  files.getFileResources = async (file) => {
    const sample = fixtures.sampleFiles[file.fileNo];
    if (sample) return { url: sample, base64strData: null };
    const resources = await fromHost(file);
    // Files uploaded in the story come back as object URLs: keep those.
    if (resources.url && !resources.url.startsWith('api/getFile/')) return resources;
    const name = file.fileName ?? file.fileNo;
    const isPdf = /\.pdf$/i.test(name) || /pdf/i.test(file.fileType ?? '');
    if (!made.has(file.fileNo)) made.set(file.fileNo, isPdf ? pdf(name) : picture(name));
    return { url: made.get(file.fileNo), base64strData: null };
  };
}
