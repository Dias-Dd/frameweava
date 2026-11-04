// Generated from the existing P4 Schema v2.
import {defineEffect,type ManifestParameters,type PluginManifestV2} from '@frameweave/engine/plugins';
export const manifest={
  "schemaVersion": 1,
  "apiVersion": 1,
  "parameterSchemaVersion": 2,
  "id": "test.pa3-pathops",
  "name": "test.pa3-pathops",
  "version": "0.0.1",
  "kind": "generator",
  "engine": "web",
  "compatible": "^0.1.0",
  "entry": "./index.ts",
  "description": "wasm-bindgen UTF-8, f64 arrays, Result and reviewed JS callback fixture",
  "parameters": {
    "settings": {
      "type": "object",
      "default": {},
      "properties": {
        "label": {
          "type": "string",
          "default": "Frameweave",
          "maxLength": 128
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
            "minimum": 0,
            "maximum": 100
          },
          "minItems": 1,
          "maxItems": 128
        },
        "factor": {
          "type": "number",
          "default": 1,
          "minimum": 0,
          "maximum": 4
        }
      },
      "additionalProperties": false
    }
  },
  "inputs": {},
  "outputs": {
    "image": "image"
  },
  "resources": {
    "bindingBytes": {
      "src": "./dist/binding.mjs",
      "kind": "file"
    },
    "bytes": {
      "src": "./dist/generated/module_bg.wasm",
      "kind": "file"
    },
    "worker": {
      "src": "./dist/worker.js",
      "kind": "file"
    },
    "profile": {
      "src": "./dist/import-profile.json",
      "kind": "file"
    },
    "asset0": {
      "src": "./dist/generated/module.d.ts",
      "kind": "file"
    },
    "asset1": {
      "src": "./dist/generated/module.js",
      "kind": "file"
    },
    "asset2": {
      "src": "./dist/generated/module_bg.wasm",
      "kind": "file"
    },
    "asset3": {
      "src": "./dist/generated/module_bg.wasm.d.ts",
      "kind": "file"
    }
  }
} as const satisfies PluginManifestV2;
export type Parameters=ManifestParameters<typeof manifest>;
export const use=defineEffect(manifest).use;
