import {
  CURRENT_VERSION,
  DATA_GRANULARITY,
  DATA_MASK,
  INDEX_1_OFFSET,
  INDEX_2_MASK,
  INDEX_SHIFT,
  LSCP_INDEX_2_OFFSET,
  OMITTED_BMP_INDEX_1_LENGTH,
  PREFIX_LENGTH,
  SHIFT_1,
  SHIFT_2,
} from './constants.js';
import {gunzipSync} from '../fflate/esm/browser.js';
import {swap32LE} from './swap.js';

const DECODER = new TextDecoder();

/**
 * @typedef {object} TrieValues
 * @prop {Int32Array} data
 * @prop {number} highStart
 * @prop {number} errorValue
 * @prop {string[]} [values]
 */

export class UnicodeTrie {
  /**
   * Creates a trie, either from compressed data or pre-parsed values.
   *
   * @param {Uint8Array|TrieValues} data
   */
  constructor(data) {
    if (data instanceof Uint8Array) {
      // Read binary format
      let uncompressedLength = 0;
      const view = new DataView(data.buffer);
      this.highStart = view.getUint32(0, true);
      this.errorValue = view.getUint32(4, true);
      uncompressedLength = view.getUint32(8, true);
      if (uncompressedLength !== CURRENT_VERSION) {
        throw new Error('Trie created with old version of @cto.af/unicode-trie.');
      }
      uncompressedLength = view.getUint32(12, true);
      if (PREFIX_LENGTH + uncompressedLength > data.byteLength) {
        throw new RangeError('Invalid input length');
      }

      // Don't swap UTF8-encoded text.
      const values = data.subarray(PREFIX_LENGTH + uncompressedLength);

      /**
       * @type{string[]}
       */
      this.values = values.length ?
        JSON.parse(DECODER.decode(gunzipSync(values))) :
        [];

      // Inflate the actual trie data
      data = gunzipSync(data.subarray(
        PREFIX_LENGTH,
        PREFIX_LENGTH + uncompressedLength
      ));

      // Swap bytes from little-endian
      swap32LE(data);

      /**
       * @type {Int32Array}
       */
      this.data = new Int32Array(data.buffer);
    } else {
      // Pre-parsed data
      ({
        data: this.data,
        highStart: this.highStart,
        errorValue: this.errorValue,
        values: this.values = [],
      } = data);
    }
  }

  /**
   * Creates a trie from a base64-encoded string.
   * @param {string} base64 The base64-encoded trie to initialize.
   * @returns {UnicodeTrie} The decoded Unicode trie.
   */
  static fromBase64(base64) {
    // This use of Buffer is ok unless we're using Parcel or some other
    // packer that polyfills automatically.
    if (typeof Buffer === 'function') {
      return new UnicodeTrie(new Uint8Array(Buffer.from(base64, 'base64')));
    }
    return new UnicodeTrie(new Uint8Array(atob(base64)
      .split('')
      .map(c => c.charCodeAt(0))));
  }

  /**
   * Get the value associated with a codepoint, or the default value, or the
   * error value if codePoint is out of range.
   *
   * @param {number} codePoint
   * @returns {number}
   */
  get(codePoint) {
    let val = this.errorValue;
    if ((codePoint < 0) || (codePoint > 0x10ffff)) {
      val = this.errorValue;
    } else if (
      (codePoint < 0xd800) || ((codePoint > 0xdbff) && (codePoint <= 0xffff))
    ) {
      // Ordinary BMP code point, excluding leading surrogates.
      // BMP uses a single level lookup.  BMP index starts at offset 0 in the
      // index. data is stored in the index array itself.
      const index = (this.data[codePoint >> SHIFT_2] << INDEX_SHIFT) +
        (codePoint & DATA_MASK);
      val = this.data[index];
    } else if (codePoint <= 0xffff) {
      // Lead Surrogate Code Point.  A Separate index section is stored for
      // lead surrogate code units and code points.
      //   The main index has the code unit data.
      //   For this function, we need the code point data.
      const index = (
        this.data[LSCP_INDEX_2_OFFSET + ((codePoint - 0xd800) >> SHIFT_2)] <<
          INDEX_SHIFT
      ) + (codePoint & DATA_MASK);
      val = this.data[index];
    } else if (codePoint < this.highStart) {
      // Supplemental code point, use two-level lookup.
      let index = this.data[
        (INDEX_1_OFFSET - OMITTED_BMP_INDEX_1_LENGTH) + (codePoint >> SHIFT_1)
      ];
      index = this.data[index + ((codePoint >> SHIFT_2) & INDEX_2_MASK)];
      index = (index << INDEX_SHIFT) + (codePoint & DATA_MASK);
      val = this.data[index];
    } else {
      val = this.data[this.data.length - DATA_GRANULARITY];
    }

    return val;
  }

  /**
   * Get the value associated with the codePoint, stringified if possible.
   *
   * @param {number} codePoint
   * @returns {number|string}
   */
  getString(codePoint) {
    const val = this.get(codePoint);
    return this.values[val] ?? val;
  }
}
