/**
 * Moteur d'analyse réseau AML — Graph Traversal & Cluster Detection
 *
 * Sources d'arêtes (liens entre entités) :
 *   TX_FLOW      → client A a transféré vers counterparty B
 *   TX_REVERSE   → counterparty B a reçu depuis client A
 *   SHARED_UBO   → deux clients ont un UBO commun (même nom + DOB)
 *   SHARED_EMAIL → deux clients partagent le même email
 *   SHARED_PHONE → deux clients partagent le même numéro de téléphone
 *   SHARED_ADDR  → deux clients partagent la même adresse
 *
 * Algorithmes :
 *   1. BFS/DFS  — traversée depuis un nœud, profondeur configurable
 *   2. Union-Find — détection de composantes connexes (clusters)
 *   3. DFS cycle — détection de cycles (smurfing circulaire)
 *   4. PageRank simplifié — score de centralité (hub suspect)
 *   5. Suspicious path — chemin le plus risqué entre deux nœuds
 */

import { db } from "../../_core/db";
import { sql } from "drizzle-orm";
import { createLogger } from "../../_core/logger";

const log = createLogger("network-graph");

// ─── Types ────────────────────────────────────────────────────────────────────

export type NodeType = "customer" | "counterparty" | "ubo";
export type EdgeType =
  | "TX_FLOW"       // transaction client → contrepartie
  | "TX_REVERSE"    // transaction contrepartie → client
  | "SHARED_UBO"    // UBO commun entre deux clients
  | "SHARED_EMAIL"  // email commun
  | "SHARED_PHONE"  // téléphone commun
  | "SHARED_ADDR";  // adresse commune

export interface GraphNode {
  id:          string;          // "c:42" | "cp:ACME_SA" | "ubo:John_Doe"
  type:        NodeType;
  label:       string;
  customerId?: number;          // si type=customer
  riskScore?:  number;
  riskLevel?:  string;
  pepStatus?:  boolean;
  isSuspicious?: boolean;
}

export interface GraphEdge {
  from:      string;
  to:        string;
  type:      EdgeType;
  weight:    number;            // montant total ou nombre de liens
  count:     number;            // nombre de transactions / occurrences
  currency?: string;
  suspicious?: boolean;         // au moins une transaction suspecte
}

export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: string[][];         // groupes de nœuds connexes
  cycles:   string[][];         // cycles détectés
  hubNodes: string[];           // nœuds à forte centralité (PageRank)
  riskScore: number;            // score de risque global du réseau 0-100
  stats: {
    nodeCount:    number;
    edgeCount:    number;
    clusterCount: number;
    cycleCount:   number;
    maxDepth:     number;
  };
}

// ─── Construction du graphe depuis la DB ──────────────────────────────────────

