import path from "node:path";
import mammoth from "mammoth";
import XLSX from "xlsx";
import { PDFParse } from "pdf-parse";

export { XLSX, PDFParse };

export const MAX_PARSED_CHARS_PER_FILE = 12000;
export const EXCEL_PREVIEW_MAX_ROWS = 120;
export const EXCEL_PREVIEW_MAX_COLS = 30;
export const EXCEL_PREVIEW_MAX_SHEETS = 8;
export const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "c",
  "h",
  "cc",
  "hh",
  "cpp",
  "hpp",
  "cxx",
  "hxx",
  "py",
  "python",
  "xml",
  "json",
  "yaml",
  "yml",
  "js",
  "jsx",
  "ts",
  "tsx",
  "java",
  "go",
  "rs",
  "sh",
  "bash",
  "zsh",
  "sql",
  "html",
  "css",
  "scss",
  "less",
  "csv",
  "tsv",
  "toml",
  "ini",
  "log",
  "tex",
  "r",
  "rb",
  "php",
  "swift",
  "kt",
  "m",
  "mm",
  "vue",
  "svelte",
]);
export const WORD_EXTENSIONS = new Set(["docx", "doc"]);
export const EXCEL_EXTENSIONS = new Set(["xlsx", "xls"]);
export const PDF_EXTENSIONS = new Set(["pdf"]);

export async function parseFileContent(file) {
  const mime = String(file?.mimetype || "").toLowerCase();
  const ext = getFileExtension(file?.originalname);

  if (isWordFile(ext, mime)) {
    const isDocx = ext === "docx" || mime.includes("wordprocessingml");
    if (!isDocx) {
      return {
        text: "",
        hint: "仅解析文字中的文本；检测到 .doc（旧版 Word），请另存为 .docx 后再上传。",
      };
    }
    return {
      text: await parseDocx(file?.buffer),
      hint: "Word 文档仅解析文字中的文本（.docx）。",
    };
  }

  if (isExcelFile(ext, mime)) {
    return {
      text: parseExcel(file?.buffer),
      hint: "Excel 表格仅解析文字中的文本（按工作表展开）。",
    };
  }

  if (isPdfFile(ext, mime)) {
    return { text: await parsePdf(file?.buffer), hint: "PDF 文本解析结果。" };
  }

  if (isTextLikeFile(ext, mime, file?.buffer)) {
    return {
      text: decodeTextFile(file?.buffer),
      hint: "文本/代码文件仅解析文字中的文本。",
    };
  }

  return { text: "", hint: "仅解析文字中的文本。" };
}

export function getFileExtension(filename) {
  const raw = path.extname(String(filename || "")).toLowerCase();
  return raw.startsWith(".") ? raw.slice(1) : raw;
}

export function normalizeMultipartFileName(filename) {
  const raw = String(filename || "").trim();
  if (!raw) return "";

  try {
    const repaired = Buffer.from(raw, "latin1").toString("utf8");
    if (!repaired || repaired.includes("\0")) return raw;
    const roundtrip = Buffer.from(repaired, "utf8").toString("latin1");
    if (roundtrip === raw) return repaired;
  } catch {
    return raw;
  }

  return raw;
}

export function isWordFile(ext, mime) {
  return WORD_EXTENSIONS.has(ext) || mime.includes("wordprocessingml") || mime.includes("msword");
}

export function isExcelFile(ext, mime) {
  return EXCEL_EXTENSIONS.has(ext) || mime.includes("spreadsheetml") || mime.includes("excel") || mime.includes("sheet");
}

export function isPdfFile(ext, mime) {
  return PDF_EXTENSIONS.has(ext) || mime.includes("pdf");
}

export function isTextLikeFile(ext, mime, buffer) {
  if (TEXT_EXTENSIONS.has(ext)) return true;
  const isTextMime =
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("markdown") ||
    mime.includes("x-python") ||
    mime.includes("x-c");
  return isTextMime && !isProbablyBinary(buffer);
}

export function isProbablyBinary(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const sampleSize = Math.min(buffer.length, 2048);
  let suspicious = 0;

  for (let index = 0; index < sampleSize; index += 1) {
    const byte = buffer[index];
    if (byte === 0) suspicious += 3;
    else if ((byte < 7 || (byte > 14 && byte < 32)) && byte !== 9) suspicious += 1;
  }

  return suspicious / sampleSize > 0.12;
}

export function decodeTextFile(buffer) {
  return String(buffer?.toString("utf8") || "").replaceAll("\0", "");
}

export async function parseDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return String(result?.value || "");
}

export function parseExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetNames = workbook.SheetNames || [];
  const sections = [];

  for (const name of sheetNames.slice(0, EXCEL_PREVIEW_MAX_SHEETS)) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], {
      header: 1,
      raw: false,
      defval: "",
    });
    const body = rows
      .slice(0, EXCEL_PREVIEW_MAX_ROWS)
      .map((row) => normalizeRow(row))
      .join("\n");
    const sectionLines = [`[工作表: ${name}]`, body || "(空工作表)"];
    if (rows.length > EXCEL_PREVIEW_MAX_ROWS) {
      sectionLines.push(`... 其余 ${rows.length - EXCEL_PREVIEW_MAX_ROWS} 行已省略`);
    }
    sections.push(sectionLines.join("\n"));
  }

  if (sheetNames.length > EXCEL_PREVIEW_MAX_SHEETS) {
    sections.push(`... 其余 ${sheetNames.length - EXCEL_PREVIEW_MAX_SHEETS} 个工作表已省略`);
  }

  return sections.join("\n\n");
}

export function normalizeRow(row) {
  if (!Array.isArray(row)) return String(row ?? "");
  const sliced = row.slice(0, EXCEL_PREVIEW_MAX_COLS).map((cell) =>
    String(cell ?? "").replace(/\r?\n/g, " ").trim(),
  );
  const line = sliced.join("\t");
  return row.length > EXCEL_PREVIEW_MAX_COLS ? `${line}\t...` : line;
}

export async function parsePdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return String(result?.text || "");
  } finally {
    await parser.destroy();
  }
}

export function clipText(text, maxChars = MAX_PARSED_CHARS_PER_FILE) {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  const numeric = Number(maxChars);
  const safeMax = Number.isFinite(numeric)
    ? Math.max(200, Math.min(500000, Math.round(numeric)))
    : MAX_PARSED_CHARS_PER_FILE;
  if (normalized.length <= safeMax) return normalized;
  return `${normalized.slice(0, safeMax)}\n...（内容过长，已截断）`;
}
