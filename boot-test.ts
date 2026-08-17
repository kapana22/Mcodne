import { ensureDbReady } from './lib/dbBoot'
async function main() {
  try { await ensureDbReady(); console.log('dbBoot: OK') }
  catch (e: any) {
    console.error('dbBoot FAILED')
    console.error('code:', e?.code, '| meta:', JSON.stringify(e?.meta))
    console.error(String(e?.message).slice(0, 800))
  }
  process.exit(0)
}
main()
