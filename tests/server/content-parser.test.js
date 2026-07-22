import assert from "node:assert/strict";
import test from "node:test";
import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  clipText,
  getFileExtension,
  isProbablyBinary,
  normalizeMultipartFileName,
  parseFileContent,
} from "../../server/platform/files/content-parser.js";

test("content parser keeps UTF-8 file names and detects extensions", () => {
  assert.equal(getFileExtension("作业.PY"), "py");
  assert.equal(normalizeMultipartFileName("作业.py"), "作业.py");
});

test("content parser parses text files and clips oversized text", async () => {
  const result = await parseFileContent({
    originalname: "example.py",
    mimetype: "text/x-python",
    buffer: Buffer.from("print('hello')", "utf8"),
  });

  assert.equal(result.text, "print('hello')");
  assert.match(result.hint, /文本\/代码文件/);
  assert.equal(clipText("abcdefghij", 5), "abcdefghij");
  assert.match(clipText("a".repeat(300), 200), /内容过长/);
});

test("content parser treats control-byte buffers as binary", () => {
  assert.equal(isProbablyBinary(Buffer.from([0, 1, 2, 3, 4])), true);
});

test("content parser extracts task context from a DOCX file", async () => {
  const document = new Document({
    sections: [
      {
        children: [new Paragraph("协作任务：计算成绩平均值，并检查空列表。")],
      },
    ],
  });
  const buffer = await Packer.toBuffer(document);
  const result = await parseFileContent({
    originalname: "协作任务.docx",
    mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });

  assert.match(result.text, /计算成绩平均值/);
  assert.match(result.hint, /Word/);
});

test("content parser extracts task context from a PDF file", async () => {
  const document = await PDFDocument.create();
  const page = document.addPage();
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText("Python teamwork: inspect the current code.", {
    x: 48,
    y: 720,
    size: 14,
    font,
  });
  const result = await parseFileContent({
    originalname: "task.pdf",
    mimetype: "application/pdf",
    buffer: Buffer.from(await document.save()),
  });

  assert.match(result.text, /inspect the current code/);
  assert.match(result.hint, /PDF/);
});
