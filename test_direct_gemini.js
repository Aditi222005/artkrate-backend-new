require('dotenv').config();
const axios = require('axios');

async function callGemini(contents) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await axios.post(url, { contents }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  });

  if (response.data && response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content && response.data.candidates[0].content.parts && response.data.candidates[0].content.parts[0]) {
    return response.data.candidates[0].content.parts[0].text;
  }
  throw new Error("Invalid response from Gemini API");
}

async function runTest() {
  console.log("Testing direct Gemini API call...");
  console.log("Using API Key:", process.env.GEMINI_API_KEY ? "Configured (starts with " + process.env.GEMINI_API_KEY.slice(0, 8) + ")" : "NOT CONFIGURED");

  try {
    const contents = [{ parts: [{ text: "Hello, what models are you? Answer in 1 short sentence." }] }];
    const reply = await callGemini(contents);
    console.log("Success! Gemini response:\n", reply);
  } catch (error) {
    console.error("Test failed:", error.message);
    if (error.response) {
      console.error("API error response details:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

runTest();
