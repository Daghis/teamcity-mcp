import type { InternalAxiosRequestConfig } from 'axios';

const XML_MEDIA_TYPE = /^application\/xml\s*(;|$)/i;

/**
 * Whether axios's default request transform will JSON-serialize this body. It does that for any
 * object (plain or class instance) except binary payloads, streams, blobs, form data and URL
 * search params, which it sends as-is or encodes differently; strings are never touched.
 */
function isJsonSerializedBody(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return false;
  if (
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data) ||
    data instanceof Blob ||
    data instanceof FormData ||
    data instanceof URLSearchParams ||
    data instanceof ReadableStream
  ) {
    return false;
  }
  // axios treats anything with a pipe() method as a Node stream.
  return typeof (data as { pipe?: unknown }).pipe !== 'function';
}

/**
 * Request interceptor that corrects the Content-Type of JSON bodies mislabelled as XML.
 *
 * Many generated TeamCity client methods hard-code `Content-Type: application/xml`, but they
 * pass object bodies through unchanged and axios then serializes them as JSON. TeamCity parses
 * the body according to the declared type and rejects the mismatch with a 400
 * (`javax.xml.bind.UnmarshalException`). Callers that really send XML pass a string body, which
 * this leaves untouched.
 */
export function labelJsonBodies(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const contentType = config.headers.getContentType();
  if (
    typeof contentType === 'string' &&
    XML_MEDIA_TYPE.test(contentType) &&
    isJsonSerializedBody(config.data)
  ) {
    config.headers.setContentType('application/json');
  }
  return config;
}
