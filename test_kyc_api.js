/**
 * test_kyc_api.js
 *
 * Full end-to-end KYC API test.
 *
 * Usage:
 *   node test_kyc_api.js
 *
 * The script auto-creates a test buyer account if it doesn't exist yet.
 * Update ADMIN credentials to match your DB.
 */

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const FormData = require('form-data');

// ─── Config ───────────────────────────────────────────────────────────────────
const BASE  = 'http://localhost:4000/api';
const BUYER = {
  name:     'Rahul Sharma',
  email:    'rahul.kyc.test@pixora.com',
  password: 'Test@1234',
  userType: 'buyer',
  gender:   'male',
  address:  '12 MG Road, Pune',
  country:  'India',
  phoneno:  '9876543210',
};
const ADMIN = { email: 'admin@pixora.com', password: 'admin123' };

// ─── Test document: use test_doc.jpg if present, else tiny PNG ────────────────
const DOC_PATH = path.join(__dirname, 'test_doc.jpg');
const getDocBuffer = () => {
  if (fs.existsSync(DOC_PATH)) {
    console.log(`   📄 Using test image: ${DOC_PATH}`);
    return { buffer: fs.readFileSync(DOC_PATH), name: 'aadhaar_front.jpg', mime: 'image/jpeg' };
  }
  console.log('   📄 No test_doc.jpg found — using tiny 1×1 PNG placeholder');
  const buf = Buffer.from(
    '89504e470d0a1a0a0000000d494844520000000100000001080600000'
    + '01f15c4890000000a49444154789c62600000000200' + '01e221bc330000000049454e44ae426082',
    'hex'
  );
  return { buffer: buf, name: 'test.png', mime: 'image/png' };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const client = axios.create({ baseURL: BASE });

let buyerCookie = '';
let adminCookie = '';
let passed = 0;
let failed = 0;

const getCookieHeader = (cookie) => ({ Cookie: cookie });
const extractCookie = (res) => (res.headers['set-cookie'] || []).join('; ');

const ok  = (label, detail = '') => { passed++; console.log(`   ✅  ${label}${detail ? `  →  ${detail}` : ''}`); };
const err = (label, e) => {
  failed++;
  const msg = e?.response?.data?.message || e?.message || String(e);
  console.log(`   ❌  ${label}  →  ${msg}`);
};
const section = (n, title) => console.log(`\n${'─'.repeat(56)}\n[${n}] ${title}`);

// ─── Tests ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🧪  Pixora KYC API Test Suite');
  console.log('='.repeat(56));

  // ── 0. Health check ─────────────────────────────────────────────────────────
  section(0, 'Server Health');
  try {
    const res = await axios.get('http://localhost:4000/health');
    ok('Server is up', res.data.status);
  } catch (e) {
    err('Server health check FAILED — is backend running on port 4000?', e);
    console.log('\n💡  Start the backend:  cd backend && npm run dev\n');
    process.exit(1);
  }

  // ── 1. Signup (idempotent — 409 is fine if account already exists) ──────────
  section(1, 'Create Test Buyer Account');
  try {
    const res = await client.post('/signup', BUYER);
    ok('Account created', res.data.user?.email);
  } catch (e) {
    if (e?.response?.status === 409) {
      ok('Account already exists — skipping signup');
    } else {
      err('Signup', e);
    }
  }

  // ── 2. Buyer login ───────────────────────────────────────────────────────────
  section(2, 'Buyer Login');
  try {
    const res = await client.post('/login', { email: BUYER.email, password: BUYER.password });
    buyerCookie = extractCookie(res);
    ok('Logged in', `${res.data.user?.name} (${res.data.user?.userType})`);
  } catch (e) {
    err('Buyer login', e);
    console.log('\n💡  Check BUYER credentials in this file.\n');
    process.exit(1);
  }

  // ── 3. Initial status ────────────────────────────────────────────────────────
  section(3, 'Initial Verification Status');
  try {
    const res = await client.get('/verify-seller-status', { headers: getCookieHeader(buyerCookie) });
    ok(`Status = "${res.data.status}"`);
  } catch (e) {
    err('GET /verify-seller-status', e);
  }

  // ── 4. Submit KYC ────────────────────────────────────────────────────────────
  section(4, 'POST /verify-seller — Submit Aadhaar');
  const doc = getDocBuffer();
  const fd  = new FormData();
  fd.append('documentType',   'aadhar');
  fd.append('documentNumber', '1234 5678 9012');
  fd.append('documentFront',  doc.buffer, { filename: doc.name, contentType: doc.mime });
  fd.append('selfiePhoto',    doc.buffer, { filename: doc.name, contentType: doc.mime });

  try {
    const res = await client.post('/verify-seller', fd, {
      headers: { ...fd.getHeaders(), ...getCookieHeader(buyerCookie) },
      maxBodyLength: Infinity,
    });
    ok('Submitted', res.data.message?.slice(0, 60));
    console.log(`        OCR score : ${res.data.ocrScore ?? 'N/A'}/100`);
    if (res.data.ocrScore === 0) {
      console.log(`        ℹ️  OCR score is 0 — normal if tesseract.js not installed`);
    }
  } catch (e) {
    err('POST /verify-seller', e);
  }

  // ── 5. Status after submission ───────────────────────────────────────────────
  section(5, 'Status After Submission');
  try {
    const res = await client.get('/verify-seller-status', { headers: getCookieHeader(buyerCookie) });
    const { status, remarks } = res.data;
    ok(`Status = "${status}"`, '');
    if (remarks) console.log(`        Remarks: ${remarks}`);
  } catch (e) {
    err('GET /verify-seller-status (post-submit)', e);
  }

  // ── 6. Admin login ───────────────────────────────────────────────────────────
  section(6, 'Admin Login');
  try {
    const res = await client.post('/admin/login', ADMIN);
    adminCookie = extractCookie(res);
    ok('Admin logged in', res.data.admin?.email);
  } catch (e) {
    err('Admin login', e);
    console.log('\n💡  Check ADMIN credentials. Skipping admin tests.');
    printSummary(); return;
  }

  // ── 7. Admin fetch verifications ─────────────────────────────────────────────
  section(7, 'Admin — GET /admin/verifications');
  let verificationId = null;
  try {
    const res = await client.get('/admin/verifications', { headers: getCookieHeader(adminCookie) });
    const list = res.data;
    ok(`Fetched ${list.length} record(s)`);
    if (list.length > 0) {
      const v = list[0];
      verificationId = v._id;
      console.log(`        Seller  : ${v.sellerId?.name} <${v.sellerId?.email}>`);
      console.log(`        Document: ${v.documentType} — ${v.documentNumber}`);
      console.log(`        Status  : ${v.status}`);
      console.log(`        OCR     : score=${v.ocrResult?.ocrScore ?? 'N/A'}, nameMatch=${v.ocrResult?.nameMatch}, numMatch=${v.ocrResult?.numberMatch}`);
      console.log(`        Remarks : ${v.remarks}`);
      if (v.documentFront) console.log(`        Front URL: ${v.documentFront.slice(0, 60)}…`);
    }
  } catch (e) {
    err('GET /admin/verifications', e);
  }

  // ── 8. Admin approve ─────────────────────────────────────────────────────────
  if (verificationId) {
    section(8, `Admin — Approve Verification (${verificationId})`);
    try {
      const res = await client.put(
        `/admin/update-status/${verificationId}`,
        { status: 'verified', remarks: 'Document reviewed manually — approved via API test.' },
        { headers: getCookieHeader(adminCookie) }
      );
      ok(res.data.message);
    } catch (e) {
      err('PUT /admin/update-status', e);
    }
  }

  // ── 9. Final status ──────────────────────────────────────────────────────────
  section(9, 'Final Status (expect "verified")');
  try {
    const res = await client.get('/verify-seller-status', { headers: getCookieHeader(buyerCookie) });
    const { status } = res.data;
    if (status === 'verified') ok('✅ User is now VERIFIED SELLER');
    else err(`Expected "verified", got "${status}"`, {});
  } catch (e) {
    err('GET /verify-seller-status (final)', e);
  }

  // ── 10. Re-verify (should be blocked) ────────────────────────────────────────
  section(10, 'Re-submission (should be blocked)');
  const fd2 = new FormData();
  fd2.append('documentType',   'pan');
  fd2.append('documentNumber', 'ABCDE1234F');
  fd2.append('documentFront',  doc.buffer, { filename: doc.name, contentType: doc.mime });
  fd2.append('selfiePhoto',    doc.buffer, { filename: doc.name, contentType: doc.mime });
  try {
    await client.post('/verify-seller', fd2, {
      headers: { ...fd2.getHeaders(), ...getCookieHeader(buyerCookie) },
      maxBodyLength: Infinity,
    });
    err('Re-submit should have been blocked with 400', {});
  } catch (e) {
    if (e?.response?.status === 400) ok('Blocked correctly', e.response.data.message);
    else err('Unexpected error on re-submit', e);
  }

  printSummary();
})();

function printSummary() {
  console.log('\n' + '='.repeat(56));
  console.log(`🏁  Results: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(56));
  if (failed === 0) console.log('🎉  All tests passed!');
  else              console.log('⚠️   Some tests failed — check output above.');
  console.log('\nNext steps:');
  console.log('  npm install tesseract.js    ← enable real OCR');
  console.log('  http://localhost:5174        ← admin panel');
  console.log('  http://localhost:5173        ← frontend\n');
}
