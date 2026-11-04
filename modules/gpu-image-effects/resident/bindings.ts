import type {PluginInit} from '../../../src/plugins/sdk.ts';
import {createImageProcessor} from './processor.ts';
export function initialize(init:PluginInit){const p=createImageProcessor(init);return {exports:{processImage:p.process,imageStats:p.stats},dispose:p.dispose};}