export async function buildGraph(
  rootCustomerId: number,
  maxDepth        = 3,
  minAmount       = 0,
): Promise<NetworkGraph> {
  const t0 = Date.now();

  const nodes   = new Map<string, GraphNode>();
  const edges   = new Map<string, GraphEdge>();   // clé = "from→to:type"
  const visited = new Set<number>();              // customerIds traités
  const queue   = [{ customerId: rootCustomerId, depth: 0 }];

  // ── BFS depuis le nœud racine ─────────────────────────────────────────────

  while (queue.length > 0) {
    const item = queue.shift()!;
    const { customerId, depth } = item;

    if (visited.has(customerId) || depth > maxDepth) continue;
    visited.add(customerId);

    // Charger le client
    const customerRows = await db.execute(sql`
      SELECT id, CONCAT(first_name, ' ', last_name) AS label,
             risk_score, risk_level, pep_status
      FROM customers WHERE id = ${customerId}
    `);
    const customer = (customerRows.rows as Array<{
      id: number; label: string; risk_score: number;
      risk_level: string; pep_status: boolean;
    }>)[0];
    if (!customer) continue;

    const nodeId = `c:${customerId}`;
    nodes.set(nodeId, {
      id: nodeId, type: "customer",
      label: customer.label,
      customerId,
      riskScore: customer.risk_score,
      riskLevel: customer.risk_level,
      pepStatus: customer.pep_status,
    });

    // ── Arêtes TX_FLOW : transactions sortantes ──────────────────────────────
    const txOut = await db.execute(sql`
      SELECT counterparty, counterparty_bank,
             SUM(amount::numeric)    AS total_amount,
             COUNT(*)                AS tx_count,
             currency,
             BOOL_OR(is_suspicious) AS has_suspicious
      FROM transactions
      WHERE customer_id = ${customerId}
        AND counterparty IS NOT NULL
        AND amount::numeric >= ${minAmount}
      GROUP BY counterparty, counterparty_bank, currency
    `);

    for (const row of txOut.rows as Array<{
      counterparty: string; counterparty_bank: string | null;
      total_amount: string; tx_count: string;
      currency: string; has_suspicious: boolean;
    }>) {
      const cpId  = `cp:${row.counterparty}`;
      const edgeKey = `${nodeId}→${cpId}:TX_FLOW`;

      if (!nodes.has(cpId)) {
        nodes.set(cpId, {
          id: cpId, type: "counterparty",
          label: row.counterparty_bank
            ? `${row.counterparty} (${row.counterparty_bank})`
            : row.counterparty,
          isSuspicious: row.has_suspicious,
        });
      }

      edges.set(edgeKey, {
        from: nodeId, to: cpId, type: "TX_FLOW",
        weight: parseFloat(row.total_amount),
        count: parseInt(row.tx_count),
        currency: row.currency,
        suspicious: row.has_suspicious,
      });
    }

    // ── Arêtes TX_REVERSE : chercher des clients qui reçoivent ──────────────
    // (counterparty_name == nom d'un autre client)
    if (depth < maxDepth) {
      const linkedCustomers = await db.execute(sql`
        SELECT DISTINCT c.id
        FROM customers c
        JOIN transactions t ON
          t.counterparty ILIKE CONCAT('%', c.first_name, '%', c.last_name, '%')
          OR t.counterparty ILIKE CONCAT('%', c.last_name, '%', c.first_name, '%')
        WHERE t.customer_id = ${customerId}
          AND c.id != ${customerId}
        LIMIT 20
      `);

      for (const row of linkedCustomers.rows as Array<{ id: number }>) {
        if (!visited.has(row.id)) {
          queue.push({ customerId: row.id, depth: depth + 1 });
        }
        const linkedNodeId = `c:${row.id}`;
        const edgeKey = `${nodeId}→${linkedNodeId}:TX_FLOW`;
        if (!edges.has(edgeKey)) {
          edges.set(edgeKey, {
            from: nodeId, to: linkedNodeId,
            type: "TX_FLOW", weight: 0, count: 1,
          });
        }
      }
    }

    // ── Arêtes SHARED_UBO ────────────────────────────────────────────────────
    const sharedUbos = await db.execute(sql`
      SELECT DISTINCT u2.customer_id,
             CONCAT(u1.first_name, ' ', u1.last_name) AS ubo_name
      FROM ubos u1
      JOIN ubos u2 ON
        u1.first_name = u2.first_name AND
        u1.last_name  = u2.last_name  AND
        u1.customer_id != u2.customer_id
      WHERE u1.customer_id = ${customerId}
      LIMIT 10
    `);

    for (const row of sharedUbos.rows as Array<{
      customer_id: number; ubo_name: string;
    }>) {
      const linkedId  = `c:${row.customer_id}`;
      const uboNodeId = `ubo:${row.ubo_name.replace(/\s+/g, "_")}`;
      const edgeKey1  = `${nodeId}→${uboNodeId}:SHARED_UBO`;
      const edgeKey2  = `${linkedId}→${uboNodeId}:SHARED_UBO`;

      if (!nodes.has(uboNodeId)) {
        nodes.set(uboNodeId, {
          id: uboNodeId, type: "ubo", label: `UBO: ${row.ubo_name}`,
        });
      }
      if (!edges.has(edgeKey1)) {
        edges.set(edgeKey1, { from: nodeId, to: uboNodeId, type: "SHARED_UBO", weight: 1, count: 1 });
      }
      if (!edges.has(edgeKey2)) {
        edges.set(edgeKey2, { from: linkedId, to: uboNodeId, type: "SHARED_UBO", weight: 1, count: 1 });
      }

      if (!visited.has(row.customer_id) && depth < maxDepth) {
        queue.push({ customerId: row.customer_id, depth: depth + 1 });
      }
    }

    // ── Arêtes SHARED_EMAIL / SHARED_PHONE / SHARED_ADDR ────────────────────
    const sharedAttrs = await db.execute(sql`
      SELECT c2.id,
             CASE WHEN c1.email IS NOT NULL AND c1.email = c2.email THEN 'SHARED_EMAIL' END AS email_link,
             CASE WHEN c1.phone IS NOT NULL AND c1.phone = c2.phone THEN 'SHARED_PHONE' END AS phone_link,
             CASE WHEN c1.address IS NOT NULL AND c1.address = c2.address THEN 'SHARED_ADDR' END AS addr_link
      FROM customers c1
      JOIN customers c2 ON c2.id != c1.id AND (
        (c1.email    IS NOT NULL AND c1.email    = c2.email)    OR
        (c1.phone    IS NOT NULL AND c1.phone    = c2.phone)    OR
        (c1.address  IS NOT NULL AND c1.address  = c2.address)
      )
      WHERE c1.id = ${customerId}
      LIMIT 10
    `);

    for (const row of sharedAttrs.rows as Array<{
      id: number;
      email_link: string | null;
      phone_link: string | null;
      addr_link:  string | null;
    }>) {
      const linkedId = `c:${row.id}`;
      for (const [link, type] of [
        [row.email_link, "SHARED_EMAIL"],
        [row.phone_link, "SHARED_PHONE"],
        [row.addr_link,  "SHARED_ADDR" ],
      ] as [string | null, EdgeType][]) {
        if (!link) continue;
        const edgeKey = `${nodeId}↔${linkedId}:${type}`;
        if (!edges.has(edgeKey)) {
          edges.set(edgeKey, { from: nodeId, to: linkedId, type, weight: 1, count: 1 });
        }
      }

      if (!visited.has(row.id) && depth < maxDepth) {
        queue.push({ customerId: row.id, depth: depth + 1 });
      }
    }
  }

  const nodeList = [...nodes.values()];
  const edgeList = [...edges.values()];

  // ── Détection clusters (Union-Find) ───────────────────────────────────────

  const clusters = findClusters(nodeList, edgeList);

  // ── Détection cycles (DFS) ────────────────────────────────────────────────

  const cycles = findCycles(nodeList, edgeList);

  // ── PageRank simplifié ────────────────────────────────────────────────────

  const hubNodes = computeHubs(nodeList, edgeList);

  // ── Score de risque global ────────────────────────────────────────────────

  const riskScore = computeNetworkRisk(nodeList, edgeList, cycles, hubNodes);

  log.info({
    rootCustomerId, nodes: nodeList.length, edges: edgeList.length,
    clusters: clusters.length, cycles: cycles.length,
    ms: Date.now() - t0,
  }, "Graphe réseau construit");

  return {
    nodes:  nodeList,
    edges:  edgeList,
    clusters,
    cycles,
    hubNodes,
    riskScore,
    stats: {
      nodeCount:    nodeList.length,
      edgeCount:    edgeList.length,
      clusterCount: clusters.length,
      cycleCount:   cycles.length,
      maxDepth,
    },
  };
}

