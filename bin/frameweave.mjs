#!/usr/bin/env node
// No global TS runner, source checkout, browser launch or install-time download.
import {runCLI} from '../lib/cli-entry.js';
await runCLI(process.argv.slice(2));
