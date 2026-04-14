/**
 * KYC-CBS SDK — KycCbsClient
 *
 * Client TypeScript typé pour l'intégration Core Banking System (CBS).
 * Compatible Node.js ≥ 18 (fetch natif) et tout bundler (Vite, webpack…).
 *
 * Usage :
 *   import { KycCbsClient } from "@kyc-lab/cbs-sdk";
 *   const cbs = new KycCbsClient({ baseUrl: "https://cbs.bank.fr/v2", apiKey: "..." });
 *   const customer = await cbs.getCustomer("C-001");
 */

import type {
  CbsClientConfig,
  CbsCustomer,
  CbsTransaction,
  CbsTransactionList,
  CbsKycUpdatePayload,
  CbsBlockPayload,
  CbsBlockResult,
  CbsAlertPayload,
} from "./types";
import { CbsApiError, CbsTimeoutError } from "./types";

const DEFAULT_TIMEOUT = 10_000;

export class KycCbsClient {
  private readonly config: Required<CbsClientConfig>;

  constructor(config: CbsClientConfig) {
    this.config = {
      timeout: DEFAULT_TIMEOUT,
      debug:   false,
      headers: {},
      ...config,
    };
  }

  // ─── Core HTTP ────────────────────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path:   string,
    body?:  unknown,
    params?: Record<string, string | number | boolean | undefined>,
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);

    const headers: Record<string, string> = {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${this.config.apiKey}`,
      "X-Source":      "KYC-Platform-v2",
      ...this.config.headers,
    };

    if (this.config.debug) {
      console.debug(`[CBS SDK] ${method} ${url.toString()}`);
    }

    try {
      const fetchInit: RequestInit = {
        method,
        headers,
        signal: controller.signal,
      };
      if (body !== undefined) fetchInit.body = JSON.stringify(body);

      const resp = await fetch(url.toString(), fetchInit);

      clearTimeout(timer);

      if (!resp.ok) {
        let raw: unknown;
        try { raw = await resp.json(); } catch { raw = await resp.text(); }

        throw new CbsApiError(
          `CBS API error: ${resp.status} ${resp.statusText}`,
          resp.status,
          (raw as Record<string, string>)?.["code"] ?? "CBS_ERROR",
          raw,
        );
      }

      if (resp.status === 204) return undefined as unknown as T;
      return (await resp.json()) as T;

    } catch (err) {
      clearTimeout(timer);

      if ((err as Error).name === "AbortError") {
        throw new CbsTimeoutError(this.config.timeout);
      }
      throw err;
    }
  }

  // ─── Customers ────────────────────────────────────────────────────────────────

  /**
   * Récupère un client CBS par son ID.
   */
  async getCustomer(customerId: string): Promise<CbsCustomer> {
    return this.request<CbsCustomer>("GET", `/customers/${encodeURIComponent(customerId)}`);
  }

  /**
   * Recherche un client par critères.
   */
  async findCustomer(opts: {
    email?:     string;
    phone?:     string;
    externalRef?: string;
  }): Promise<CbsCustomer | null> {
    try {
      return await this.request<CbsCustomer>("GET", "/customers/search", undefined, {
        email:       opts.email,
        phone:       opts.phone,
        externalRef: opts.externalRef,
      });
    } catch (err) {
      if (err instanceof CbsApiError && err.statusCode === 404) return null;
      throw err;
    }
  }

  // ─── KYC sync ─────────────────────────────────────────────────────────────────

  /**
   * Push le statut KYC vers le CBS (après approbation sur la plateforme).
   * Le CBS met à jour ses propres tables clients en conséquence.
   */
  async pushKycUpdate(payload: CbsKycUpdatePayload): Promise<{ acknowledged: boolean }> {
    return this.request<{ acknowledged: boolean }>(
      "POST",
      `/customers/${encodeURIComponent(payload.customerId)}/kyc-status`,
      payload,
    );
  }

  // ─── Account block / freeze ───────────────────────────────────────────────────

  /**
   * Gèle tous les comptes d'un client (SAR/STR validé).
   * Requiert une approbation dual-control préalable (ACPR art.13).
   */
  async blockCustomerAccounts(payload: CbsBlockPayload): Promise<CbsBlockResult> {
    return this.request<CbsBlockResult>(
      "POST",
      `/customers/${encodeURIComponent(payload.customerId)}/block`,
      payload,
    );
  }

  /**
   * Dégèle les comptes d'un client.
   */
  async unblockCustomerAccounts(customerId: string, reason: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      "POST",
      `/customers/${encodeURIComponent(customerId)}/unblock`,
      { reason },
    );
  }

  // ─── Transactions ─────────────────────────────────────────────────────────────

  /**
   * Récupère les transactions d'un compte (paginated).
   */
  async getTransactions(accountId: string, opts?: {
    page?:      number;
    limit?:     number;
    from?:      string;
    to?:        string;
    type?:      string;
    suspicious?: boolean;
  }): Promise<CbsTransactionList> {
    return this.request<CbsTransactionList>(
      "GET",
      `/accounts/${encodeURIComponent(accountId)}/transactions`,
      undefined,
      {
        page:      opts?.page ?? 1,
        limit:     opts?.limit ?? 50,
        from:      opts?.from,
        to:        opts?.to,
        type:      opts?.type,
        suspicious: opts?.suspicious,
      },
    );
  }

  /**
   * Récupère une transaction par son ID.
   */
  async getTransaction(transactionId: string): Promise<CbsTransaction> {
    return this.request<CbsTransaction>("GET", `/transactions/${encodeURIComponent(transactionId)}`);
  }

  // ─── Alerts ───────────────────────────────────────────────────────────────────

  /**
   * Envoie une alerte AML vers le CBS (notification interne).
   */
  async pushAlert(payload: CbsAlertPayload): Promise<{ alertId: string; received: boolean }> {
    return this.request<{ alertId: string; received: boolean }>(
      "POST",
      "/alerts",
      payload,
    );
  }

  // ─── Health ───────────────────────────────────────────────────────────────────

  /**
   * Vérifie la connectivité avec le CBS.
   */
  async ping(): Promise<{ status: "ok" | "degraded"; latencyMs: number }> {
    const start = Date.now();
    const resp = await this.request<{ status: string }>("GET", "/health");
    return {
      status:    resp.status === "ok" ? "ok" : "degraded",
      latencyMs: Date.now() - start,
    };
  }
}
