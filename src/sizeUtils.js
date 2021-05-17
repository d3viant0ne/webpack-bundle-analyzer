const zlib = require('zlib');

const COMPRESSED_SIZE = {
  gzip: gzipSize,
  brotli: brotliSize
};

export function getCompressedSize(compressionAlgorithm, input) {
  const fn = COMPRESSED_SIZE[compressionAlgorithm];
  if (!fn) throw new Error(`Unsupported compression algorithm: ${compressionAlgorithm}.`);
  return fn(input);
}

function gzipSize(input) {
  return zlib.gzipSync(input, {level: 9}).length;
}

function brotliSize(input) {
  if (typeof zlib.brotliCompressSync !== 'function') {
    throw new Error('Brotli compression requires Node.js v10.16.0 or higher.');
  }

  return zlib.brotliCompressSync(input).length;
}
