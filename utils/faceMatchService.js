/**
 * utils/faceMatchService.js
 * Face-similarity using face-api.js with the Canvas shim.
 *
 * Requirements are loaded lazily to prevent crashing the server if packages are missing.
 * Install requirements:
 *   npm install @vladmandic/face-api canvas
 */

const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const AI_SERVER_URL = process.env.AI_SERVER_URL || 'http://localhost:3000';

let canvas = null;
let faceapi = null;
let modulesLoaded = false;
let modelsLoaded = false;

const MODELS_PATH = path.join(__dirname, '..', 'face-api-models');

/**
 * Lazily load modules and patch face-api
 */
const loadModules = () => {
  if (modulesLoaded) return true;
  try {
    canvas = require('canvas');
    faceapi = require('@vladmandic/face-api');
    
    // Patch face-api to use the node canvas environment
    const { Canvas, Image, ImageData } = canvas;
    faceapi.env.monkeyPatch({ Canvas, Image, ImageData });
    
    modulesLoaded = true;
    console.log('✅ face-api.js and canvas modules loaded successfully');
    return true;
  } catch (err) {
    console.warn('⚠️  face-api.js or canvas modules could not be loaded. Face recognition will be skipped.', err.message);
    return false;
  }
};

/**
 * Load models once — called lazily on first use.
 */
const loadModels = async () => {
  if (modelsLoaded) return;
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromDisk(MODELS_PATH),
    faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH),
    faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH),
  ]);
  modelsLoaded = true;
  console.log('✅ face-api models loaded');
};

/**
 * Load a Buffer into a canvas Image.
 * @param {Buffer} buf
 * @returns {Promise<Image>}
 */
const bufferToImage = (buf) =>
  new Promise((resolve, reject) => {
    const { Image } = canvas;
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = buf;
  });

const getDescriptor = async (imgBuffer) => {
  const img = await bufferToImage(imgBuffer);
  const detection = await faceapi
    .detectSingleFace(img)
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection ? detection.descriptor : null;
};

/**
 * Euclidean distance → similarity percentage (0–100) + confidence level.
 */
const distanceToScore = (distance) => {
  const score = Math.round(Math.max(0, (1 - distance / 0.6)) * 100);

  let level;
  if (distance < 0.4) level = 'high';
  else if (distance < 0.5) level = 'medium';
  else level = 'low';

  return { score, level };
};

/**
 * Compare two image Buffers (selfie vs document photo).
 *
 * @param {Buffer} selfieBuffer
 * @param {Buffer} documentBuffer
 * @returns {Promise<{
 *   score:    number,
 *   level:    'high'|'medium'|'low',
 *   matched:  boolean,
 *   distance: number,
 *   skipped?: boolean,
 *   error?:   string
 * }>}
 */
const callGeminiCompareFaces = async (selfieBuffer, documentBuffer) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const prompt =
    "You are an expert biometric verification system.\n" +
    "Analyze the two provided images:\n" +
    "1. The first image is a selfie of the seller.\n" +
    "2. The second image is a photo from their government-issued identity document.\n\n" +
    "Perform the following checks:\n" +
    "1. Check if a human face is clearly present in both images.\n" +
    "2. Compare the facial features in both images to determine if they belong to the same person.\n" +
    "3. Calculate a similarity score between 0 and 100 based on facial structures (ignore age differences, facial hair, glasses, hairstyles, lighting, and photo quality/graininess).\n" +
    "4. Determine the confidence level of the comparison: 'high', 'medium', or 'low'.\n" +
    "5. Provide a brief remark/reason for your decision.\n\n" +
    "You must respond ONLY with a valid JSON object. Do not include any markdown formatting or backticks.\n" +
    "JSON format:\n" +
    "{\n" +
    "  \"face1_present\": true,\n" +
    "  \"face2_present\": true,\n" +
    "  \"matched\": true,\n" +
    "  \"score\": 85,\n" +
    "  \"level\": \"high\",\n" +
    "  \"remarks\": \"description of match details\"\n" +
    "}";

  const contents = [{
    parts: [
      { text: prompt },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: selfieBuffer.toString('base64')
        }
      },
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: documentBuffer.toString('base64')
        }
      }
    ]
  }];

  const response = await axios.post(url, { contents }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
  });

  if (response.data && response.data.candidates && response.data.candidates[0] && response.data.candidates[0].content && response.data.candidates[0].content.parts && response.data.candidates[0].content.parts[0]) {
    let textResponse = response.data.candidates[0].content.parts[0].text.trim();
    if (textResponse.startsWith("```")) {
      const lines = textResponse.split('\n');
      if (lines[0].startsWith("```json") || lines[0].startsWith("```")) {
        textResponse = lines.slice(1, -1).join('\n').trim();
      }
    }
    return JSON.parse(textResponse);
  }
  throw new Error("Invalid response from Gemini API");
};

