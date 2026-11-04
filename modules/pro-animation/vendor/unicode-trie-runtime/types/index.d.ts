/**
 * @typedef {object} TrieValues
 * @prop {Int32Array} data
 * @prop {number} highStart
 * @prop {number} errorValue
 * @prop {string[]} [values]
 */
export class UnicodeTrie {
    /**
     * Creates a trie from a base64-encoded string.
     * @param {string} base64 The base64-encoded trie to initialize.
     * @returns {UnicodeTrie} The decoded Unicode trie.
     */
    static fromBase64(base64: string): UnicodeTrie;
    /**
     * Creates a trie, either from compressed data or pre-parsed values.
     *
     * @param {Uint8Array|TrieValues} data
     */
    constructor(data: Uint8Array | TrieValues);
    highStart: number;
    errorValue: number;
    /**
     * @type{string[]}
     */
    values: string[];
    /**
     * @type {Int32Array}
     */
    data: Int32Array;
    /**
     * Get the value associated with a codepoint, or the default value, or the
     * error value if codePoint is out of range.
     *
     * @param {number} codePoint
     * @returns {number}
     */
    get(codePoint: number): number;
    /**
     * Get the value associated with the codePoint, stringified if possible.
     *
     * @param {number} codePoint
     * @returns {number|string}
     */
    getString(codePoint: number): number | string;
}
export type TrieValues = {
    data: Int32Array;
    highStart: number;
    errorValue: number;
    values?: string[] | undefined;
};
