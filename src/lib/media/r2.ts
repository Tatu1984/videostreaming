// Cloudflare R2 media store (S3-compatible API via @aws-sdk/client-s3).
//
// R2 is the scale target: durable, effectively unlimited, ZERO egress fees, and
// frontable by a CDN — which is what makes 10k cameras / many viewers viable.
// It works on Vercel because the bytes live in R2, not on Vercel's ephemeral FS.
//
// Objects are keyed `<prefix>/<streamKey>/<file>`. Segments are written with a
// long immutable cache header so a CDN in front of R2 serves the fan-out and the
// origin stays cool; playlists are written no-cache.
//
// Env (see .env.example):
//   MEDIA_BACKEND=r2
//   R2_ACCOUNT_ID           Cloudflare account id
//   R2_ACCESS_KEY_ID        R2 API token access key
//   R2_SECRET_ACCESS_KEY    R2 API token secret
//   R2_BUCKET               bucket name
//   R2_PUBLIC_BASE          (optional) public/CDN base for reads, e.g.
//                           https://media.example.com  or the r2.dev bucket URL.
//                           If set, GET returns a redirect to the CDN (best for
//                           scale — the browser fetches segments straight from
//                           the CDN, never through this app). If unset, the app
//                           streams bytes back from R2 itself (works, less ideal).
//   R2_PREFIX               (optional) key prefix, default "hls".

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import type { MediaStore, GetResult, PutResult } from './store'
import { cacheControlFor, contentTypeFor } from './store'

// Hard per-request timeout for R2 calls. Without this, wrong credentials or an
// unreachable endpoint make the AWS SDK retry with backoff for a long time,
// which hangs the serverless function (the browser then sees a status-0 / no
// response). A short timeout + capped retries makes R2 problems fail FAST and
// visibly instead of hanging the whole /api/cameras request.
const R2_TIMEOUT_MS = Number(process.env.R2_TIMEOUT_MS || 4000)

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`R2 media store: missing env ${name}`)
  return v
}

export class R2Store implements MediaStore {
  readonly name = 'r2'
  private client: S3Client
  private bucket: string
  private prefix: string
  private publicBase: string

  constructor() {
    const accountId = env('R2_ACCOUNT_ID')
    this.bucket = env('R2_BUCKET')
    this.prefix = (process.env.R2_PREFIX || 'hls').replace(/\/+$/, '')
    this.publicBase = (process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '')
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env('R2_ACCESS_KEY_ID'),
        secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
      },
      // Fail fast on bad creds / unreachable R2 instead of hanging the request.
      maxAttempts: 2,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: R2_TIMEOUT_MS,
        requestTimeout: R2_TIMEOUT_MS,
      }),
    })
  }

  private objectKey(streamKey: string, file: string): string {
    return `${this.prefix}/${streamKey}/${file}`
  }

  async put(streamKey: string, file: string, body: Uint8Array): Promise<PutResult> {
    const { type, kind } = contentTypeFor(file)
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.objectKey(streamKey, file),
          Body: body,
          ContentType: type,
          CacheControl: cacheControlFor(kind),
        })
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'r2 put failed' }
    }
  }

  async get(streamKey: string, file: string): Promise<GetResult> {
    const { type } = contentTypeFor(file)
    // Preferred at scale: redirect the browser to the public/CDN URL so segment
    // bytes never flow through this serverless function.
    if (this.publicBase) {
      return {
        ok: true,
        contentType: type,
        redirectUrl: `${this.publicBase}/${this.objectKey(streamKey, file)}`,
      }
    }
    // Fallback: stream the object back through the app.
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(streamKey, file) })
      )
      const bytes = await res.Body!.transformToByteArray()
      return { ok: true, body: bytes, contentType: type }
    } catch {
      return { ok: false, error: 'not found' }
    }
  }

  async delete(streamKey: string, file: string): Promise<PutResult> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(streamKey, file) })
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'r2 delete failed' }
    }
  }
}
