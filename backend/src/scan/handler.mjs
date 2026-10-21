// Ticket-scan Lambda. Two ways in, chosen by the stack's `malwareScan` setting (infra/stack.mjs):
//   - off: S3 ObjectCreated (tickets/) -> SQS -> here (SQS event)
//   - on:  GuardDuty Malware Protection for S3 scans first; its result arrives via EventBridge -> here
import { scanUpload } from './scan.mjs';
import { dbFromEnv } from '../db.mjs';
import { createS3Storage } from '../s3.mjs';

/** @type {{ db: import('../db.mjs').Db, storage: import('../s3.mjs').Storage } | null} */
let deps = null;
const getDeps = () =>
  (deps ??= { db: dbFromEnv(), storage: createS3Storage({ bucket: /** @type {string} */ (process.env.BUCKET) }) });

/** @param {any} event */
export const handler = async (event) => {
  // EventBridge: "GuardDuty Malware Protection Object Scan Result"
  if (event.source === 'aws.guardduty') {
    const key = event.detail?.s3ObjectDetails?.objectKey;
    const status = event.detail?.scanResultDetails?.scanResultStatus;
    if (!key?.startsWith('tickets/')) return;
    const malware = status === 'THREATS_FOUND' ? 'infected' : status === 'NO_THREATS_FOUND' ? 'clean' : 'unscanned';
    await scanUpload(getDeps(), key, { malware });
    return;
  }
  // SQS batch of S3 notifications. A failure throws, so SQS retries it and finally parks it in the dead-letter queue.
  /** @type {{ itemIdentifier: string }[]} */
  const batchItemFailures = [];
  for (const record of event.Records ?? []) {
    try {
      const body = JSON.parse(record.body);
      for (const r of body.Records ?? []) {
        const key = decodeURIComponent(String(r.s3?.object?.key ?? '').replace(/\+/g, ' '));
        if (key.startsWith('tickets/')) await scanUpload(getDeps(), key);
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          msg: 'scan failed',
          messageId: record.messageId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
