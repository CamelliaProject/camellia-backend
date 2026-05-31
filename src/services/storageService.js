import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function uploadFile(fileBuffer, { folder = 'camellia', resourceType = 'auto' } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url) return reject(new Error('Cloudinary did not return a secure URL.'));
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
}

// Backward-compatible alias used by other controllers
export async function uploadImage(fileBuffer) {
  return uploadFile(fileBuffer, { folder: 'camellia/plantations', resourceType: 'image' });
}
