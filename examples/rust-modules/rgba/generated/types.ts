// Generated from effect.json. Do not edit; run node module.mjs types.
import {defineEffect,type ManifestParameters,type PluginManifestV2} from '@frameweave/engine/plugins';
export const manifest={
  "schemaVersion": 1,
  "apiVersion": 1,
  "parameterSchemaVersion": 2,
  "id": "kit.rgba",
  "name": "kit.rgba",
  "version": "1.0.0",
  "kind": "image-effect",
  "engine": "web",
  "compatible": "^0.1.0",
  "entry": "./index.ts",
  "description": "Rust RGBA channel transform fixture for module resource and export validation",
  "parameters": {
    "settings": {
      "type": "object",
      "default": {},
      "properties": {
        "gain": {
          "type": "number",
          "default": 1,
          "minimum": 0,
          "maximum": 2
        },
        "channels": {
          "type": "array",
          "default": [
            1,
            1,
            1
          ],
          "items": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "integer": true
          },
          "minItems": 3,
          "maxItems": 3
        }
      },
      "additionalProperties": false
    }
  },
  "inputs": {
    "image": "image"
  },
  "outputs": {
    "image": "image"
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
