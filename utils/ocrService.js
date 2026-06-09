
// ── Lazy-load tesseract so a missing package doesn't crash the server ─────────
let Tesseract = null;
try {
  Tesseract = require('tesseract.js');
  console.log('✅ tesseract.js loaded — OCR is enabled');
} catch {
  console.warn('⚠️  tesseract.js not installed — OCR will be skipped. Run: npm install tesseract.js');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const normalise = (str = '') =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const checkNameMatch = (ocrText, userName) => {
  if (!userName) return false;
  const ocrNorm = normalise(ocrText);
  const nameWords = normalise(userName).split(' ').filter((w) => w.length > 1);
  const matched = nameWords.filter((w) => ocrNorm.includes(w)).length;
  return matched >= Math.ceil(nameWords.length / 2);
};

const checkNumberMatch = (ocrText, docNumber) => {
  if (!docNumber) return false;
  const clean = (s) => s.replace(/[\s\-]/g, '').toLowerCase();
  return clean(ocrText).includes(clean(docNumber));
};

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * Run OCR on a document image buffer.
 * Returns { extractedText, nameMatch, numberMatch, ocrScore, skipped }.
 *
 * If tesseract.js is not installed → returns skipped:true, ocrScore:0.
 */
const runOCRVerification = async (imageBuffer, userName, docNumber) => {
  // No Tesseract → graceful skip
  if (!Tesseract) {
    return {
      extractedText: '',
      nameMatch: false,
      numberMatch: false,
      ocrScore: 0,
      skipped: true,
    };
  }

  const {
    data: { text },
  } = await Tesseract.recognize(imageBuffer, 'eng', {
    logger: process.env.NODE_ENV === 'development' ? (m) => console.log(m) : () => { },
    errorHandler: (err) => console.error('Tesseract Worker Error:', err),
  });

  const extractedText = text || '';
  const nameMatch = checkNameMatch(extractedText, userName);
  const numberMatch = checkNumberMatch(extractedText, docNumber);
  const ocrScore = (nameMatch ? 50 : 0) + (numberMatch ? 50 : 0);

  return { extractedText, nameMatch, numberMatch, ocrScore, skipped: false };
};

module.exports = { runOCRVerification };
