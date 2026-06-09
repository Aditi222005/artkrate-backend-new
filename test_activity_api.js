/**
 * ArtKrate — Activity Module API Test Suite v2
 * Fixes: artwork seeded from existing DB posts, not multipart creation
 * Run: node test_activity_api.js
 */

const http = require('http');
const BASE = 'http://localhost:4000';
const RAND = Math.floor(Math.random() * 90000) + 10000;

// ── Tiny HTTP client ─────────────────────────────────────────────────────────
function request(method, path, { body, headers = {}, cookieJar } = {}) {
  return new Promise((resolve, reject) => {
    const isJson = body !== undefined && typeof body !== 'string' && !Buffer.isBuffer(body);
    const payload = isJson ? JSON.stringify(body) : body;

    const reqHeaders = {
      ...(isJson && body ? { 'Content-Type': 'application/json' } : {}),
      ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...(cookieJar && cookieJar.cookie ? { Cookie: cookieJar.cookie } : {}),
      ...headers,
    };

    const url = new URL(BASE + path);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders,
    }, (res) => {
      if (cookieJar && res.headers['set-cookie']) {
        cookieJar.cookie = res.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
      }
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function buildMultipart(fields) {
  const boundary = `----Boundary${Date.now()}`;
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return { payload: Buffer.from(body), contentType: `multipart/form-data; boundary=${boundary}` };
}

const pass  = (msg) => console.log(`  ✅ ${msg}`);
const fail  = (msg) => console.log(`  ❌ ${msg}`);
const info  = (msg) => console.log(`  ℹ  ${msg}`);
const skip  = (msg) => console.log(`  ⏭  ${msg}`);
const head  = (msg) => console.log(`\n${'─'.repeat(62)}\n  ${msg}\n${'─'.repeat(62)}`);
const sep   = ()    => console.log('═'.repeat(62));

async function run() {
  sep();
  console.log('  🎨  ArtKrate — Activity API Test Suite');
  sep();

  const sellerJar = { cookie: '' };
  const buyerJar  = { cookie: '' };
  let sellerId, buyerId, artworkId;

  // ── 1. Health ──────────────────────────────────────────────────────────────
  head('1. Health Check');
  const health = await request('GET', '/health');
  health.status === 200 ? pass(`Server OK — env: ${health.body.environment}`) : fail(JSON.stringify(health.body));

  // ── 2. Signup seller ──────────────────────────────────────────────────────
  head('2. Signup — Seller');
  const sellerEmail = `seller_${RAND}@artkrate.test`;
  const { payload: sp, contentType: sct } = buildMultipart({
    name: `Test Seller ${RAND}`, email: sellerEmail, password: 'Test@12345',
    userType: 'seller', gender: 'other', address: '1 Artist Lane',
    country: 'india', phoneno: `9${RAND}0`,
  });
  const s1 = await request('POST', '/api/signup', { body: sp, headers: { 'Content-Type': sct, 'Content-Length': sp.length } });
  s1.status === 201 ? pass(`Seller → ${sellerEmail}`) : fail(JSON.stringify(s1.body));

  // ── 3. Signup buyer ───────────────────────────────────────────────────────
  head('3. Signup — Buyer');
  const buyerEmail = `buyer_${RAND}@artkrate.test`;
  const { payload: bp, contentType: bct } = buildMultipart({
    name: `Test Buyer ${RAND}`, email: buyerEmail, password: 'Test@12345',
    userType: 'buyer', gender: 'other', address: '2 Collector Ave',
    country: 'india', phoneno: `8${RAND}1`,
  });
  const s2 = await request('POST', '/api/signup', { body: bp, headers: { 'Content-Type': bct, 'Content-Length': bp.length } });
  s2.status === 201 ? pass(`Buyer → ${buyerEmail}`) : fail(JSON.stringify(s2.body));

  // ── 4. Login seller ───────────────────────────────────────────────────────
  head('4. Login — Seller');
  const l1 = await request('POST', '/api/login', { body: { email: sellerEmail, password: 'Test@12345' }, cookieJar: sellerJar });
  if (l1.status === 200) { sellerId = l1.body.user._id; pass(`id: ${sellerId}`); }
  else fail(JSON.stringify(l1.body));

  // ── 5. Login buyer ────────────────────────────────────────────────────────
  head('5. Login — Buyer');
  const l2 = await request('POST', '/api/login', { body: { email: buyerEmail, password: 'Test@12345' }, cookieJar: buyerJar });
  if (l2.status === 200) { buyerId = l2.body.user._id; pass(`id: ${buyerId}`); }
  else fail(JSON.stringify(l2.body));

  // ── 6. GET /api/me ────────────────────────────────────────────────────────
  head('6. GET /api/me (seller)');
  const me = await request('GET', '/api/me', { cookieJar: sellerJar });
  me.status === 200 ? pass(`name: ${me.body.user.name}, userType: ${me.body.user.userType}`) : fail(JSON.stringify(me.body));

  // ── 7. GET /api/activity — empty ──────────────────────────────────────────
  head('7. GET /api/activity — should be empty for new seller');
  const a0 = await request('GET', '/api/activity', { cookieJar: sellerJar });
  if (a0.status === 200) {
    info(`Events: ${a0.body.activities.length}`);
    a0.body.activities.length === 0 ? pass('Empty — correct') : info('Already has events');
  } else fail(JSON.stringify(a0.body));

  // ── 8. Find an existing artwork to use for like test ─────────────────────
  head('8. GET /api/sellerpost/all — grab an artwork for like test');
  const allPosts = await request('GET', '/api/sellerpost/all', { cookieJar: sellerJar });
  if (allPosts.status === 200 && allPosts.body.posts && allPosts.body.posts.length > 0) {
    artworkId = allPosts.body.posts[0]._id;
    const artworkOwner = allPosts.body.posts[0].sellerId;
    pass(`Found artwork id: ${artworkId} by seller: ${artworkOwner?._id || artworkOwner}`);
  } else {
    skip('No artworks in DB — like test will be skipped');
    info('Upload an artwork via the dashboard to test artwork_liked activity');
  }

  // ── 9. Like artwork as buyer ──────────────────────────────────────────────
  head('9. POST /api/artwork/:id/like (buyer) → emit artwork_liked for owner');
  if (artworkId) {
    const like = await request('POST', `/api/artwork/${artworkId}/like`, { cookieJar: buyerJar });
    like.status === 200
      ? pass(`${like.body.message} — liked: ${like.body.liked}, total likes: ${like.body.likes.length}`)
      : fail(JSON.stringify(like.body));
  } else skip('No artworkId available');

  // ── 10. Follow seller as buyer ────────────────────────────────────────────
  head('10. POST /api/follow/:id (buyer → seller) → emit new_follower');
  if (sellerId) {
    const follow = await request('POST', `/api/follow/${sellerId}`, { cookieJar: buyerJar });
    follow.status === 200
      ? pass(`${follow.body.message} — followers now: ${follow.body.followersCount}`)
      : fail(JSON.stringify(follow.body));
  } else skip('No sellerId');

  // ── 11. Seller activity feed ──────────────────────────────────────────────
  head('11. GET /api/activity — seller feed after actions');
  await new Promise((r) => setTimeout(r, 400));
  const a1 = await request('GET', '/api/activity', { cookieJar: sellerJar });
  if (a1.status === 200) {
    const evts = a1.body.activities;
    info(`Total events: ${evts.length}`);
    if (evts.length > 0) {
      pass('Activity feed populated!');
      info(`Types: ${[...new Set(evts.map((e) => e.type))].join(', ')}`);
      evts.forEach((e, i) => console.log(`     [${i + 1}] ${e.type.padEnd(20)} "${e.title}" — ${e.detail}`));
    } else fail('Still empty — check logActivity wiring');
  } else fail(JSON.stringify(a1.body));

  // ── 12. Buyer activity feed ───────────────────────────────────────────────
  head('12. GET /api/activity — buyer feed (empty, no purchase yet)');
  const a2 = await request('GET', '/api/activity', { cookieJar: buyerJar });
  a2.status === 200 ? pass(`Buyer events: ${a2.body.activities.length}`) : fail(JSON.stringify(a2.body));

  // ── 13. Unauthenticated → 401 ─────────────────────────────────────────────
  head('13. GET /api/activity (no auth) → must return 401');
  const a3 = await request('GET', '/api/activity');
  a3.status === 401 ? pass('401 Unauthorized — correct') : fail(`Expected 401, got ${a3.status}`);

  // ── 14. Seller artworks ───────────────────────────────────────────────────
  head('14. GET /api/sellerpost/mine (seller)');
  const mine = await request('GET', '/api/sellerpost/mine', { cookieJar: sellerJar });
  if (mine.status === 200) {
    const posts = Array.isArray(mine.body) ? mine.body : mine.body.posts || [];
    pass(`${posts.length} artwork(s) listed`);
    posts.forEach((p, i) => console.log(`     [${i + 1}] "${p.title}" — ₹${p.price}`));
  } else fail(JSON.stringify(mine.body));

  // ── 15. check-auth ────────────────────────────────────────────────────────
  head('15. GET /api/check-auth (seller)');
  const ca = await request('GET', '/api/check-auth', { cookieJar: sellerJar });
  ca.status === 200 && ca.body.isAuthenticated
    ? pass(`Authenticated: ${ca.body.user.email}`)
    : fail(JSON.stringify(ca.body));

  // ── 16. Logout ────────────────────────────────────────────────────────────
  head('16. POST /api/logout (seller)');
  const lo = await request('POST', '/api/logout', { cookieJar: sellerJar });
  lo.status === 200 ? pass(lo.body.message) : fail(JSON.stringify(lo.body));

  // ── 17. Post-logout check-auth → 401 ─────────────────────────────────────
  head('17. GET /api/check-auth (after logout) → should be 401');
  const ca2 = await request('GET', '/api/check-auth', { cookieJar: sellerJar });
  ca2.status === 401 ? pass('Session correctly cleared') : fail(`Expected 401, got ${ca2.status}`);

  console.log();
  sep();
  console.log('  🎨  Test Suite COMPLETE');
  sep();
}

run().catch((err) => { console.error('\n💥 Crashed:', err); process.exit(1); });
