import { z } from "zod";
import { router, analystProc, supervisorProc } from "../../_core/trpc";
import { buildGraph, findRiskPath } from "./network.graph";
import { db } from "../../_core/db";
import { sql } from "drizzle-orm";

// log = createLogger("network-router"); // réservé pour debug

export const networkRouter = router({

  /**
   * Graphe complet depuis un client — analyst+
   * Retourne nœuds, arêtes, clusters, cycles, hubs
   */
  graph: analystProc
    .input(z.object({
      customerId: z.number().int().positive(),
      maxDepth:   z.number().int().min(1).max(5).default(2),
      minAmount:  z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return buildGraph(input.customerId, input.maxDepth, input.minAmount);
    }),

  /**
   * Clusters suspects — tous les clients du système — supervisor+
   * Groupes de clients fortement interconnectés (> N liens)
   */
  suspectClusters: supervisorProc
    .input(z.object({
      minClusterSize: z.number().int().min(2).default(3),
      minTxCount:     z.number().int().min(1).default(5),
    }))
    .query(async ({ input }) => {
      // Requête SQL : trouver les paires de clients avec beaucoup de transactions croisées
      const rows = await db.execute(sql`
        WITH tx_pairs AS (
          SELECT
            t.customer_id                                    AS from_id,
            c2.id                                           AS to_id,
            COUNT(*)                                        AS tx_count,
            SUM(t.amount::numeric)                          AS total_amount,
            BOOL_OR(t.is_suspicious)                        AS has_suspicious
          FROM transactions t
          JOIN customers c2 ON (
            t.counterparty ILIKE CONCAT('%', c2.first_name, '%', c2.last_name, '%')
          )
          WHERE t.customer_id != c2.id
          GROUP BY t.customer_id, c2.id
          HAVING COUNT(*) >= ${input.minTxCount}
        )
        SELECT
          p.from_id, p.to_id, p.tx_count, p.total_amount, p.has_suspicious,
          cf.first_name || ' ' || cf.last_name AS from_name,
          ct.first_name || ' ' || ct.last_name AS to_name,
          cf.risk_level AS from_risk, ct.risk_level AS to_risk
        FROM tx_pairs p
        JOIN customers cf ON cf.id = p.from_id
        JOIN customers ct ON ct.id = p.to_id
        ORDER BY p.tx_count DESC, p.has_suspicious DESC
        LIMIT 50
      `);

      // Grouper en clusters avec Union-Find
      type Row = {
        from_id: number; to_id: number; tx_count: number;
        total_amount: string; has_suspicious: boolean;
        from_name: string; to_name: string;
        from_risk: string; to_risk: string;
      };

      const pairs   = rows.rows as Row[];
      const parent  = new Map<number, number>();

      function find(x: number): number {
        if (!parent.has(x)) parent.set(x, x);
        if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
        return parent.get(x)!;
      }

      for (const p of pairs) {
        const ra = find(p.from_id), rb = find(p.to_id);
        if (ra !== rb) parent.set(ra, rb);
      }

      const groups = new Map<number, Set<number>>();
      for (const p of pairs) {
        const root = find(p.from_id);
        if (!groups.has(root)) groups.set(root, new Set());
        groups.get(root)!.add(p.from_id);
        groups.get(root)!.add(p.to_id);
      }

      const clusters = [...groups.values()]
        .filter(g => g.size >= input.minClusterSize)
        .map(g => ({
          customerIds:   [...g],
          size:          g.size,
          links:         pairs.filter(p => g.has(p.from_id) && g.has(p.to_id)),
          hasSuspicious: pairs.some(p => g.has(p.from_id) && p.has_suspicious),
          totalAmount:   pairs
            .filter(p => g.has(p.from_id) && g.has(p.to_id))
            .reduce((s, p) => s + parseFloat(p.total_amount), 0),
        }))
        .sort((a, b) => b.size - a.size || b.totalAmount - a.totalAmount);

      return { clusters, totalPairs: pairs.length };
    }),

  /**
   * Chemins suspects entre deux clients — analyst+
   * Trouve tous les chemins transactionnels de A vers B (BFS)
   */
  findPaths: analystProc
    .input(z.object({
      fromCustomerId: z.number().int().positive(),
      toCustomerId:   z.number().int().positive(),
      maxDepth:       z.number().int().min(1).max(4).default(3),
    }))
    .query(async ({ input }) => {
      const { fromCustomerId, toCustomerId, maxDepth } = input;

      if (fromCustomerId === toCustomerId) {
        return { paths: [], message: "Source et destination identiques" };
      }

      // BFS pour trouver les chemins
      const graph = await buildGraph(fromCustomerId, maxDepth, 0);
      const fromId = `c:${fromCustomerId}`;
      const toId   = `c:${toCustomerId}`;

      if (!graph.nodes.some(n => n.id === toId)) {
        return {
          paths: [],
          message: `Client #${toCustomerId} non trouvé dans le réseau de #${fromCustomerId} (profondeur ${maxDepth})`,
        };
      }

      // Construire la liste d'adjacence
      const adj = new Map<string, string[]>();
      for (const node of graph.nodes) adj.set(node.id, []);
      for (const edge of graph.edges) {
        adj.get(edge.from)?.push(edge.to);
      }

      // BFS pour tous les chemins
      const paths: string[][] = [];
      const queue: string[][] = [[fromId]];

      while (queue.length > 0 && paths.length < 5) {
        const path = queue.shift()!;
        const last = path[path.length - 1]!;

        if (last === toId) {
          paths.push(path);
          continue;
        }
        if (path.length > maxDepth + 1) continue;

        for (const neighbor of adj.get(last) ?? []) {
          if (!path.includes(neighbor)) {
            queue.push([...path, neighbor]);
          }
        }
      }

      // Enrichir les chemins avec les labels
      const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
      const enriched = paths.map(path => ({
        nodes:    path.map(id => nodeMap.get(id) ?? { id, type: "counterparty" as const, label: id }),
        length:   path.length - 1,
        suspicious: path.some(id => {
          const node = nodeMap.get(id);
          return node?.isSuspicious || node?.pepStatus;
        }),
      }));

      return {
        paths: enriched.sort((a, b) => a.length - b.length),
        message: paths.length === 0
          ? "Aucun chemin direct trouvé"
          : `${paths.length} chemin(s) trouvé(s)`,
      };
    }),

  /**
   * Chemin le plus risqué entre deux clients (Dijkstra pondéré) — analyst+
   * Contrairement à findPaths (BFS hop-count), ici le chemin minimise
   * la "distance de risque" : gros montants suspects = chemin préféré.
   */
  riskPath: analystProc
    .input(z.object({
      fromCustomerId: z.number().int().positive(),
      toCustomerId:   z.number().int().positive(),
      maxDepth:       z.number().int().min(1).max(4).default(3),
      minAmount:      z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const { fromCustomerId, toCustomerId, maxDepth, minAmount } = input;

      if (fromCustomerId === toCustomerId) {
        return { path: null, message: "Source et destination identiques" };
      }

      const graph  = await buildGraph(fromCustomerId, maxDepth, minAmount);
      const fromId = `c:${fromCustomerId}`;
      const toId   = `c:${toCustomerId}`;

      const result = findRiskPath(graph.nodes, graph.edges, fromId, toId);
      if (!result) {
        return {
          path:    null,
          message: `Aucun chemin trouvé entre #${fromCustomerId} et #${toCustomerId} (profondeur ${maxDepth})`,
        };
      }

      const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
      const edgeMap = new Map(
        graph.edges.map(e => [`${e.from}→${e.to}`, e])
      );

      return {
        path: {
          nodes: result.path.map(id => nodeMap.get(id) ?? { id, type: "counterparty" as const, label: id }),
          edges: result.path.slice(1).map((id, i) => edgeMap.get(`${result.path[i]}→${id}`) ?? null).filter(Boolean),
          riskScore:   result.riskScore,
          totalAmount: result.totalAmount,
          hops:        result.hops,
        },
        message: `Chemin le plus risqué : ${result.hops} saut(s) · risque ${result.riskScore}/100`,
      };
    }),

  /**
   * Statistiques globales du réseau — analyst+
   */
  networkStats: analystProc
    .query(async () => {
      const result = await db.execute(sql`
        SELECT
          (SELECT COUNT(DISTINCT customer_id) FROM transactions
           WHERE counterparty IS NOT NULL)           AS connected_customers,
          (SELECT COUNT(DISTINCT counterparty) FROM transactions
           WHERE counterparty IS NOT NULL)           AS unique_counterparties,
          (SELECT COUNT(*) FROM transactions
           WHERE is_suspicious = true)               AS suspicious_tx,
          (SELECT COUNT(*) FROM ubos)                AS total_ubos
      `);

      return result.rows[0] as {
        connected_customers: string;
        unique_counterparties: string;
        suspicious_tx: string;
        total_ubos: string;
      };
    }),
});
