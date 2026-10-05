import os from 'node:os';
import { Config } from '@remotion/cli/config';

/**
 * Codec-agnostic render defaults (also used for audio-only and still renders).
 * H.264 settings (CRF, preset, BT.709 yuv420p) are passed by scripts/render.mjs.
 * Measured on a 4-core machine: frame cost is dominated by Chrome's 1080p capture,
 * so one tab per core is the sweet spot; SwiftShader GL ("swangle") was 3× slower.
 */
Config.setEntryPoint('src/index.ts');
Config.setConcurrency(Math.max(1, Math.min(8, os.cpus().length)));
// Use the GPU through ANGLE on macOS; elsewhere let Chrome pick (no forced software GL).
if (os.platform() === 'darwin') Config.setChromiumOpenGlRenderer('angle');
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(92);
// Use a local Chrome/Chromium instead of downloading one, e.g. in CI or sandboxes.
Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE || null);
