
import axios, { AxiosError } from 'axios';

const API_URL = 'http://localhost:3000';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function runTests() {
  console.log(CYAN + '\n🚀 STARTING IMPULSE API DIAGNOSTICS' + RESET);
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  // --- HELPER ---
  async function test(name: string, fn: () => Promise<void>) {
    (process as any).stdout.write(`Testing ${name}... `);
    try {
      await fn();
      console.log(GREEN + '✔ PASS' + RESET);
      passed++;
    } catch (e: any) {
      console.log(RED + '✘ FAIL' + RESET);
      console.error(YELLOW + `   Error: ${e.message}` + RESET);
      failed++;
    }
  }

  // 1. SYSTEM HEALTH
  await test('Server Connectivity', async () => {
    try {
      await axios.get(API_URL);
    } catch (e: any) {
      // NestJS returns 404 for root / by default, which means server IS running
      if (e.response && e.response.status === 404) return;
      if (e.code === 'ECONNREFUSED') throw new Error('Server is NOT running. Run "npm run start:dev"');
      throw e;
    }
  });

  // 2. SWAGGER DOCS
  await test('Swagger JSON Definition', async () => {
    const res = await axios.get(`${API_URL}/api/docs-json`);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.openapi) throw new Error('Invalid Swagger JSON');
    const paths = Object.keys(res.data.paths);
    console.log(RESET + `   Found ${paths.length} endpoints documented.`);
  });

  // 3. MODULE: AUTH
  await test('Auth Webhook (Valid /start)', async () => {
    const res = await axios.post(`${API_URL}/auth/webhook`, {
      message: { chat: { id: 123456 }, text: '/start' }
    });
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  await test('Auth Webhook (Ignored Text)', async () => {
    const res = await axios.post(`${API_URL}/auth/webhook`, {
      message: { chat: { id: 123456 }, text: 'Just chatting' }
    });
    if (res.status !== 200) throw new Error(`Expected 200 OK for ignored text`);
  });

  // 4. MODULE: BOTS (Validation Pipe Check)
  await test('Bots Controller (Validation: Empty Body)', async () => {
    try {
      await axios.post(`${API_URL}/bots`, {});
      throw new Error('Should have failed with 400');
    } catch (e: any) {
      if (e.response?.status === 400) {
        const errors = e.response.data.message; // ClassValidator messages
        if (!Array.isArray(errors)) throw new Error('Validation response format unexpected');
        return; // Success: validation blocked it
      }
      throw e;
    }
  });

  await test('Bots Controller (Validation: Invalid Token Format)', async () => {
    try {
      await axios.post(`${API_URL}/bots`, {
        token: 'not-a-token',
        userId: 'invalid-uuid'
      });
      throw new Error('Should have failed with 400');
    } catch (e: any) {
      if (e.response?.status === 400) return; // Success
      throw e;
    }
  });

  await test('Bots Controller (Logic: Telegram API Mock)', async () => {
     // We expect 400 because our server tries to call real Telegram API with a fake token
     // This proves the controller logic (axios.get telegram...) is executing
     try {
        await axios.post(`${API_URL}/bots`, {
            token: '123456:ABC-FakeTokenForTest',
            userId: '550e8400-e29b-41d4-a716-446655440000'
        });
        throw new Error('Should have failed (Telegram API check)');
     } catch (e: any) {
        // Expecting "Invalid Telegram Bot Token" message from our service
        if (e.response?.status === 400 && e.response?.data?.message?.includes('Telegram')) return;
        throw e;
     }
  });

  console.log('\n========================================');
  console.log(CYAN + 'SUMMARY' + RESET);
  console.log(`Total Tests: ${passed + failed}`);
  console.log(GREEN + `Passed:      ${passed}` + RESET);
  console.log(failed > 0 ? RED + `Failed:      ${failed}` + RESET : 'All systems operational.');
  
  if (passed > 0) {
      console.log('\n' + YELLOW + 'NOTE: ' + RESET + 'Channels, Posts, Campaigns endpoints are NOT tested');
      console.log('      because Controllers for these modules are not yet implemented (Sprint 2 task).');
      console.log('      However, their Database Entities are loaded.');
  }
}

runTests();
