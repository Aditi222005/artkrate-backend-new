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
const compareFaces = async (selfieBuffer, documentBuffer) => {
  // ── Try calling the Python face match service first (Gemini 1.5 Flash) ─────
  try {
    const form = new FormData();
    form.append('selfie', selfieBuffer, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
    form.append('document', documentBuffer, { filename: 'document.jpg', contentType: 'image/jpeg' });

    console.log('🔄 Calling Python Face Match Service (Gemini 1.5 Flash)...');
    const response = await axios.post('http://localhost:3000/api/compare-faces', form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      timeout: 25000, // 25s timeout
    });

    if (response.data && response.data.success) {
      const { score, level, matched, remarks } = response.data;
      console.log(`✅ Python face match complete — score: ${score}/100, level: ${level}, remarks: ${remarks}`);
      return {
        score,
        level,
        matched,
        distance: matched ? 0.2 : 0.8, // placeholder distance compatible with database
        remarks,
        skipped: false,
      };
    } else {
      console.warn('⚠️ Python Face Match Service returned success: false. Falling back to local face-api.js...');
    }
  } catch (pyErr) {
    console.warn(`⚠️ Python Face Match Service failed (${pyErr.message}). Falling back to local face-api.js...`);
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
