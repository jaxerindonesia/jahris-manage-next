/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node CommonJS integration test. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { prisma, pool, lockReimbursementJournal, syncReimbursementJournal } = require('./sync-reimbursement-journals.cjs');

async function main() {
  const source = await prisma.reimbursement.findFirst({ where: { status: 'APPROVED' } });
  assert.ok(source, 'An approved claim is required for the rollback integration test');
  const rollback = new Error('ROLLBACK_TEST');
  try {
    await prisma.$transaction(async (tx) => {
      await lockReimbursementJournal(tx, source.tenantId);
      const claim = { ...source, id: randomUUID(), referenceNumber: randomUUID(), amount: 210000 };
      const where = { journalNo: `AUTO-RBM-${claim.id}` };
      await syncReimbursementJournal(tx, { ...claim, status: 'PENDING' });
      assert.equal(await tx.journal.count({ where }), 0);
      await syncReimbursementJournal(tx, claim);
      await syncReimbursementJournal(tx, claim);
      assert.equal(await tx.journal.count({ where }), 1, 'Repeated approval must not duplicate journals');
      let journal = await tx.journal.findUnique({ where, include: { details: { include: { account: true } }, creator: true } });
      assert.equal(journal.status, 'POSTED');
      assert.equal(journal.creator.tenantId, claim.tenantId);
      assert.equal(journal.details.length, 2);
      assert.equal(journal.details.reduce((sum, row) => sum + row.debit - row.credit, 0), 0);
      assert.ok(journal.details.every((row) => row.account.tenantId === claim.tenantId));
      assert.equal(journal.details.find((row) => row.debit > 0).account.code, '5-RBM');
      assert.equal(journal.details.find((row) => row.credit > 0).account.code, '2-RBM');
      await syncReimbursementJournal(tx, { ...claim, amount: 2000000 });
      journal = await tx.journal.findUnique({ where, include: { details: true } });
      assert.equal(journal.details.length, 2);
      assert.equal(journal.details.reduce((sum, row) => sum + row.debit, 0), 2000000);
      await syncReimbursementJournal(tx, { ...claim, status: 'REJECTED' });
      assert.equal((await tx.journal.findUnique({ where })).status, 'VOID');
      await syncReimbursementJournal(tx, claim);
      assert.equal((await tx.journal.findUnique({ where })).status, 'POSTED');
      assert.equal(await tx.journal.count({ where }), 1);
      await assert.rejects(() => syncReimbursementJournal(tx, { ...claim, amount: -1 }), /Nominal/);
      const historical = { ...claim, id: randomUUID(), referenceNumber: randomUUID() };
      await tx.journal.create({ data: {
        journalNo: `TEST-LEGACY-${historical.id}`, date: historical.date,
        referenceNo: `REIMBURSEMENT-${historical.referenceNumber}`,
        createdBy: journal.creator?.id ?? claim.userId, status: 'POSTED',
      } });
      await syncReimbursementJournal(tx, historical);
      assert.equal(await tx.journal.count({ where: { journalNo: `AUTO-RBM-${historical.id}` } }), 0, 'Legacy journals must not be duplicated');
      throw rollback;
    }, { timeout: 20000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  console.log('PASS: pending, balanced posting, tenant scope, repeated approval, amount edit, void, reapproval, invalid amount. Test writes rolled back.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
