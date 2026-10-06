import fs from 'fs';
import path from 'path';

const BASE_URL = 'https://qclay.design/lovable/glass-menu/';
const OUT_DIR = path.resolve('apps/frontend/public/assets');

const files = [
  'arrow-down.svg',
  'arrow-right.svg',
  'asterisk-button.svg',
  'asterisk-icon.svg',
  'asterisk-orange.svg',
  'avatar-man-1.png',
  'avatar-man-2.png',
  'avatar-man-bottom.png',
  'avatar-man-top.png',
  'avatar-woman-1.png',
  'avatar-woman-2.png',
  'avatar-woman-3.png',
  'card-light-overlay.png',
  'crypto-chart.svg',
  'cursor-full.svg',
  'cursor-magic.svg',
  'discord-button.svg',
  'discord-icon.svg',
  'feather-icon.svg',
  'gear-icon.svg',
  'github-icon.svg',
  'hero-background.png',
  'mail-icon.svg',
  'meta-icon.svg',
  'orbit-1.svg',
  'orbit-2.svg',
  'orbit-3.svg',
  'quick-actions-icon.svg',
  'reddit-icon.svg',
  's1-bottom-card-bg.png',
  's1-main-card-bg.png',
  's1-notification-badge.svg',
  's1-top-card-bg.png',
  's1-top-card-header.png',
  's1-top-card-light.png',
  's2-card-bg.png',
  's2-right-card-bg.png',
  's3-add-members-button.png',
  's3-card-bg.png',
  's3-card-light-overlay.png',
  's3-chandelier.svg',
  's3-chat-hello-friend.png',
  's3-chat-hello-kitty.png',
  's3-chat-hola.png',
  's3-cursor.png',
  's3-right-card-bg.png',
  's4-action-button-bg.png',
  's4-arrows-divider.svg',
  's4-avatar-left.png',
  's4-avatar-middle.png',
  's4-avatar-right.png',
  's4-card-bg.png',
  's4-desktop-icon.svg',
  's4-loader-spinner.png',
  's4-single-device.png',
  's4-stats-bar.png',
  'slack-button.svg',
  'slack-icon.svg',
  'step-indicator-s2.svg',
  'step-indicator-s3.svg',
  'web-loading-lines.svg',
  'widget-box-icon.svg',
  'zap-icon.svg',
  'Cursur.svg',
];

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function downloadFile(name) {
  const dest = path.join(OUT_DIR, name);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`[EXISTS] ${name}`);
    return true;
  }
  const url = BASE_URL + encodeURIComponent(name);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      console.warn(`[FAIL ${res.status}] ${name}`);
      return false;
    }
    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(arrayBuffer));
    console.log(`[OK] ${name} (${arrayBuffer.byteLength} bytes)`);
    return true;
  } catch (err) {
    console.error(`[ERR] ${name}: ${err.message}`);
    return false;
  }
}

async function run() {
  console.log(`Downloading missing assets into ${OUT_DIR}...`);
  const promises = files.map(file => downloadFile(file));
  const results = await Promise.all(promises);
  console.log(`Done. Success: ${results.filter(Boolean).length}/${files.length}`);
}

run();
