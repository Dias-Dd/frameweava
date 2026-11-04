// Generated from effect.json. Do not edit; run node module.mjs types.
import {defineEffect,type ManifestParameters,type PluginManifestV2} from '@frameweave/engine/plugins';
export const manifest={
  "schemaVersion": 1,
  "apiVersion": 1,
  "parameterSchemaVersion": 2,
  "id": "kit.statistics",
  "name": "kit.statistics",
  "version": "1.0.0",
  "kind": "generator",
  "engine": "web",
  "compatible": "^0.1.0",
  "entry": "./index.ts",
  "description": "Rust numeric statistics fixture for module toolchain validation",
  "parameters": {
    "settings": {
      "type": "object",
      "default": {},
      "properties": {
        "gain": {
          "type": "number",
          "default": 1,
          "minimum": 0,
          "maximum": 4
        },
        "samples": {
          "type": "array",
          "default": [
            1,
            2,
            3,
            4
          ],
          "items": {
            "type": "number",
            "minimum": -1000,
            "maximum": 1000
          },
          "minItems": 1,
          "maxItems": 256
        }
      },
      "additionalProperties": false
    }
  },
  "inputs": {},
  "outputs": {
    "image": "image",
    "stats": "json"
  },
  "resources": {
    "moduleWasm": {
      "src": "./dist/module.wasm",
      "kind": "file"
    },
    "moduleGlue": {
      "src": "./runtime/session.mjs",
      "kind": "file"
    },
    "moduleWorker": {
      "src": "./dist/worker.js",
      "kind": "file"
    }
  }
} as const satisfies PluginManifestV2;
export type Parameters=ManifestParameters<typeof manifest>;
export const use=defineEffect(manifest).use;
