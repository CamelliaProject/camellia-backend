import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function uploadImage(fileBuffer) {
  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'auto' },
        (error, uploadResult) => {
          if (error) {
            return reject(error);
          }

          if (!uploadResult || !uploadResult.secure_url) {
            return reject(new Error('Cloudinary upload did not return a secure URL.'));
          }

          resolve(uploadResult);
        }
      );

      uploadStream.end(fileBuffer);
    });

    return result.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}
