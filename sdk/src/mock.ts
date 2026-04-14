/**
 * KycCbsClientMock — Implémentation de test (sans réseau)
 *
 * Usage en tests / développement :
 *   import { KycCbsClientMock } from "@kyc-lab/cbs-sdk/mock";
 *   const cbs = new KycCbsClientMock();
 *   cbs._customers.push({ id: "C-001", ... });
 */

import type {
  CbsCustomer,
  CbsTransaction,
  CbsTransactionList,
  CbsKycUpdatePayload,
  CbsBlockPayload,
  CbsBlockResult,
  CbsAlertPayload,
} from "./types";

export class KycCbsClientMock {
  public _customers:    CbsCustomer[]    = [];
  public _transactions: CbsTransaction[] = [];
  public _alerts:       CbsAlertPayload[] = [];
  public _blocks:       CbsBlockPayload[] = [];

  async getCustomer(customerId: string): Promise<CbsCustomer> {
    const c = this._customers.find(c => c.id === customerId);
    if (!c) throw new Error(`Customer ${customerId} not found`);
    return { ...c };
  }

  async findCustomer(opts: {
    email?: string; phone?: string; externalRef?: string;
  }): Promise<CbsCustomer | null> {
    return this._customers.find(c =>
      (opts.email && c.email === opts.email) ||
      (opts.phone && c.phone === opts.phone) ||
      (opts.externalRef && c.externalRef === opts.externalRef)
    ) ?? null;
  }

  async pushKycUpdate(payload: CbsKycUpdatePayload): Promise<{ acknowledged: boolean }> {
    const c = this._customers.find(c => c.id === payload.customerId);
    if (c) {
      c.kycStatus  = payload.kycStatus;
      c.riskLevel  = payload.riskLevel;
      c.updatedAt  = payload.updatedAt;
    }
    return { acknowledged: true };
  }

  async blockCustomerAccounts(payload: CbsBlockPayload): Promise<CbsBlockResult> {
    this._blocks.push(payload);
    const c = this._customers.find(c => c.id === payload.customerId);
    if (c) c.accounts.forEach(a => { a.isActive = false; });
    return {
      success:   true,
      reference: `BLK-${Date.now()}`,
      frozenAt:  new Date().toISOString(),
    };
  }

  async unblockCustomerAccounts(customerId: string, _reason: string): Promise<{ success: boolean }> {
    const c = this._customers.find(c => c.id === customerId);
    if (c) c.accounts.forEach(a => { a.isActive = true; });
    return { success: true };
  }

  async getTransactions(accountId: string, opts?: {
    page?: number; limit?: number;
  }): Promise<CbsTransactionList> {
    const all  = this._transactions.filter(t => t.accountId === accountId);
    const page = opts?.page  ?? 1;
    const limit = opts?.limit ?? 50;
    const items = all.slice((page - 1) * limit, page * limit);
    return { items, total: all.length, page, limit, hasMore: page * limit < all.length };
  }

  async getTransaction(transactionId: string): Promise<CbsTransaction> {
    const t = this._transactions.find(t => t.id === transactionId);
    if (!t) throw new Error(`Transaction ${transactionId} not found`);
    return { ...t };
  }

  async pushAlert(payload: CbsAlertPayload): Promise<{ alertId: string; received: boolean }> {
    this._alerts.push(payload);
    return { alertId: `ALT-${Date.now()}`, received: true };
  }

  async ping(): Promise<{ status: "ok"; latencyMs: number }> {
    return { status: "ok", latencyMs: 0 };
  }
}
