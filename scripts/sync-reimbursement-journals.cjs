/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS maintenance script. */
const { loadEnvConfig } = require('@next/env');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');

loadEnvConfig(process.cwd());
const helperPath = path.resolve('lib/helper/reimbursement-journal.ts');
const compiled = ts.transpileModule(fs.readFileSync(helperPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const helper = { exports: {} };
new Function('exports', 'require', 'module', compiled)(helper.exports, require, helper);
const { lockReimbursementJournal, syncReimbursementJournal } = helper.exports;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const claims = await prisma.reimbursement.findMany({ where: { status: { equals: 'APPROVED', mode: 'insensitive' } } });
  console.log(`Approved claims: ${claims.length}`);
  if (!process.argv.includes('--apply')) {
    console.log('Dry run. Pass --apply to synchronize missing journals; existing legacy journals are preserved.');
    return;
  }
  for (const claim of claims) {
    await prisma.$transaction(async (tx) => {
      await lockReimbursementJournal(tx, claim.tenantId);
      const current = await tx.reimbursement.findUnique({ where: { id: claim.id } });
      if (current) await syncReimbursementJournal(tx, current);
    });
  }
  console.log('Reimbursement journal synchronization completed.');
}

module.exports = { prisma, pool, lockReimbursementJournal, syncReimbursementJournal };

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => { await prisma.$disconnect(); await pool.end(); });
