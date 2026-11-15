import forge from 'node-forge';
import {
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
} from 'pdf-lib';

const PDF_PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function padPassword(password: string): Uint8Array {
  const bytes = new TextEncoder().encode(password);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = i < bytes.length ? bytes[i] : PDF_PADDING[i - bytes.length];
  }
  return out;
}

function md5Bytes(chunks: Uint8Array[]): Uint8Array {
  const md = forge.md.md5.create();
  for (const chunk of chunks) {
    let str = '';
    for (let i = 0; i < chunk.length; i++) str += String.fromCharCode(chunk[i]);
    md.update(str, 'raw');
  }
  const digest = md.digest().getBytes();
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = digest.charCodeAt(i);
  return out;
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
  }
  const out = new Uint8Array(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + S[i]) & 0xff;
    const tmp = S[i];
    S[i] = S[j];
    S[j] = tmp;
    out[k] = data[k] ^ S[(S[i] + S[j]) & 0xff];
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function computeOwnerKey(ownerPwd: string, userPwd: string): Uint8Array {
  let hash = md5Bytes([padPassword(ownerPwd || userPwd)]);
  for (let i = 0; i < 50; i++) {
    hash = md5Bytes([hash]);
  }
  let enc = rc4(hash, padPassword(userPwd));
  for (let i = 1; i <= 19; i++) {
    const xorKey = new Uint8Array(16);
    for (let k = 0; k < 16; k++) xorKey[k] = hash[k] ^ i;
    enc = rc4(xorKey, enc);
  }
  return enc;
}

function computeFileEncryptionKey(
  userPwd: string,
  ownerKey: Uint8Array,
  permissions: number,
  fileId: Uint8Array
): Uint8Array {
  const permBytes = new Uint8Array([
    permissions & 0xff,
    (permissions >> 8) & 0xff,
    (permissions >> 16) & 0xff,
    (permissions >> 24) & 0xff,
  ]);
  let hash = md5Bytes([padPassword(userPwd), ownerKey, permBytes, fileId]);
  for (let i = 0; i < 50; i++) {
    hash = md5Bytes([hash]);
  }
  return hash;
}

function computeUserKey(encKey: Uint8Array, fileId: Uint8Array): Uint8Array {
  const hash = md5Bytes([PDF_PADDING, fileId]);
  let enc = rc4(encKey, hash);
  for (let i = 1; i <= 19; i++) {
    const xorKey = new Uint8Array(16);
    for (let k = 0; k < 16; k++) xorKey[k] = encKey[k] ^ i;
    enc = rc4(xorKey, enc);
  }
  const out = new Uint8Array(32);
  out.set(enc, 0);
  // Pad remaining 16 bytes with deterministic bytes
  out.set(fileId.slice(0, 16), 16);
  return out;
}

function computeObjectKey(fileKey: Uint8Array, objNum: number, genNum: number): Uint8Array {
  const suffix = new Uint8Array([
    objNum & 0xff,
    (objNum >> 8) & 0xff,
    (objNum >> 16) & 0xff,
    genNum & 0xff,
    (genNum >> 8) & 0xff,
  ]);
  return md5Bytes([fileKey, suffix]);
}

function encryptObjectRecursively(
  obj: unknown,
  objKey: Uint8Array,
  context: PDFContext,
  encryptDictRef: PDFRef
): unknown {
  if (obj instanceof PDFRef) {
    return obj;
  }
  if (obj instanceof PDFString) {
    const raw = obj.asBytes();
    const enc = rc4(objKey, raw);
    return PDFHexString.of(toHex(enc));
  }
  if (obj instanceof PDFHexString) {
    const raw = obj.asBytes();
    const enc = rc4(objKey, raw);
    return PDFHexString.of(toHex(enc));
  }
  if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) {
      const item = obj.get(i);
      const replaced = encryptObjectRecursively(item, objKey, context, encryptDictRef);
      if (replaced !== item) {
        obj.set(i, replaced as never);
      }
    }
    return obj;
  }
  if (obj instanceof PDFDict) {
    const entries = obj.entries();
    for (const [key, val] of entries) {
      if (val instanceof PDFRef && val === encryptDictRef) continue;
      const replaced = encryptObjectRecursively(val, objKey, context, encryptDictRef);
      if (replaced !== val) {
        obj.set(key, replaced as never);
      }
    }
    return obj;
  }
  if (obj instanceof PDFRawStream) {
    encryptObjectRecursively(obj.dict, objKey, context, encryptDictRef);
    const encryptedBytes = rc4(objKey, obj.contents);
    return PDFRawStream.of(obj.dict, encryptedBytes);
  }
  if (obj instanceof PDFStream) {
    encryptObjectRecursively(obj.dict, objKey, context, encryptDictRef);
    const rawBytes = obj.getContents();
    const encryptedBytes = rc4(objKey, rawBytes);
    return PDFRawStream.of(obj.dict, encryptedBytes);
  }
  return obj;
}

/**
 * Encrypts a PDF byte array using ISO 32000-1 Standard Security Handler (Rev 3, 128-bit RC4).
 */
export async function encryptPdfBytes(
  pdfBytes: Uint8Array,
  userPassword: string,
  ownerPassword?: string
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const context = doc.context;

  // Generate 16-byte File ID
  const fileId = new Uint8Array(16);
  crypto.getRandomValues(fileId);
  const fileIdHex = toHex(fileId);

  // Permissions: allow printing & high-quality printing, disallow copying/modifying if desired (-3904 + 4 = -3900 or full -4)
  const permissions = -4; // All standard user permissions allowed once unlocked with user password
  const ownerKey = computeOwnerKey(ownerPassword || `${userPassword}_owner`, userPassword);
  const fileKey = computeFileEncryptionKey(userPassword, ownerKey, permissions, fileId);
  const userKey = computeUserKey(fileKey, fileId);

  const encryptDict = context.obj({
    Filter: PDFName.of('Standard'),
    V: PDFNumber.of(2),
    R: PDFNumber.of(3),
    Length: PDFNumber.of(128),
    P: PDFNumber.of(permissions),
    O: PDFHexString.of(toHex(ownerKey)),
    U: PDFHexString.of(toHex(userKey)),
  });
  const encryptRef = context.register(encryptDict);

  // Encrypt all indirect objects except the Encrypt dict itself
  const indirectObjects = context.enumerateIndirectObjects();
  for (const [ref, obj] of indirectObjects) {
    if (ref === encryptRef) continue;
    const objKey = computeObjectKey(fileKey, ref.objectNumber, ref.generationNumber);
    const encryptedObj = encryptObjectRecursively(obj, objKey, context, encryptRef);
    if (encryptedObj !== obj) {
      context.assign(ref, encryptedObj as never);
    }
  }

  // Set trailer ID and Encrypt reference
  const idArray = PDFArray.withContext(context);
  idArray.push(PDFHexString.of(fileIdHex));
  idArray.push(PDFHexString.of(fileIdHex));
  context.trailerInfo.ID = idArray;
  context.trailerInfo.Encrypt = encryptRef;

  return doc.save({ useObjectStreams: false });
}
