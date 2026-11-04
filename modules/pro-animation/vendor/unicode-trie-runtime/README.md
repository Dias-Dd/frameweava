# @cto.af/unicode-trie-runtime

A data structure for fast Unicode character metadata lookup, ported from ICU
This version was copied from https://github.com/foliojs/unicode-trie and
modernized slightly.

## Background

When implementing many Unicode algorithms such as text segmentation,
normalization, bidi processing, etc., fast access to character metadata
is crucial to good performance.  There over a million code points in the
Unicode standard, many of which produce the same result when looked up,
so an array or hash table is not appropriate - those data structures are
fast but would require a lot of memory.  The data is generally
grouped in ranges, so you could do a binary search, but that is not
fast enough for some applications.

The [International Components for Unicode](http://site.icu-project.org) (ICU) project
came up with a data structure based on a [Trie](http://en.wikipedia.org/wiki/Trie) that provides fast access
to Unicode metadata.  The range data is precompiled to a serialized
and flattened trie, which is then used at runtime to lookup the necessary
data.  According to my own tests, this is generally at least 50% faster
than binary search, with not too much additional memory required.

## Installation

    npm install @cto.af/unicode-trie-runtime

## Building a Trie

Use the `@cto.af/unicode-trie` package to build a trie module.

## Using a precompiled Trie

Once you've built a precompiled trie, you can load it into the
`UnicodeTrie` class, which is a readonly representation of the
trie.  From there, you can lookup values.

```js
import {UnicodeTrie} from '@cto.af/unicode-trie-runtime';
import fs from 'node:fs'

// load serialized trie from binary file
const data = fs.readFileSync('data.trie');
const trie = new UnicodeTrie(data);

// lookup a value
trie.get(0x4567); // => 99 or 'FOO' (if a string was stored)
```

## License

MIT

---
[![Tests](https://github.com/cto-af/unicode-trie/actions/workflows/node.js.yml/badge.svg)](https://github.com/cto-af/unicode-trie/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/cto-af/unicode-trie/branch/main/graph/badge.svg?token=JVBOYR3GWY)](https://codecov.io/gh/cto-af/unicode-trie)
