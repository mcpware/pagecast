#!/usr/bin/env node
/**
 * Record Pagecast demo videos using CCO with sandbox fake data.
 * Creates a temp .claude/ directory with realistic demo content,
 * starts CCO pointing to it (HOME override), records both export modes.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startRecording, interactWithPage, stopRecording, cleanup } from './src/recorder.js';
import { convertWithTooltipGif, convertWithZoomGif } from './src/converter.js';

const CCO_ROOT = '/home/nicole/MyGithub/claude-code-organizer';
const OUTPUT_DIR = './docs';
const PORT = 3899; // different port from real CCO

// ============================================================
// Step 1: Create sandbox with realistic fake demo data
// ============================================================
async function createSandbox() {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pagecast-demo-'));
  const claudeDir = join(tmpDir, '.claude');

  // Helper: encode a path to CCO scope ID format (replace / with -)
  function encodeScopeId(dirPath) {
    return dirPath.replace(/\//g, '-');
  }

  // Global memories
  const memDir = join(claudeDir, 'memory');
  await mkdir(memDir, { recursive: true });
  await writeFile(join(memDir, 'user_preferences.md'), '---\nname: user_preferences\ndescription: User prefers dark mode and TypeScript\ntype: user\n---\nPrefers dark mode in all editors. Uses TypeScript exclusively.\n');
  await writeFile(join(memDir, 'feedback_testing.md'), '---\nname: feedback_testing\ndescription: Always run tests before committing\ntype: feedback\n---\nAlways run the full test suite before committing. CI failures are expensive.\n');
  await writeFile(join(memDir, 'project_api_design.md'), '---\nname: project_api_design\ndescription: REST API follows OpenAPI 3.1 spec\ntype: project\n---\nAll REST endpoints follow OpenAPI 3.1 spec. Use snake_case for field names.\n');
  await writeFile(join(memDir, 'reference_docs.md'), '---\nname: reference_docs\ndescription: Architecture docs in Notion\ntype: reference\n---\nArchitecture diagrams and ADRs are maintained in the team Notion workspace.\n');
  await writeFile(join(memDir, 'feedback_code_style.md'), '---\nname: feedback_code_style\ndescription: Use early returns, avoid deep nesting\ntype: feedback\n---\nUse early returns to reduce nesting. Max 3 levels of indentation.\n');

  // Global skills
  const skillDir = join(claudeDir, 'skills');
  await mkdir(join(skillDir, 'deploy'), { recursive: true });
  await mkdir(join(skillDir, 'lint-fix'), { recursive: true });
  await mkdir(join(skillDir, 'db-migrate'), { recursive: true });
  await writeFile(join(skillDir, 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: Deploy to staging or production\n---\n# Deploy\nRun deployment pipeline.\n');
  await writeFile(join(skillDir, 'lint-fix', 'SKILL.md'), '---\nname: lint-fix\ndescription: Auto-fix linting errors across the project\n---\n# Lint Fix\nRun ESLint with --fix flag.\n');
  await writeFile(join(skillDir, 'db-migrate', 'SKILL.md'), '---\nname: db-migrate\ndescription: Generate and run database migrations\n---\n# DB Migrate\nCreate Alembic migration from model changes.\n');

  // Global MCP config
  await writeFile(join(claudeDir, '.mcp.json'), JSON.stringify({
    mcpServers: {
      'pagecast': { command: 'npx', args: ['-y', '@mcpware/pagecast'] },
      'github': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      'postgres': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
    }
  }, null, 2));

  // Global hooks
  await writeFile(join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: 'Bash', command: 'echo "Bash tool used"' }],
    }
  }, null, 2));

  // Plans
  const planDir = join(claudeDir, 'plans');
  await mkdir(planDir, { recursive: true });
  await writeFile(join(planDir, 'q2-roadmap.md'), '# Q2 Roadmap\n\n- [ ] Auth v2\n- [ ] Dashboard redesign\n- [ ] API rate limiting\n');

  // Project scope: "my-saas-app"
  const projId = encodeScopeId(join(tmpDir, 'my-saas-app'));
  const projDir = join(claudeDir, 'projects', projId);
  const projMemDir = join(projDir, 'memory');
  await mkdir(projMemDir, { recursive: true });
  await writeFile(join(projMemDir, 'db_schema.md'), '---\nname: db_schema\ndescription: PostgreSQL schema with users, orgs, billing tables\ntype: project\n---\nMain tables: users, organizations, subscriptions, invoices.\n');
  await writeFile(join(projMemDir, 'auth_flow.md'), '---\nname: auth_flow\ndescription: OAuth2 + JWT authentication flow\ntype: project\n---\nAuth uses OAuth2 with Google/GitHub providers. JWTs expire in 1 hour.\n');
  await writeFile(join(projDir, 'CLAUDE.md'), '# my-saas-app\n\nNext.js 14 + tRPC + Prisma + PostgreSQL.\nRun `npm run dev` to start.\n');

  // Project scope: "mobile-app"
  const proj2Id = encodeScopeId(join(tmpDir, 'mobile-app'));
  const proj2Dir = join(claudeDir, 'projects', proj2Id);
  const proj2MemDir = join(proj2Dir, 'memory');
  await mkdir(proj2MemDir, { recursive: true });
  await writeFile(join(proj2MemDir, 'react_native_setup.md'), '---\nname: react_native_setup\ndescription: React Native 0.74 with Expo\ntype: project\n---\nUsing Expo managed workflow. EAS Build for CI/CD.\n');

  // Sessions
  const sessDir = join(claudeDir, 'projects', projId, 'sessions');
  await mkdir(sessDir, { recursive: true });
  await writeFile(join(sessDir, 'session-abc123.jsonl'), [
    JSON.stringify({ type: 'summary', summary: { title: 'Fix auth token refresh bug' } }),
    JSON.stringify({ role: 'user', content: [{ type: 'text', text: 'The refresh token is expiring too early' }] }),
    JSON.stringify({ role: 'assistant', content: [{ type: 'text', text: 'Found the issue — the expiry was set to 60 seconds instead of 3600.' }] }),
  ].join('\n'));

  // Workspace scope (the HOME dir itself acts as workspace parent)
  const wsId = encodeScopeId(tmpDir);
  const wsDir = join(claudeDir, 'projects', wsId);
  await mkdir(join(wsDir, 'memory'), { recursive: true });
  await writeFile(join(wsDir, 'CLAUDE.md'), '# Demo Workspace\n\nAll projects use pnpm. Node 20+ required.\n');
  await writeFile(join(wsDir, 'memory', 'workspace_conventions.md'), '---\nname: workspace_conventions\ndescription: Monorepo conventions shared across projects\ntype: project\n---\nUse pnpm workspaces. Shared ESLint config in root.\n');

  // More project scopes for hierarchy depth
  // Project 3: "api-gateway"
  const proj3Id = encodeScopeId(join(tmpDir, 'api-gateway'));
  const proj3Dir = join(claudeDir, 'projects', proj3Id);
  await mkdir(join(proj3Dir, 'memory'), { recursive: true });
  await mkdir(join(proj3Dir, 'skills', 'run-tests'), { recursive: true });
  await writeFile(join(proj3Dir, 'memory', 'gateway_routes.md'), '---\nname: gateway_routes\ndescription: API Gateway routing config\ntype: project\n---\nRoutes defined in routes.yaml. Rate limiting via Redis.\n');
  await writeFile(join(proj3Dir, 'skills', 'run-tests', 'SKILL.md'), '---\nname: run-tests\ndescription: Run integration tests with Docker\n---\n# Run Tests\nStart Docker compose, run pytest, tear down.\n');
  await writeFile(join(proj3Dir, 'CLAUDE.md'), '# api-gateway\n\nFastAPI + Redis + PostgreSQL.\n');

  // Project 4: "design-system"
  const proj4Id = encodeScopeId(join(tmpDir, 'design-system'));
  const proj4Dir = join(claudeDir, 'projects', proj4Id);
  await mkdir(join(proj4Dir, 'memory'), { recursive: true });
  await writeFile(join(proj4Dir, 'memory', 'component_library.md'), '---\nname: component_library\ndescription: Storybook component library structure\ntype: project\n---\nComponents in src/components/. Each has .tsx + .stories.tsx + .test.tsx.\n');
  await writeFile(join(proj4Dir, 'CLAUDE.md'), '# design-system\n\nReact + Storybook + Tailwind CSS.\n');

  // Create fake home dirs so scanner finds the project scopes
  await mkdir(join(tmpDir, 'my-saas-app', '.git'), { recursive: true });
  await mkdir(join(tmpDir, 'mobile-app', '.git'), { recursive: true });
  await mkdir(join(tmpDir, 'api-gateway', '.git'), { recursive: true });
  await mkdir(join(tmpDir, 'design-system', '.git'), { recursive: true });

  console.log(`Sandbox created at: ${tmpDir}`);
  return tmpDir;
}

// ============================================================
// Step 2: Start CCO with sandbox HOME
// ============================================================
async function startCCO(sandboxHome) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [join(CCO_ROOT, 'bin', 'cli.mjs'), '--port', String(PORT)], {
      env: { ...process.env, HOME: sandboxHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let started = false;
    proc.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes(`http://localhost:${PORT}`) && !started) {
        started = true;
        console.log(`CCO started on port ${PORT} with sandbox HOME`);
        resolve(proc);
      }
    });
    proc.stderr.on('data', (d) => {
      if (!started) console.error('CCO stderr:', d.toString().trim());
    });
    proc.on('error', reject);

    setTimeout(() => {
      if (!started) { proc.kill(); reject(new Error('CCO startup timeout')); }
    }, 15000);
  });
}

// ============================================================
// Step 3: Record demo
// ============================================================
async function recordDemo() {
  const rec = await startRecording(`http://localhost:${PORT}`, {
    width: 1280, height: 720, outputDir: OUTPUT_DIR,
  });
  console.log(`Recording session: ${rec.sessionId}`);

  // Wait for load
  await interactWithPage(rec.sessionId, [
    { type: 'waitForSelector', selector: '#loading.hidden', state: 'attached', timeout: 15000 },
    { type: 'waitForSelector', selector: '.item', state: 'visible', timeout: 10000 },
    { type: 'wait', ms: 1200 },
  ]);
  console.log('Page loaded');

  // Beat 1: Show full scope hierarchy — expand the workspace scope tree
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: '.s-scope-hdr[data-scope-id="global"]' },
    { type: 'wait', ms: 600 },
  ]);
  // Expand workspace to show projects underneath
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: '.s-tog' },
    { type: 'wait', ms: 400 },
  ]).catch(() => {});
  await interactWithPage(rec.sessionId, [
    { type: 'wait', ms: 800 },
  ]);
  console.log('Beat 1: Scope hierarchy visible');

  // Beat 2: Click filter pill (Memories)
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: 'button.f-pill[data-filter="memory"]' },
    { type: 'wait', ms: 1000 },
  ]).catch(async () => {
    await interactWithPage(rec.sessionId, [
      { type: 'click', selector: 'button.f-pill' },
      { type: 'wait', ms: 1000 },
    ]);
  });
  console.log('Beat 2: Filter memories');

  // Beat 3: Click an item to show detail panel
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: '.item' },
    { type: 'wait', ms: 1500 },
  ]);
  console.log('Beat 3: Item detail');

  // Beat 4: Click Move button to show move destinations
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: '#detailMove, .d-btn-move' },
    { type: 'wait', ms: 1500 },
  ]).catch(() => console.log('(Move button not found)'));
  console.log('Beat 4: Move panel');

  // Beat 5: Close move modal (click cancel or the modal background)
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: '#moveCancel' },
    { type: 'wait', ms: 600 },
  ]).catch(async () => {
    // Fallback: click modal background or press Escape
    await interactWithPage(rec.sessionId, [
      { type: 'click', selector: '.modal-bg' },
      { type: 'wait', ms: 600 },
    ]).catch(async () => {
      await interactWithPage(rec.sessionId, [
        { type: 'press', key: 'Escape' },
        { type: 'wait', ms: 600 },
      ]);
    });
  });

  // Beat 6: Switch filter to Skills
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: 'button.f-pill[data-filter="skill"]' },
    { type: 'wait', ms: 800 },
  ]).catch(async () => {
    await interactWithPage(rec.sessionId, [
      { type: 'click', selector: 'button.f-pill[data-filter="config"]' },
      { type: 'wait', ms: 800 },
    ]);
  });
  console.log('Beat 5: Switch to Skills');

  // Beat 7: Click another item
  await interactWithPage(rec.sessionId, [
    { type: 'click', selector: '.item' },
    { type: 'wait', ms: 1200 },
  ]);
  console.log('Beat 6: Another item');

  // Beat 8: Final pause
  await interactWithPage(rec.sessionId, [
    { type: 'wait', ms: 1000 },
  ]);

  return await stopRecording(rec.sessionId);
}

// ============================================================
// Main
// ============================================================
async function main() {
  let ccoProc = null;
  let sandboxDir = null;

  try {
    console.log('=== Pagecast GitHub Demo (sandbox mode) ===\n');

    // Create sandbox
    sandboxDir = await createSandbox();

    // Start CCO with sandbox
    ccoProc = await startCCO(sandboxDir);

    // Record
    const stop = await recordDemo();
    console.log(`\nRecording: ${stop.webmPath} (${stop.durationSeconds}s)\n`);

    // Export tooltip
    console.log('Exporting tooltip GIF (smart_export)...');
    const tooltip = await convertWithTooltipGif(stop.webmPath, stop.timelinePath, {
      magnifyScale: 1.6, tooltipSize: 380, holdPerTarget: 1.2, fps: 12, width: 800,
    });
    console.log(`  → ${tooltip.gifPath} (${tooltip.sizeMB} MB)`);

    // Export cinematic
    console.log('Exporting cinematic GIF (cinematic_export)...');
    const cinematic = await convertWithZoomGif(stop.webmPath, stop.timelinePath, {
      zoomLevel: 2.5, transitionDuration: 0.35, holdPerTarget: 0.8, fps: 12, width: 800,
    });
    console.log(`  → ${cinematic.gifPath} (${cinematic.sizeMB} MB)`);

    console.log('\n=== Done! ===');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    if (ccoProc) { ccoProc.kill('SIGKILL'); console.log('CCO stopped'); }
    await cleanup();
    if (sandboxDir) {
      await rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
      console.log('Sandbox cleaned up');
    }
  }
}

main();