/**
 * Compare two image Buffers (selfie vs document photo).
 *
 * @param {Buffer} selfieBuffer
 * @param {Buffer} documentBuffer
 * @returns {Promise<{
 *   score:    number,
 *   level:    'high'|'medium'|'low',
 *   matched:  boolean,
 *   distance: number,
 *   skipped?: boolean,
 *   error?:   string
 * }>}
 */
const compareFaces = async (selfieBuffer, documentBuffer) => {
  // ── Try calling the Python AI Service on Railway ──────────
  try {
    console.log(`🔄 Proxying Face Similarity to Python AI Server: ${AI_SERVER_URL}/api/compare-faces`);
    
    const form = new FormData();
    form.append('selfie', selfieBuffer, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
    form.append('document', documentBuffer, { filename: 'document.jpg', contentType: 'image/jpeg' });

    const response = await axios.post(`${AI_SERVER_URL}/api/compare-faces`, form, {
      headers: form.getHeaders(),
      timeout: 30000
    });

    if (response.data && response.data.success) {
      const result = response.data;
      const score = result.score !== undefined ? result.score : 0;
      const level = result.level || "low";
      const matched = result.matched !== undefined ? result.matched : false;
      const remarks = result.remarks || "";

      console.log(`✅ Railway face match complete — score: ${score}/100, level: ${level}, remarks: ${remarks}`);
      return {
        score,
        level,
        matched,
        distance: matched ? 0.2 : 0.8, // placeholder distance compatible with database
        remarks,
        skipped: false,
      };
    }
    throw new Error((response.data && response.data.error) || "Failed match request");
  } catch (pyErr) {
    console.warn(`⚠️ Railway Face Match failed (${pyErr.message}). Falling back to local face-api.js...`);
  }

  // ── Fallback: Local face-api.js ───────────────────────────────────────────
  try {
    const ok = loadModules();
    if (!ok) {
      return { score: 0, level: 'low', matched: false, distance: 1, skipped: true };
    }

    await loadModels();

    const [selfieDesc, docDesc] = await Promise.all([
      getDescriptor(selfieBuffer),
      getDescriptor(documentBuffer),
    ]);

    if (!selfieDesc) return { score: 0, level: 'low', matched: false, distance: 1, error: 'No face detected in selfie' };
    if (!docDesc) return { score: 0, level: 'low', matched: false, distance: 1, error: 'No face detected in document photo' };

    const distance = faceapi.euclideanDistance(selfieDesc, docDesc);
    const { score, level } = distanceToScore(distance);

    const matched = distance < 0.5;

    console.log(`🔍 Face match — distance: ${distance.toFixed(4)}, score: ${score}/100, level: ${level}`);

    return { score, level, matched, distance: parseFloat(distance.toFixed(4)), skipped: false };
  } catch (err) {
    console.error('Face match error:', err.message);
    return { score: 0, level: 'low', matched: false, distance: 1, error: err.message };
  }
};

module.exports = { compareFaces };
