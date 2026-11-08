const { chromium } = require('./frontend-cv/node_modules/playwright-core');
const path = require('path');

const banners = [
  {
    id: 'banner_clip1',
    badge: 'SPATIAL OPERATIONS',
    badgeColor: '#38bdf8',
    title: '3D Real-Time Digital Twin',
    desc: 'WebGL hydraulic telemetry visualization · Zero-touch CV gesture controls',
  },
  {
    id: 'banner_clip2',
    badge: 'ACTIVE FAULT SIMULATION',
    badgeColor: '#f87171',
    title: 'High-Pressure Pipeline Breach & Fluid Leak',
    desc: 'Line rupture detection · Red escaping data stream · -84 bbl/h mass balance deficit',
  },
  {
    id: 'banner_clip3',
    badge: 'OPERATOR DECISION SUPPORT',
    badgeColor: '#fbbf24',
    title: 'Deterministic Decision Deadlines & 3-Way Sensor Trust',
    desc: 'Time-to-High-High bisection · Ultrasonic vs Optical vs Mass Balance arbitration',
  },
  {
    id: 'banner_clip4',
    badge: 'MULTI-OPERATOR CONSISTENCY',
    badgeColor: '#a78bfa',
    title: 'Grounded NVIDIA AI & SpacetimeDB State Synchronization',
    desc: 'NVIDIA Nemotron SOP-PW-101 citations · Atomic action lock · Human approval gate',
  },
  {
    id: 'banner_clip5',
    badge: 'MONTE CARLO PROOF',
    badgeColor: '#34d399',
    title: '50-Trial Stochastic Validation Benchmark',
    desc: '$20,488 average savings per incident · 100% unplanned shut-ins prevented',
  },
];

async function generateBanners() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  for (const b of banners) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body {
            margin: 0;
            width: 1920px;
            height: 1080px;
            background: transparent;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "JetBrains Mono", monospace;
            position: relative;
            overflow: hidden;
          }
          .lower-third {
            position: absolute;
            bottom: 40px;
            left: 50px;
            right: 50px;
            background: rgba(10, 16, 26, 0.88);
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-left: 6px solid ${b.badgeColor};
            border-radius: 12px;
            padding: 16px 28px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(12px);
          }
          .main-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .top-row {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .badge {
            background: ${b.badgeColor}22;
            border: 1px solid ${b.badgeColor}77;
            color: ${b.badgeColor};
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 1.5px;
            padding: 3px 10px;
            border-radius: 4px;
            text-transform: uppercase;
            font-family: monospace;
          }
          .title {
            font-size: 20px;
            font-weight: 800;
            color: #FFFFFF;
            letter-spacing: 0.5px;
          }
          .desc {
            font-size: 14px;
            color: #94A3B8;
            font-weight: 400;
          }
          .logo-pill {
            font-family: monospace;
            font-size: 13px;
            color: #38bdf8;
            font-weight: 700;
            letter-spacing: 2px;
            border: 1px solid rgba(56, 189, 248, 0.3);
            background: rgba(15, 23, 42, 0.6);
            padding: 8px 16px;
            border-radius: 6px;
          }
        </style>
      </head>
      <body>
        <div class="lower-third">
          <div class="main-info">
            <div class="top-row">
              <span class="badge">${b.badge}</span>
              <span class="title">${b.title}</span>
            </div>
            <div class="desc">${b.desc}</div>
          </div>
          <div class="logo-pill">TIDEWATCH // AVON</div>
        </div>
      </body>
      </html>
    `;
    await page.setContent(html);
    await page.waitForTimeout(200);
    const dest = path.join(__dirname, 'video_raw_clips', `${b.id}.png`);
    await page.screenshot({ path: dest, omitBackground: true });
    console.log(`[BANNER CREATED] ${b.id}.png`);
  }

  await browser.close();
}

generateBanners().catch(console.error);
