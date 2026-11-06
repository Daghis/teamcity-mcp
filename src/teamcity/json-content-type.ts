import type { InternalAxiosRequestConfig } from 'axios';

const XML_MEDIA_TYPE = /^application\/xml\s*(;|$)/i;

/**
 * Bodies axios serializes to JSON. Strings, binary payloads, streams and form data are sent
 * as-is, so their declared Content-Type is left alone.
 */
function isJsonSerializedBody(data: unknown): boolean {
  if (data === null || typeof data !== 'object') return false;
  if (Array.isArray(data)) return true;
  const proto: unknown = Object.getPrototypeOf(data);
  return proto === Object.prototype || proto === null;
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
