const { execSync } = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

const FFMPEG = ffmpeg.path;
const DIR = path.resolve(__dirname, 'video_raw_clips');
const OUT_DIR = path.resolve(__dirname, 'final_video_output');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function runCmd(cmd) {
  console.log(`[EXEC] ${cmd.slice(0, 120)}...`);
  execSync(cmd, { stdio: 'inherit' });
}

async function assemble() {
  console.log('=== ASSEMBLING MASTER DEMO VIDEO (1080P) ===');

  // 1. Process Intro Card (5 sec with slow push & smooth fade)
  const introOut = path.join(OUT_DIR, 'part0_intro.mp4');
  runCmd(`"${FFMPEG}" -y -loop 1 -t 5 -i "${path.join(DIR, 'intro_card.png')}" -vf "scale=1920:1080,fps=30,fade=t=in:st=0:d=0.8,fade=t=out:st=4.2:d=0.8" -c:v libx264 -pix_fmt yuv420p "${introOut}"`);

  // 2. Process Clip 1: 3D Spatial Twin
  const clip1Out = path.join(OUT_DIR, 'part1_spatial.mp4');
  runCmd(`"${FFMPEG}" -y -i "${path.join(DIR, 'clip1_spatial_twin.webm')}" -i "${path.join(DIR, 'banner_clip1.png')}" -filter_complex "[0:v]scale=1920:1080,fps=30[base];[base][1:v]overlay=0:0,fade=t=in:st=0:d=0.5,fade=t=out:st=21.5:d=0.8" -t 22 -c:v libx264 -pix_fmt yuv420p "${clip1Out}"`);

  // 3. Process Clip 2: Pipeline Leak Simulation
  const clip2Out = path.join(OUT_DIR, 'part2_leak.mp4');
  runCmd(`"${FFMPEG}" -y -i "${path.join(DIR, 'clip2_leak_simulation.webm')}" -i "${path.join(DIR, 'banner_clip2.png')}" -filter_complex "[0:v]scale=1920:1080,fps=30[base];[base][1:v]overlay=0:0,fade=t=in:st=0:d=0.5,fade=t=out:st=18.2:d=0.8" -t 19 -c:v libx264 -pix_fmt yuv420p "${clip2Out}"`);

  // 4. Process Clip 3: Operator Decision Console
  const clip3Out = path.join(OUT_DIR, 'part3_console.mp4');
  runCmd(`"${FFMPEG}" -y -i "${path.join(DIR, 'clip3_console_scenario.webm')}" -i "${path.join(DIR, 'banner_clip3.png')}" -filter_complex "[0:v]scale=1920:1080,fps=30[base];[base][1:v]overlay=0:0,fade=t=in:st=0:d=0.5,fade=t=out:st=15.2:d=0.8" -t 16 -c:v libx264 -pix_fmt yuv420p "${clip3Out}"`);

  // 5. Process Clip 4: Nemotron AI & SpacetimeDB
  const clip4Out = path.join(OUT_DIR, 'part4_ai_spacetimedb.mp4');
  runCmd(`"${FFMPEG}" -y -i "${path.join(DIR, 'clip4_nemotron_ai.webm')}" -i "${path.join(DIR, 'banner_clip4.png')}" -filter_complex "[0:v]scale=1920:1080,fps=30[base];[base][1:v]overlay=0:0,fade=t=in:st=0:d=0.5,fade=t=out:st=12.5:d=0.8" -t 13 -c:v libx264 -pix_fmt yuv420p "${clip4Out}"`);

  // 6. Process Clip 5: Monte Carlo Benchmark
  const clip5Out = path.join(OUT_DIR, 'part5_monte_carlo.mp4');
  runCmd(`"${FFMPEG}" -y -i "${path.join(DIR, 'clip5_monte_carlo.webm')}" -i "${path.join(DIR, 'banner_clip5.png')}" -filter_complex "[0:v]scale=1920:1080,fps=30[base];[base][1:v]overlay=0:0,fade=t=in:st=0:d=0.5,fade=t=out:st=8.8:d=0.8" -t 9.5 -c:v libx264 -pix_fmt yuv420p "${clip5Out}"`);

  // 7. Process Outro Card (6 sec)
  const outroOut = path.join(OUT_DIR, 'part6_outro.mp4');
  runCmd(`"${FFMPEG}" -y -loop 1 -t 6 -i "${path.join(DIR, 'outro_card.png')}" -vf "scale=1920:1080,fps=30,fade=t=in:st=0:d=0.8,fade=t=out:st=5.2:d=0.8" -c:v libx264 -pix_fmt yuv420p "${outroOut}"`);

  // 8. Concatenate all segments into Master Video
  const concatList = path.join(OUT_DIR, 'concat_list.txt');
  const files = [introOut, clip1Out, clip2Out, clip3Out, clip4Out, clip5Out, outroOut];
  fs.writeFileSync(concatList, files.map((f) => `file '${f}'`).join('\n'));

  const masterMp4 = path.resolve(__dirname, 'Tidewatch_Demo_1080p.mp4');
  runCmd(`"${FFMPEG}" -y -f concat -safe 0 -i "${concatList}" -c copy "${masterMp4}"`);

  const stat = fs.statSync(masterMp4);
  console.log(`\n🎉 MASTER DEMO VIDEO GENERATED SUCCESSFULLY!`);
  console.log(`Output: ${masterMp4}`);
  console.log(`Size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);
}

assemble().catch(console.error);
