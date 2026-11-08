const { chromium } = require('./frontend-cv/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const CLIPS_DIR = path.resolve(__dirname, 'video_raw_clips');
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });

async function createRecorder(name, width = 1920, height = 1080) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--window-size=1920,1080'],
  });
  const context = await browser.newContext({
    recordVideo: { dir: CLIPS_DIR, size: { width, height } },
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  return { browser, context, page, name };
}

async function closeAndGetVideo(rec) {
  const video = rec.page.video();
  await rec.page.close();
  await rec.context.close();
  await rec.browser.close();
  const rawPath = await video.path();
  const destPath = path.join(CLIPS_DIR, `${rec.name}.webm`);
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
  fs.renameSync(rawPath, destPath);
  console.log(`[RECORDED] ${rec.name} -> ${destPath} (${(fs.statSync(destPath).size / 1024).toFixed(1)} KB)`);
  return destPath;
}

// Smooth mouse dragging to rotate 3D canvas
async function smoothDrag(page, startX, startY, endX, endY, steps = 30) {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const curX = startX + (endX - startX) * (i / steps);
    const curY = startY + (endY - startY) * (i / steps);
    await page.mouse.move(curX, curY);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
}

async function run() {
  console.log('=== STARTING TIDEWATCH DEMO VIDEO RECORDING ===');

  // CLIP 1: 3D Spatial Twin Dynamic Movements (22 seconds)
  console.log('\n--- Recording Clip 1: 3D Spatial Twin Movements ---');
  {
    const rec = await createRecorder('clip1_spatial_twin');
    await rec.page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });
    await rec.page.waitForTimeout(3000); // let WebGL scene stabilize

    // Initial steady shot of battery layout
    await rec.page.waitForTimeout(1500);

    // Dynamic 3D rotation 1: Orbit right
    await smoothDrag(rec.page, 700, 480, 420, 480, 40);
    await rec.page.waitForTimeout(1200);

    // Dynamic 3D pitch adjustment
    await smoothDrag(rec.page, 600, 450, 600, 360, 30);
    await rec.page.waitForTimeout(1200);

    // Orbit around the other side
    await smoothDrag(rec.page, 500, 420, 850, 420, 45);
    await rec.page.waitForTimeout(1500);

    // Click Tank T-104 to inspect telemetry
    await rec.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((el) => el.innerText.includes('T-104'));
      if (b) b.click();
    });
    await rec.page.waitForTimeout(1500);

    // Click Pump P-01 to inspect
    await rec.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((el) => el.innerText.includes('P-01'));
      if (b) b.click();
    });
    await rec.page.waitForTimeout(1500);

    // Zoom in slightly with mouse wheel
    await rec.page.mouse.move(700, 500);
    await rec.page.mouse.wheel(0, -350);
    await rec.page.waitForTimeout(2000);

    // Final smooth rotation
    await smoothDrag(rec.page, 750, 480, 620, 460, 35);
    await rec.page.waitForTimeout(2000);

    await closeAndGetVideo(rec);
  }

  // CLIP 2: Pipeline Rupture & Red Fluid/Data Leak Simulation (20 seconds)
  console.log('\n--- Recording Clip 2: Pipeline Leak Simulation ---');
  {
    const rec = await createRecorder('clip2_leak_simulation');
    await rec.page.goto('http://localhost:5174', { waitUntil: 'domcontentloaded' });
    await rec.page.waitForTimeout(2500);

    // Orbit to show the discharge pipeline clearly
    await smoothDrag(rec.page, 700, 480, 520, 450, 30);
    await rec.page.waitForTimeout(1000);

    // Click Simulate Leak button using evaluate!
    console.log('Triggering Simulate Leak button via DOM...');
    await rec.page.evaluate(() => {
      const btn = document.querySelector('.leak-btn');
      if (btn) btn.click();
    });
    await rec.page.waitForTimeout(1500);

    // Smoothly orbit closer around the red ruptured pipe
    await smoothDrag(rec.page, 650, 460, 480, 420, 35);
    await rec.page.waitForTimeout(2000);

    // Zoom in on the spraying red data particles and puddle
    await rec.page.mouse.move(680, 480);
    await rec.page.mouse.wheel(0, -400);
    await rec.page.waitForTimeout(3000);

    // Gentle pan to capture the red ground ripples and glowing collar
    await smoothDrag(rec.page, 680, 460, 600, 490, 25);
    await rec.page.waitForTimeout(3500);

    await closeAndGetVideo(rec);
  }

  // CLIP 3: Operator Decision Console & S1 Incident (22 seconds)
  console.log('\n--- Recording Clip 3: Operator Decision Console ---');
  {
    const rec = await createRecorder('clip3_console_scenario');
    await rec.page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await rec.page.waitForTimeout(2500);

    // Click S1: Overnight Pump Trip
    console.log('Activating Scenario 1: Overnight Pump Trip...');
    await rec.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((el) => el.innerText.includes('S1: Overnight Pump Trip'));
      if (b) b.click();
    });
    await rec.page.waitForTimeout(2500);

    // Hover over Decision Deadline banner
    await rec.page.mouse.move(300, 160);
    await rec.page.waitForTimeout(1500);

    // Hover over 3-Way Trust readings
    await rec.page.mouse.move(950, 350);
    await rec.page.waitForTimeout(2000);

    // Hover over Ranked Well Curtailment option
    await rec.page.mouse.move(500, 350);
    await rec.page.waitForTimeout(2000);

    // Scroll down slightly to view Shift Handoff & Controls
    await rec.page.mouse.wheel(0, 300);
    await rec.page.waitForTimeout(2500);

    // Scroll back up
    await rec.page.mouse.wheel(0, -300);
    await rec.page.waitForTimeout(2000);

    await closeAndGetVideo(rec);
  }

  // CLIP 4: Grounded NVIDIA Nemotron AI & SpacetimeDB Action Claim (20 seconds)
  console.log('\n--- Recording Clip 4: Nemotron AI & SpacetimeDB ---');
  {
    const rec = await createRecorder('clip4_nemotron_ai');
    await rec.page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await rec.page.waitForTimeout(2000);

    // Click Generate AI Briefing (NVIDIA Nemotron)
    console.log('Generating AI Briefing with NVIDIA Nemotron...');
    await rec.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((el) => el.innerText.includes('Generate AI Briefing'));
      if (b) b.click();
    });
    await rec.page.waitForTimeout(4000); // let briefing stream/appear

    // Click Claim on the first action option (SpacetimeDB sync)
    console.log('Claiming action via SpacetimeDB...');
    await rec.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((el) => el.innerText.trim() === 'Claim');
      if (b) b.click();
    });
    await rec.page.waitForTimeout(2000);

    // Click Approve Plan button (Human Operator Cryptographic Gate)
    console.log('Signing approval plan...');
    await rec.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((el) => el.innerText.includes('APPROVE PLAN'));
      if (b) b.click();
    });
    await rec.page.waitForTimeout(2500);

    await rec.page.waitForTimeout(2000);
    await closeAndGetVideo(rec);
  }

  // CLIP 5: Monte Carlo Validation Benchmark (14 seconds)
  console.log('\n--- Recording Clip 5: Monte Carlo Benchmark ---');
  {
    const rec = await createRecorder('clip5_monte_carlo');
    await rec.page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
    await rec.page.waitForTimeout(2000);

    // Click Monte Carlo Benchmark button
    console.log('Opening Monte Carlo Benchmark modal...');
    await rec.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find((el) => el.innerText.includes('Monte Carlo Benchmark'));
      if (b) b.click();
    });
    await rec.page.waitForTimeout(3000);

    // Scroll modal slightly to show trial comparison table
    await rec.page.mouse.move(700, 500);
    await rec.page.mouse.wheel(0, 250);
    await rec.page.waitForTimeout(3500);

    await closeAndGetVideo(rec);
  }

  console.log('\n=== ALL CLIPS RECORDED SUCCESSFULLY ===');
}

run().catch(console.error);
