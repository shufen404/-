const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');

const MAX_FILE_BYTES = 60 * 1024 * 1024;
const MAX_TEXT_LENGTH = 8_000_000;
const SUPPORTED_READER_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt', 'md', 'markdown'];

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

async function extractPdfText(filePath) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
    verbosity: 0
  });
  const pdf = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map(item => `${item.str || ''}${item.hasEOL ? '\n' : ' '}`).join('');
      pages.push(`第 ${pageNumber} 页\n\n${normalizeText(text)}`);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return { text: pages.join('\n\n──────────\n\n'), pageCount: pages.length };
}

async function extractDocxText(filePath) {
  const result = await mammoth.extractRawText({ buffer: fs.readFileSync(filePath) });
  return { text: normalizeText(result.value), pageCount: null };
}

async function extractLegacyDocText(filePath) {
  const document = await new WordExtractor().extract(filePath);
  return { text: normalizeText(document.getBody()), pageCount: null };
}

function extractPlainText(filePath) {
  return { text: normalizeText(fs.readFileSync(filePath, 'utf8')), pageCount: null };
}

async function parseReaderDocument(filePath) {
  const resolvedPath = path.resolve(filePath);
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) throw new Error('选择的内容不是文件');
  if (stat.size > MAX_FILE_BYTES) throw new Error('文档不能超过 60 MB');

  const extension = path.extname(resolvedPath).slice(1).toLowerCase();
  if (!SUPPORTED_READER_EXTENSIONS.includes(extension)) throw new Error('暂不支持这种文档格式');

  const parsed = extension === 'pdf'
    ? await extractPdfText(resolvedPath)
    : extension === 'doc'
      ? await extractLegacyDocText(resolvedPath)
    : extension === 'docx'
      ? await extractDocxText(resolvedPath)
      : extractPlainText(resolvedPath);
  let text = normalizeText(parsed.text);
  if (!text) throw new Error('没有从文档中读取到文字；扫描版 PDF 暂不支持 OCR');
  const truncated = text.length > MAX_TEXT_LENGTH;
  if (truncated) text = `${text.slice(0, MAX_TEXT_LENGTH)}\n\n[文档内容较长，预览已到达上限]`;

  return {
    ok: true,
    name: path.basename(resolvedPath),
    format: extension === 'markdown' ? 'MD' : extension.toUpperCase(),
    text,
    pageCount: parsed.pageCount,
    characterCount: text.length,
    truncated
  };
}

module.exports = { parseReaderDocument, SUPPORTED_READER_EXTENSIONS };
