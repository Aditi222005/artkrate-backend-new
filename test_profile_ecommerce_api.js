/**
 * ArtKrate — Profile E-Commerce API Test Suite
 * Run: node test_profile_ecommerce_api.js
 */

const http = require('http');
const BASE = 'http://localhost:4000';
const RAND = Math.floor(Math.random() * 90000) + 10000;

// ── Tiny HTTP client with cookie persistence ──────────────────────────────────
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
  console.log('  🛍️  ArtKrate — Buyer Profile E-Commerce API Test Suite');
  sep();

  const buyerJar  = { cookie: '' };
  let buyerId, addressId, paymentId, notificationId, mockOrderId, mockArtworkId;

  // ── 1. Signup buyer ───────────────────────────────────────────────────────
  head('1. Creating Mock Buyer Account');
  const buyerEmail = `buyer_profile_${RAND}@artkrate.test`;
  const { payload: bp, contentType: bct } = buildMultipart({
    name: `Collector ${RAND}`, email: buyerEmail, password: 'Test@12345',
    userType: 'buyer', gender: 'female', address: '10 Art Gallery Road',
    country: 'India', phoneno: `98765${RAND}`,
  });
  
  const s2 = await request('POST', '/api/signup', { body: bp, headers: { 'Content-Type': bct, 'Content-Length': bp.length } });
  s2.status === 201 ? pass(`Buyer registered: ${buyerEmail}`) : fail(JSON.stringify(s2.body));

  // ── 2. Login buyer ────────────────────────────────────────────────────────
  head('2. Authenticating Session');
  const l2 = await request('POST', '/api/login', { body: { email: buyerEmail, password: 'Test@12345' }, cookieJar: buyerJar });
  if (l2.status === 200) { 
    buyerId = l2.body.user._id; 
    pass(`Session established. User ID: ${buyerId}`); 
  } else {
    fail(JSON.stringify(l2.body));
  }

  // ── 3. Manage Addresses ───────────────────────────────────────────────────
  head('3. Testing Addresses Manager (POST /api/me/addresses)');
  const addrRes = await request('POST', '/api/me/addresses', {
    body: {
      label: 'Home',
      street: 'Flat 402, Golden Heights Apartment',
      city: 'Mumbai',
      state: 'Maharashtra',
      zipCode: '400001',
      country: 'India',
      isDefault: true
    },
    cookieJar: buyerJar
  });

  if (addrRes.status === 201) {
    const addresses = addrRes.body.addresses;
    pass(`Address saved. Total addresses: ${addresses.length}`);
    if (addresses.length > 0) {
      addressId = addresses[0]._id;
      info(`New Address ID: ${addressId} (${addresses[0].label})`);
    }
  } else {
    fail(JSON.stringify(addrRes.body));
  }

  // ── 4. Manage Payment Methods ─────────────────────────────────────────────
  head('4. Testing Payment Methods (POST /api/me/payments)');
  const payRes = await request('POST', '/api/me/payments', {
    body: {
      cardType: 'Visa',
      cardLast4: '4111',
      cardExpiry: '12/29',
      isDefault: true
    },
    cookieJar: buyerJar
  });

  if (payRes.status === 201) {
    const pmList = payRes.body.paymentMethods;
    pass(`Card added successfully. Total methods: ${pmList.length}`);
    if (pmList.length > 0) {
      paymentId = pmList[0]._id;
      info(`New Payment Method ID: ${paymentId}`);
    }
  } else {
    fail(JSON.stringify(payRes.body));
  }

  // ── 5. Get Mock Order/Artwork for Review testing ──────────────────────────
  head('5. Fetching Mock Order Context');
  // First seek if there is an artwork in database
  const allPosts = await request('GET', '/api/sellerpost/all', { cookieJar: buyerJar });
  if (allPosts.status === 200 && allPosts.body.posts && allPosts.body.posts.length > 0) {
    mockArtworkId = allPosts.body.posts[0]._id;
    // Look if any order exists, if not we simulate order details or use mock ids
    const orderRes = await request('GET', '/api/order/buyer', { cookieJar: buyerJar });
    if (orderRes.status === 200 && orderRes.body.orders && orderRes.body.orders.length > 0) {
      mockOrderId = orderRes.body.orders[0]._id;
    } else {
      // Create a mock ObjectId format to proceed
      mockOrderId = '60c72b2f9b1d8a23a4f8b91c';
    }
    info(`Artwork context found: ${mockArtworkId}`);
    info(`Order context found: ${mockOrderId}`);
  } else {
    // Standard mock ObjectId values fallback
    mockArtworkId = '60c72b2f9b1d8a23a4f8b91a';
    mockOrderId = '60c72b2f9b1d8a23a4f8b91c';
    info(`No database listings found. Proceeding with fallback IDs.`);
  }

  // ── 6. Submit Review ──────────────────────────────────────────────────────
  head('6. Testing Order Reviews (POST /api/me/reviews)');
  const reviewRes = await request('POST', '/api/me/reviews', {
    body: {
      artworkId: mockArtworkId,
      orderId: mockOrderId,
      rating: 5,
      comment: 'Absolutely spectacular composition. The frame and colors match my gallery walls beautifully!'
    },
    cookieJar: buyerJar
  });

  if (reviewRes.status === 201 || reviewRes.status === 200) {
    pass(`Review submitted successfully!`);
    info(`Rating: ${reviewRes.body.review.rating} Stars — Comment: "${reviewRes.body.review.comment}"`);
  } else {
    fail(JSON.stringify(reviewRes.body));
  }

  // ── 7. Get Submitted Reviews ──────────────────────────────────────────────
  head('7. Fetching Reviews Feed (GET /api/me/reviews)');
  const revFeed = await request('GET', '/api/me/reviews', { cookieJar: buyerJar });
  if (revFeed.status === 200) {
    pass(`Reviews fetched: ${revFeed.body.reviews.length}`);
    revFeed.body.reviews.forEach((r, i) => console.log(`     [${i + 1}] Artwork: ${r.artworkId?.title || r.artworkId} — "${r.comment}"`));
  } else {
    fail(JSON.stringify(revFeed.body));
  }

  // ── 8. Notifications / System Alerts ──────────────────────────────────────
  head('8. Fetching Alerts & Notifications (GET /api/me/notifications)');
  const alertsRes = await request('GET', '/api/me/notifications', { cookieJar: buyerJar });
  if (alertsRes.status === 200) {
    pass(`Notifications fetched: ${alertsRes.body.notifications.length}`);
    if (alertsRes.body.notifications.length > 0) {
      notificationId = alertsRes.body.notifications[0]._id;
      info(`Found alert: "${alertsRes.body.notifications[0].title}"`);
    }
  } else {
    fail(JSON.stringify(alertsRes.body));
  }

  // ── 9. Mark Notification as Read ──────────────────────────────────────────
  if (notificationId) {
    head('9. Updating Alert Status (PATCH /api/me/notifications/:id/read)');
    const readRes = await request('PATCH', `/api/me/notifications/${notificationId}/read`, { cookieJar: buyerJar });
    if (readRes.status === 200) {
      pass(`Marked as read: ${readRes.body.notification.read}`);
    } else {
      fail(JSON.stringify(readRes.body));
    }
  }

  // ── 10. Clean up test Address ─────────────────────────────────────────────
  if (addressId) {
    head('10. Testing Address Deletion (DELETE /api/me/addresses/:id)');
    const delAddr = await request('DELETE', `/api/me/addresses/${addressId}`, { cookieJar: buyerJar });
    if (delAddr.status === 200) {
      pass(`Address deleted. Current count: ${delAddr.body.addresses.length}`);
    } else {
      fail(JSON.stringify(delAddr.body));
    }
  }

  // ── 11. Clean up test Payment Card ────────────────────────────────────────
  if (paymentId) {
    head('11. Testing Payment method Deletion (DELETE /api/me/payments/:id)');
    const delPay = await request('DELETE', `/api/me/payments/${paymentId}`, { cookieJar: buyerJar });
    if (delPay.status === 200) {
      pass(`Payment method unlinked. Current count: ${delPay.body.paymentMethods.length}`);
    } else {
      fail(JSON.stringify(delPay.body));
    }
  }

  console.log();
  sep();
  console.log('  🛍️  Buyer Profile Test Suite COMPLETE');
  sep();
}

run().catch((err) => { console.error('\n💥 Crashed:', err); process.exit(1); });