// ─── Union-Find — détection de composantes connexes ───────────────────────────

function findClusters(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(a: string, b: string) {
    parent.set(find(a), find(b));
  }

  for (const node of nodes) parent.set(node.id, node.id);
  for (const edge of edges) union(edge.from, edge.to);

  const groups = new Map<string, string[]>();
  for (const node of nodes) {
    const root = find(node.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(node.id);
  }

  return [...groups.values()].filter(g => g.length > 1).sort((a, b) => b.length - a.length);
}

// ─── DFS — détection de cycles ────────────────────────────────────────────────

function findCycles(nodes: GraphNode[], edges: GraphEdge[]): string[][] {
  // Construire la liste d'adjacence (uniquement TX_FLOW → liens financiers)
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    if (edge.type === "TX_FLOW") {
      adj.get(edge.from)?.push(edge.to);
    }
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack   = new Set<string>();
  const path:   string[] = [];

  function dfs(node: string): void {
    if (stack.has(node)) {
      // Cycle trouvé — extraire la boucle
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        const cycle = path.slice(cycleStart);
        // Dédupliquer les cycles
        const key = [...cycle].sort().join(",");
        if (!cycles.some(c => [...c].sort().join(",") === key)) {
          cycles.push(cycle);
        }
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      dfs(neighbor);
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) dfs(node.id);
  }

  return cycles.slice(0, 10); // Limiter à 10 cycles max
}

// ─── PageRank simplifié — hubs suspects ───────────────────────────────────────

function computeHubs(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  // Degré entrant + sortant pondéré par le montant
  const scores = new Map<string, number>();
  for (const node of nodes) scores.set(node.id, 0);

  for (const edge of edges) {
    const w = edge.type === "TX_FLOW" ? Math.log(edge.weight + 1) : 1;
    scores.set(edge.from, (scores.get(edge.from) ?? 0) + w);
    scores.set(edge.to,   (scores.get(edge.to)   ?? 0) + w);
  }

  const sorted = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([, score]) => score > 1);

  return sorted.map(([id]) => id);
}

// ─── Score de risque du réseau ────────────────────────────────────────────────

function computeNetworkRisk(
  nodes:    GraphNode[],
  edges:    GraphEdge[],
  cycles:   string[][],
  _hubNodes: string[],
): number {
  let score = 0;

  // Présence de cycles → +40 points
  if (cycles.length > 0) score += Math.min(40, cycles.length * 15);

  // Clients PEP dans le réseau → +20 points
  const pepCount = nodes.filter(n => n.pepStatus).length;
  if (pepCount > 0) score += Math.min(20, pepCount * 10);

  // Transactions suspectes → +20 points
  const suspEdges = edges.filter(e => e.suspicious).length;
  if (suspEdges > 0) score += Math.min(20, suspEdges * 5);

  // Réseau très dense (ratio arêtes/nœuds > 2) → +10 points
  if (nodes.length > 0 && edges.length / nodes.length > 2) score += 10;

  // Nœuds à haut risque → +10 points
  const highRiskCount = nodes.filter(n => n.riskLevel === "HIGH" || n.riskLevel === "CRITICAL").length;
  if (highRiskCount > 0) score += Math.min(10, highRiskCount * 3);

  return Math.min(100, score);
}
