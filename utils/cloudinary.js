const { v2: cloudinary } = require('cloudinary');
const dotenv = require('dotenv');
dotenv.config();

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('❌  Cloudinary credentials missing in .env — uploads will fail.');
} else {
  console.log(`✅  Cloudinary configured for cloud: ${CLOUDINARY_CLOUD_NAME}`);
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
