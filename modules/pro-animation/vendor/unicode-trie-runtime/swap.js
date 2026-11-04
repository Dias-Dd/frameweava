const isBigEndian =
  (new Uint8Array(new Uint32Array([0x12345678]).buffer)[0] === 0x12);

/**
 * Exported for testing
 * @param {Uint8Array} array
 * @private
 */
export function swap32(array) {
  const len = array.length;
  for (let i = 0; i < len; i += 4) {
    [array[i], array[i + 1], array[i + 2], array[i + 3]] =
      [array[i + 3], array[i + 2], array[i + 1], array[i]];
  }
}

/**
 * No-op.
 *
 * @param {Uint8Array} _array Ingored
 * @private
 */
function noOp(_array) {
  // Intentionally empty
}

export const swap32LE = isBigEndian ? swap32 : noOp;
