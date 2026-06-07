import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from 'pdfjs-dist';

GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

const MAX_EXTRACTED_CHARS = 12000;

function truncateText(text, limit = MAX_EXTRACTED_CHARS) {
  const normalized = String(text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit).trim()}\n\n...` : normalized;
}

function decodeXmlEntities(text = '') {
  return String(text)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isFinite(value) ? String.fromCharCode(value) : _;
    });
}

function htmlToText(html = '') {
  return decodeXmlEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n\s+/g, '\n')
  );
}

function getXmlAttr(xml, tagName, attrName) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  return xml.match(pattern)?.[1] || null;
}

function resolveZipPath(basePath, relativePath) {
  if (!relativePath) return null;
  if (!basePath) return relativePath.replace(/^\/+/, '');
  const baseParts = basePath.split('/').slice(0, -1);
  for (const part of relativePath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

export async function extractPdfText(file) {
  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;
  const pageTexts = [];
  const maxPages = Math.min(pdf.numPages, 60);

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) {
      pageTexts.push(`## 第 ${pageNo} 页\n${text}`);
    }
  }

  return {
    format: 'pdf',
    type: 'BOOK',
    content: truncateText(pageTexts.join('\n\n')),
    pageCount: pdf.numPages,
  };
}

export async function extractEpubText(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  const packagePath = getXmlAttr(containerXml || '', 'rootfile', 'full-path');
  if (!packagePath) throw new Error('无法找到 EPUB package 文件');

  const packageXml = await zip.file(packagePath)?.async('text');
  if (!packageXml) throw new Error('无法读取 EPUB package 内容');

  const title = decodeXmlEntities(packageXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] || '').trim();
  const manifest = new Map();
  for (const match of packageXml.matchAll(/<item\b[^>]*>/gi)) {
    const tag = match[0];
    const id = tag.match(/\bid=["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const mediaType = tag.match(/\bmedia-type=["']([^"']+)["']/i)?.[1] || '';
    if (id && href && /xhtml|html/i.test(mediaType)) {
      manifest.set(id, resolveZipPath(packagePath, href));
    }
  }

  const spineIds = [...packageXml.matchAll(/<itemref\b[^>]*\bidref=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const readingOrder = spineIds.map((id) => manifest.get(id)).filter(Boolean);
  const fallbackOrder = [...manifest.values()];
  const paths = readingOrder.length ? readingOrder : fallbackOrder;
  const chapters = [];

  for (const path of paths.slice(0, 80)) {
    const html = await zip.file(path)?.async('text');
    const text = htmlToText(html || '').trim();
    if (text) chapters.push(text);
  }

  return {
    format: 'epub',
    type: 'BOOK',
    title: title || null,
    content: truncateText(chapters.join('\n\n')),
  };
}

export async function extractDocumentText(file) {
  const name = file?.name?.toLowerCase?.() || '';
  if (file?.type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractPdfText(file);
  }
  if (file?.type === 'application/epub+zip' || name.endsWith('.epub')) {
    return extractEpubText(file);
  }
  return null;
}
