/**
 * @kyc-lab/cbs-sdk — KYC Platform × Core Banking Integration
 *
 * Exports principaux :
 *   - KycCbsClient  : client HTTP typé
 *   - CbsApiError   : erreur API CBS
 *   - CbsTimeoutError : timeout
 *   - Types         : CbsCustomer, CbsTransaction, etc.
 */

export { KycCbsClient }   from "./client";
export { CbsApiError, CbsTimeoutError } from "./types";
export type {
  CbsClientConfig,
  CbsCustomer,
  CbsAddress,
  CbsAccount,
  CbsTransaction,
  CbsTransactionList,
  CbsKycUpdatePayload,
  CbsBlockPayload,
  CbsBlockResult,
  CbsAlertPayload,
} from "./types";
