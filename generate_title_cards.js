const { chromium } = require('./frontend-cv/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

async function makeCards() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  // 1. INTRO CARD
  const introHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          margin: 0;
          background: #080D15;
          color: #E2E8F0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "JetBrains Mono", monospace;
          width: 1920px;
          height: 1080px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          position: relative;
          overflow: hidden;
        }
        /* Radial glow & cyber grid */
        .bg-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(to right, rgba(66, 229, 238, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(66, 229, 238, 0.05) 1px, transparent 1px);
          background-size: 60px 60px;
        }
        .glow {
          position: absolute;
          width: 800px;
          height: 800px;
          background: radial-gradient(circle, rgba(66, 229, 238, 0.18) 0%, rgba(13, 21, 34, 0) 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .content {
          position: relative;
          z-index: 2;
          text-align: center;
          max-width: 1300px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 22px;
          border-radius: 9999px;
          background: rgba(66, 229, 238, 0.12);
          border: 1px solid rgba(66, 229, 238, 0.4);
          color: #42e5ee;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 28px;
        }
        .badge .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #42e5ee;
          box-shadow: 0 0 12px #42e5ee;
        }
        h1 {
          font-size: 82px;
          font-weight: 900;
          letter-spacing: 6px;
          margin: 0 0 14px 0;
          background: linear-gradient(135deg, #ffffff 40%, #56e4e9 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .tagline {
          font-size: 26px;
          color: #94A3B8;
          font-weight: 400;
          letter-spacing: 1px;
          margin-bottom: 52px;
        }
        .metrics-strip {
          display: flex;
          justify-content: center;
          gap: 36px;
          margin-bottom: 50px;
        }
        .metric-card {
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(51, 65, 85, 0.8);
          border-radius: 14px;
          padding: 20px 32px;
          text-align: left;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .metric-card .num {
          font-size: 32px;
          font-weight: 800;
          color: #38bdf8;
          font-family: monospace;
        }
        .metric-card .label {
          font-size: 13px;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-top: 4px;
        }
        .tech-pills {
          display: flex;
          justify-content: center;
          gap: 16px;
          font-size: 14px;
          color: #94A3B8;
          font-family: monospace;
        }
        .pill {
          background: rgba(30, 41, 59, 0.8);
          border: 1px solid #334155;
          padding: 6px 16px;
          border-radius: 8px;
        }
        .pill b { color: #f1f5f9; }
      </style>
    </head>
    <body>
      <div class="bg-grid"></div>
      <div class="glow"></div>
      <div class="content">
        <div class="badge"><div class="dot"></div> EOG Resources · Produced Water Challenge</div>
        <h1>TIDEWATCH</h1>
        <div class="tagline">Real-Time AI-Assisted Operational Intelligence & Decision Console</div>
        <div class="metrics-strip">
          <div class="metric-card">
            <div class="num" style="color: #38bdf8;">1 bbl : 5 bbl</div>
            <div class="label">Oil to Produced Water Ratio</div>
          </div>
          <div class="metric-card">
            <div class="num" style="color: #f87171;">$20,000+/hr</div>
            <div class="label">Deferred Revenue at Shut-in</div>
          </div>
          <div class="metric-card">
            <div class="num" style="color: #34d399;">100% Explainable</div>
            <div class="label">Physics-Grounded Arbitration</div>
          </div>
        </div>
        <div class="tech-pills">
          <span class="pill">Stack: <b>NVIDIA Nemotron</b></span>
          <span class="pill">Database: <b>SpacetimeDB</b></span>
          <span class="pill">TSDB: <b>Tiger Cloud (Timescale)</b></span>
          <span class="pill">Runbooks: <b>MongoDB Atlas</b></span>
        </div>
      </div>
    </body>
    </html>
  `;
  await page.setContent(introHtml);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'video_raw_clips', 'intro_card.png') });
  console.log('[CREATED] intro_card.png');

  // 2. OUTRO CARD
  const outroHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body {
          margin: 0;
          background: #080D15;
          color: #E2E8F0;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "JetBrains Mono", monospace;
          width: 1920px;
          height: 1080px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          position: relative;
          overflow: hidden;
        }
        .bg-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(to right, rgba(56, 189, 248, 0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.05) 1px, transparent 1px);
          background-size: 60px 60px;
        }
        .glow {
          position: absolute;
          width: 850px;
          height: 850px;
          background: radial-gradient(circle, rgba(52, 211, 153, 0.16) 0%, rgba(13, 21, 34, 0) 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .content {
          position: relative;
          z-index: 2;
          text-align: center;
          max-width: 1200px;
        }
        h2 {
          font-size: 32px;
          color: #34d399;
          text-transform: uppercase;
          letter-spacing: 4px;
          margin-bottom: 12px;
        }
        h1 {
          font-size: 76px;
          font-weight: 900;
          letter-spacing: 4px;
          margin: 0 0 20px 0;
          color: #FFFFFF;
        }
        .subtitle {
          font-size: 24px;
          color: #94A3B8;
          margin-bottom: 50px;
        }
        .highlight-box {
          background: rgba(15, 23, 42, 0.85);
          border: 1px solid rgba(52, 211, 153, 0.4);
          border-radius: 18px;
          padding: 32px 48px;
          display: inline-flex;
          gap: 60px;
          margin-bottom: 50px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        }
        .stat-item {
          text-align: left;
        }
        .stat-item .val {
          font-size: 44px;
          font-weight: 800;
          color: #34d399;
          font-family: monospace;
        }
        .stat-item .lbl {
          font-size: 14px;
          color: #64748B;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .footer-note {
          font-size: 16px;
          color: #64748B;
          font-family: monospace;
        }
      </style>
    </head>
    <body>
      <div class="bg-grid"></div>
      <div class="glow"></div>
      <div class="content">
        <h2>Proven Operational Impact</h2>
        <h1>Zero Unintended Shut-Ins.</h1>
        <div class="subtitle">Physics-Grounded · Multi-Operator Certified · Human-in-the-Loop</div>
        <div class="highlight-box">
          <div class="stat-item">
            <div class="val">$20,488</div>
            <div class="lbl">Avg Savings / Incident</div>
          </div>
          <div class="stat-item">
            <div class="val">100%</div>
            <div class="lbl">Permeability Protected</div>
          </div>
          <div class="stat-item">
            <div class="val">&lt; 1 ms</div>
            <div class="lbl">SpacetimeDB Sync Latency</div>
          </div>
        </div>
        <div class="footer-note">TIDEWATCH · Built for HackUTD 2026 · Avon Gathering Network</div>
      </div>
    </body>
    </html>
  `;
  await page.setContent(outroHtml);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'video_raw_clips', 'outro_card.png') });
  console.log('[CREATED] outro_card.png');

  await browser.close();
}

makeCards().catch(console.error);
