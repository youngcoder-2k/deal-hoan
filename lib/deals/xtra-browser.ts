import serverChromium from '@sparticuz/chromium';
import { chromium } from 'playwright-core';

/** Chromium runs inside Vercel's Node function, not Supabase Edge or Browserless. */
export async function launchXtraBrowser() {
  const hosted = process.env.VERCEL === '1';
  if (hosted && process.platform !== 'linux') throw Error('unsupported_runtime');
  return chromium.launch({
    ...(hosted ? { args: serverChromium.args, executablePath: await serverChromium.executablePath() } : {}),
    headless: true,
    timeout: 20000,
  });
}
