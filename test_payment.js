const axios = require('axios');
const mongoose = require('mongoose');

const BASE_URL = 'http://localhost:4000/api';

const runTests = async () => {
  console.log('🚀 Starting Payment API Integration Tests...');

  let buyerCookie = '';
  
  // 1. Authenticate the test buyer
  try {
    console.log('\n🔐 1. Authenticating testbuyer@pixora.com...');
    const loginRes = await axios.post(`${BASE_URL}/login`, {
      email: 'testbuyer@pixora.com',
      password: 'buyer123'
    });
    
    // Save cookies
    buyerCookie = loginRes.headers['set-cookie'];
    console.log('✅ Authentication successful! Cookie received.');
  } catch (err) {
    console.error('❌ Authentication failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 2. Fetch Razorpay key ID
  try {
    console.log('\n🔑 2. Fetching Razorpay Key ID...');
    const keyRes = await axios.get(`${BASE_URL}/payment/key`, {
      headers: { Cookie: buyerCookie }
    });
    console.log('✅ Fetch Key ID Response:', keyRes.data);
    if (!keyRes.data.keyId) {
      throw new Error('keyId is missing from response');
    }
  } catch (err) {
    console.error('❌ Fetch Key ID failed:', err.response?.data || err.message);
    process.exit(1);
  }

  // 3. Create a Razorpay Order
  const artworkId = '6a286f5e10b01f78a816b198'; // Ethereal Harmony
  try {
    console.log(`\n📦 3. Creating Razorpay Order for artwork ID ${artworkId}...`);
    const orderRes = await axios.post(`${BASE_URL}/payment/create-order`, {
      cartItems: [artworkId]
    }, {
      headers: { Cookie: buyerCookie }
    });
    
    console.log('✅ Create Order Response:', {
      orderId: orderRes.data.orderId,
      amount: orderRes.data.amount,
      currency: orderRes.data.currency,
      artworks: orderRes.data.artworks
    });

    if (!orderRes.data.orderId || !orderRes.data.amount) {
      throw new Error('orderId or amount is missing from response');
    }
  } catch (err) {
    console.error('❌ Create Order failed:', JSON.stringify(err.response?.data, null, 2) || err.message);
    process.exit(1);
  }

  // 4. Test Signature Verification (Negative Test)
  try {
    console.log('\n🛡️ 4. Testing Signature Verification with invalid signature (Expected Failure)...');
    await axios.post(`${BASE_URL}/payment/verify`, {
      razorpay_order_id: 'order_fake123',
      razorpay_payment_id: 'pay_fake123',
      razorpay_signature: 'invalid_signature_mock',
      cartItems: [artworkId]
    }, {
      headers: { Cookie: buyerCookie }
    });
    console.error('❌ Error: Expected verification to fail, but it succeeded.');
    process.exit(1);
  } catch (err) {
    if (err.response && err.response.status === 400) {
      console.log('✅ Signature Verification rejected invalid signature as expected:', err.response.data.message);
    } else {
      console.error('❌ Error: Unexpected response:', err.response?.status, err.response?.data || err.message);
      process.exit(1);
    }
  }

  console.log('\n🎉 All Payment API Integration Tests completed successfully!');
};

runTests();
