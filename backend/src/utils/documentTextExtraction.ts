import path from 'path';
import { createWorker } from 'tesseract.js';
// pdf-parse has no ESM/type-friendly default export shape -- requiring it
// this way matches its own README example.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

// Makes uploaded documents searchable (brief §5, "OCR pour rendre les
// documents recherchables"): OCR for images, text-layer extraction for
// PDFs. Deliberately skipped for audio/video/other -- there's no text to
// pull out of those with these tools. English only for now (Tesseract's
// `eng` language pack): MFWA's work spans Anglophone and Francophone West
// Africa, so French-language OCR (`eng+fra`) is a natural next step, left
// out here to avoid a much larger language-data download on first use.
const OCR_LANGUAGE = 'eng';

// Points tesseract.js at the eng.traineddata.gz already installed locally
// via the @tesseract.js-data/eng npm package, instead of its default of
// fetching it from the jsdelivr CDN on first use -- some hosting setups
// (this one included, during development) don't have outbound access to
// that CDN, which would otherwise make OCR silently fail every time.
const LANG_PATH = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

export function isTextExtractable(mimetype: string): boolean {
  return mimetype.startsWith('image/') || mimetype === 'application/pdf';
}

// Runs on the plaintext (already-decrypted-if-needed) buffer that was just
// uploaded. Never throws -- a failed extraction just means the document
// stays unsearchable by content (ocr_status = 'failed'), it should never
// take the upload itself down.
export async function extractDocumentText(buffer: Buffer, mimetype: string): Promise<string | null> {
  try {
    if (mimetype === 'application/pdf') {
      const result = await pdfParse(buffer);
      const text = (result.text ?? '').trim();
      return text || null;
    }

    if (mimetype.startsWith('image/')) {
      const worker = await createWorker(OCR_LANGUAGE, undefined, { langPath: LANG_PATH });
      try {
        const {
          data: { text },
        } = await worker.recognize(buffer);
        return text?.trim() || null;
      } finally {
        await worker.terminate();
      }
    }

    return null;
  } catch (err) {
    console.error('Document text extraction failed:', err);
    return null;
  }
}
