// Private ticket storage. Pages and tests depend on the small `Storage` interface; Lambda uses S3.
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * @typedef {object} Storage
 * @property {(o: { key: string, contentType: string, size: number }) => Promise<string>} presignPut
 *   URL the browser PUTs the file to. Content type and length are signed, so the upload can't swap them.
 * @property {(o: { key: string, fileName: string, expiresIn: number }) => Promise<string>} presignGet
 * @property {(key: string) => Promise<{ bytes: Uint8Array, contentType: string | undefined }>} get
 * @property {(key: string) => Promise<void>} remove
 */

/** @param {{ bucket: string, client?: S3Client }} o @returns {Storage} */
export function createS3Storage({ bucket, client = new S3Client({}) }) {
  return {
    presignPut: ({ key, contentType, size }) =>
      getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: size }),
        {
          expiresIn: 300,
          signableHeaders: new Set(['content-type', 'content-length']),
        },
      ),
    presignGet: ({ key, fileName, expiresIn }) =>
      getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `inline; filename="${fileName.replace(/[^\w.-]/g, '_')}"`,
        }),
        { expiresIn },
      ),
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return { bytes: await /** @type {any} */ (res.Body).transformToByteArray(), contentType: res.ContentType };
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}
