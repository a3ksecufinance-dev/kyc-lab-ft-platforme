import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { trpc } from "../lib/trpc";
import {
  AlertTriangle, RefreshCw,
  Users, GitBranch, ZoomIn, ZoomOut, RotateCcw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeType = "customer" | "counterparty" | "ubo";
type EdgeType = "TX_FLOW" | "TX_REVERSE" | "SHARED_UBO" | "SHARED_EMAIL" | "SHARED_PHONE" | "SHARED_ADDR";

type GraphNode = {
  id: string; type: NodeType; label: string;
  customerId?: number; riskScore?: number; riskLevel?: string;
  pepStatus?: boolean; isSuspicious?: boolean;
  // Position calculée
  x?: number; y?: number;
};

type GraphEdge = {
  from: string; to: string; type: EdgeType;
  weight: number; count: number;
  currency?: string; suspicious?: boolean;
};

type NetworkGraph = {
  nodes: GraphNode[]; edges: GraphEdge[];
  clusters: string[][]; cycles: string[][];
  hubNodes: string[]; riskScore: number;
  stats: { nodeCount: number; edgeCount: number; clusterCount: number; cycleCount: number };
};

// ─── Layout force-directed simplifié ─────────────────────────────────────────

function applyForceLayout(nodes: GraphNode[], edges: GraphEdge[], W: number, H: number): GraphNode[] {
  const positioned = nodes.map((n, i) => ({
    ...n,
    x: W / 2 + Math.cos(2 * Math.PI * i / nodes.length) * Math.min(W, H) * 0.35,
    y: H / 2 + Math.sin(2 * Math.PI * i / nodes.length) * Math.min(W, H) * 0.35,
    vx: 0, vy: 0,
  }));

  type PNode = typeof positioned[0];
  const idx    = new Map<string, number>(positioned.map((n: PNode, i: number) => [n.id, i]));

  for (let iter = 0; iter < 60; iter++) {
    // Répulsion entre tous les nœuds
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i]!, b = positioned[j]!;
        const dx = a.x! - b.x!, dy = a.y! - b.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force = 3000 / (dist * dist);
        a.vx! += (dx / dist) * force;
        a.vy! += (dy / dist) * force;
        b.vx! -= (dx / dist) * force;
        b.vy! -= (dy / dist) * force;
      }
    }

    // Attraction des arêtes
    for (const edge of edges) {
      const i = idx.get(edge.from), j = idx.get(edge.to);
      if (i === undefined || j === undefined) continue;
      const a = positioned[i]!, b = positioned[j]!;
      const dx = b.x! - a.x!, dy = b.y! - a.y!;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      const target = 120;
      const force = (dist - target) * 0.05;
      a.vx! += (dx / dist) * force; a.vy! += (dy / dist) * force;
      b.vx! -= (dx / dist) * force; b.vy! -= (dy / dist) * force;
    }

    // Attirance vers le centre
    for (const n of positioned) {
      n.vx! += (W / 2 - n.x!) * 0.01;
      n.vy! += (H / 2 - n.y!) * 0.01;
    }

    // Appliquer avec amortissement
    const damp = 0.85;
    for (const n of positioned) {
      n.vx! *= damp; n.vy! *= damp;
      n.x! = Math.max(40, Math.min(W - 40, n.x! + n.vx!));
      n.y! = Math.max(40, Math.min(H - 40, n.y! + n.vy!));
    }
  }

  return positioned;
}

// ─── Couleurs des nœuds ───────────────────────────────────────────────────────

function nodeColor(node: GraphNode, isHub: boolean, inCycle: boolean): {
  fill: string; stroke: string; textColor: string;
} {
  if (inCycle)   return { fill: "#FF4444", stroke: "#FF0000", textColor: "#fff" };
  if (isHub)     return { fill: "#EF9F27", stroke: "#BA7517", textColor: "#412402" };
  if (node.pepStatus) return { fill: "#AFA9EC", stroke: "#534AB7", textColor: "#26215C" };
  if (node.riskLevel === "CRITICAL") return { fill: "#F09595", stroke: "#E24B4A", textColor: "#501313" };
  if (node.riskLevel === "HIGH")     return { fill: "#FAC775", stroke: "#EF9F27", textColor: "#412402" };
  if (node.type === "counterparty")  return { fill: "#9FE1CB", stroke: "#1D9E75", textColor: "#04342C" };
  if (node.type === "ubo")           return { fill: "#CECBF6", stroke: "#7F77DD", textColor: "#26215C" };
  return { fill: "#B5D4F4", stroke: "#378ADD", textColor: "#042C53" };
}

function edgeColor(edge: GraphEdge): string {
  if (edge.suspicious) return "#E24B4A";
  if (edge.type === "SHARED_UBO")   return "#7F77DD";
  if (edge.type === "SHARED_EMAIL") return "#1D9E75";
  if (edge.type === "SHARED_PHONE") return "#EF9F27";
  if (edge.type === "SHARED_ADDR")  return "#D85A30";
  return "#378ADD";
}

// ─── Canvas du graphe ─────────────────────────────────────────────────────────

function GraphCanvas({ graph, selected, onSelect }: {
  graph: NetworkGraph;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan]   = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const [positioned, setPositioned] = useState<GraphNode[]>([]);

  const W = 800, H = 500;

  useEffect(() => {
    if (graph.nodes.length > 0) {
      setPositioned(applyForceLayout(graph.nodes, graph.edges, W, H));
    }
  }, [graph.nodes.length, graph.edges.length]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || positioned.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const cycleNodeIds = new Set(graph.cycles.flat());
    type PosNode = typeof positioned[0];
    const nodeMap = new Map<string, PosNode>(positioned.map((n: PosNode) => [n.id, n]));

    // Dessiner les arêtes
    for (const edge of graph.edges) {
      const a = nodeMap.get(edge.from) as PosNode | undefined;
      const b = nodeMap.get(edge.to) as PosNode | undefined;
      if (!a?.x || !b?.x) continue;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y!);

      // Courbe légère si l'arête inverse existe
      const reverse = graph.edges.find(e => e.from === edge.to && e.to === edge.from);
      if (reverse) {
        const mx = (a.x + b.x) / 2 + (b.y! - a.y!) * 0.2;
        const my = (a.y! + b.y!) / 2 - (b.x - a.x) * 0.2;
        ctx.quadraticCurveTo(mx, my, b.x, b.y!);
      } else {
        ctx.lineTo(b.x, b.y!);
      }

      ctx.strokeStyle = edgeColor(edge);
      ctx.lineWidth   = edge.suspicious ? 2.5 : Math.min(3, 0.5 + Math.log(edge.count + 1));
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Flèche directionnelle
      if (edge.type === "TX_FLOW") {
        const dx = b.x - a.x, dy = b.y! - a.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const mx = a.x + dx * 0.6, my = a.y! + dy * 0.6;
        const size = 6;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - size * (dx - dy * 0.4) / dist, my - size * (dy + dx * 0.4) / dist);
        ctx.lineTo(mx - size * (dx + dy * 0.4) / dist, my - size * (dy - dx * 0.4) / dist);
        ctx.closePath();
        ctx.fillStyle = edgeColor(edge);
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Dessiner les nœuds
    for (const node of positioned) {
      if (!node.x) continue;
      const isHub     = graph.hubNodes.includes(node.id);
      const inCycle   = cycleNodeIds.has(node.id);
      const isSel     = selected === node.id;
      const { fill, stroke, textColor } = nodeColor(node, isHub, inCycle);
      const r = node.type === "customer" ? 20 : node.type === "ubo" ? 14 : 16;

      // Halo de sélection
      if (isSel) {
        ctx.beginPath();
        ctx.arc(node.x, node.y!, r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = "#58a6ff";
        ctx.lineWidth   = 2.5;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y!, r, 0, Math.PI * 2);
      ctx.fillStyle   = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = isSel ? 2 : 1;
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.font      = `${node.type === "customer" ? 600 : 400} 10px monospace`;
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = node.label.length > 14 ? node.label.slice(0, 13) + "…" : node.label;
      ctx.fillText(label, node.x, node.y!);
    }

    ctx.restore();
  }, [positioned, zoom, pan, selected, graph]);

  useEffect(() => { draw(); }, [draw]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx   = (e.clientX - rect.left - pan.x) / zoom;
    const cy   = (e.clientY - rect.top  - pan.y) / zoom;

    for (const node of positioned) {
      const dx = cx - (node.x ?? 0), dy = cy - (node.y ?? 0);
      if (Math.sqrt(dx * dx + dy * dy) < 22) {
        onSelect(selected === node.id ? null : node.id);
        return;
      }
    }
    onSelect(null);
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={W} height={H}
        onClick={handleClick}
        onMouseDown={(e: React.MouseEvent<HTMLCanvasElement>) =>
          setDragging({ startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y })}
        onMouseMove={(e: React.MouseEvent<HTMLCanvasElement>) => {
          if (!dragging) return;
          setPan({ x: dragging.panX + e.clientX - dragging.startX, y: dragging.panY + e.clientY - dragging.startY });
        }}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
        className="w-full rounded-lg bg-[#0d1117] border border-[#21262d] cursor-crosshair"
        style={{ height: H }}
      />

      {/* Contrôles zoom */}
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        {[
          { icon: ZoomIn,    action: () => setZoom((z: number) => Math.min(3, z * 1.3)) },
          { icon: ZoomOut,   action: () => setZoom((z: number) => Math.max(0.3, z / 1.3)) },
          { icon: RotateCcw, action: () => { setZoom(1); setPan({ x: 0, y: 0 }); } },
        ].map(({ icon: Icon, action }, i) => (
          <button key={i} onClick={action}
            className="p-1.5 bg-[#0d1117] border border-[#30363d] rounded text-[#7d8590] hover:text-[#e6edf3]">
            <Icon size={13} />
          </button>
        ))}
      </div>

      {/* Légende */}
      <div className="absolute bottom-3 left-3 flex gap-3 flex-wrap">
        {[
          { color: "#B5D4F4", label: "Client" },
          { color: "#9FE1CB", label: "Contrepartie" },
          { color: "#CECBF6", label: "UBO" },
          { color: "#EF9F27", label: "Hub suspect" },
          { color: "#FF4444", label: "Dans un cycle" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-[10px] font-mono text-[#7d8590]">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function NetworkPage() {
  const [customerId, setCustomerId] = useState("");
  const [maxDepth, setMaxDepth]     = useState(2);
  const [selected, setSelected]     = useState<string | null>(null);
  const [tab, setTab]               = useState<"graph" | "clusters" | "paths">("graph");
  const [toId, setToId]             = useState("");

  const enabled = !!customerId && !isNaN(parseInt(customerId));

  const { data: graph, isLoading, refetch, isFetching } = trpc.network.graph.useQuery(
    { customerId: parseInt(customerId), maxDepth },
    { enabled, refetchOnWindowFocus: false }
  );

  const { data: clusters } = trpc.network.suspectClusters.useQuery(
    { minClusterSize: 3, minTxCount: 3 },
    { enabled: tab === "clusters" }
  );

  const { data: paths } = trpc.network.findPaths.useQuery(
    {
      fromCustomerId: parseInt(customerId),
      toCustomerId:   parseInt(toId),
      maxDepth,
    },
    { enabled: tab === "paths" && enabled && !!toId && !isNaN(parseInt(toId)) }
  );

  const { data: stats } = trpc.network.networkStats.useQuery();

  const g = graph as NetworkGraph | undefined;
  const selectedNode = g?.nodes.find(n => n.id === selected);

  const inputCls = "bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-xs font-mono text-[#e6edf3] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]/40";

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[#e6edf3] font-mono">Analyse réseau</h1>
        <p className="text-xs font-mono text-[#7d8590] mt-0.5">
          Graph traversal · Détection de clusters · Cycles de blanchiment
        </p>
      </div>

      {/* Stats globales */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Clients connectés", value: stats.connected_customers },
            { label: "Contreparties uniques", value: stats.unique_counterparties },
            { label: "Transactions suspectes", value: stats.suspicious_tx },
            { label: "UBOs enregistrés", value: stats.total_ubos },
          ].map(({ label, value }) => (
            <div key={label} className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3">
              <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase">{label}</p>
              <p className="text-xl font-semibold font-mono text-[#e6edf3] mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-0 border-b border-[#21262d] mb-5">
        {([["graph", "Graphe réseau"], ["clusters", "Clusters suspects"], ["paths", "Trouver un chemin"]] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-mono border-b-2 transition-colors ${
              tab === t ? "border-[#58a6ff] text-[#58a6ff]" : "border-transparent text-[#7d8590] hover:text-[#e6edf3]"
            }`}>{label}</button>
        ))}
      </div>

      {/* ── Onglet Graphe ── */}
      {tab === "graph" && (
        <div className="space-y-4">
          {/* Contrôles */}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-32">
              <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">ID Client</label>
              <input value={customerId}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setCustomerId(e.target.value)}
                placeholder="42" type="number" className={inputCls + " w-full"} />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Profondeur</label>
              <select value={maxDepth}
                onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setMaxDepth(parseInt(e.target.value))}
                className={inputCls}>
                {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d} niveaux</option>)}
              </select>
            </div>
            <button onClick={() => refetch()} disabled={!enabled || isFetching}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono bg-[#1f6feb]/20 border border-[#1f6feb]/30 text-[#58a6ff] hover:bg-[#1f6feb]/30 rounded-md disabled:opacity-40">
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
              {isLoading ? "Analyse…" : "Analyser"}
            </button>
          </div>

          {/* Graphe + résumé */}
          {isLoading && (
            <div className="h-64 bg-[#0d1117] border border-[#21262d] rounded-lg animate-pulse flex items-center justify-center">
              <p className="text-xs font-mono text-[#484f58]">Construction du graphe…</p>
            </div>
          )}

          {g && !isLoading && (
            <>
              {/* Score de risque réseau */}
              {g.riskScore > 0 && (
                <div className={`flex items-center gap-3 p-3 rounded-lg border text-xs font-mono ${
                  g.riskScore >= 70 ? "bg-red-400/10 border-red-400/20 text-red-400"
                  : g.riskScore >= 40 ? "bg-amber-400/10 border-amber-400/20 text-amber-400"
                  : "bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
                }`}>
                  <AlertTriangle size={14} />
                  Score de risque réseau : {g.riskScore}/100
                  {g.cycles.length > 0 && ` · ${g.cycles.length} cycle(s) détecté(s)`}
                  {g.clusters.length > 0 && ` · ${g.clusters.length} cluster(s)`}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {/* Canvas graphe */}
                <div className="lg:col-span-3">
                  <GraphCanvas graph={g} selected={selected} onSelect={setSelected} />
                </div>

                {/* Panel latéral */}
                <div className="space-y-3">
                  {/* Stats du graphe */}
                  <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-3 space-y-2">
                    <p className="text-[10px] font-mono text-[#7d8590] tracking-widest uppercase">Réseau</p>
                    {[
                      ["Nœuds", g.stats.nodeCount],
                      ["Arêtes", g.stats.edgeCount],
                      ["Clusters", g.stats.clusterCount],
                      ["Cycles", g.stats.cycleCount],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between text-xs font-mono">
                        <span className="text-[#484f58]">{String(label)}</span>
                        <span className={`font-medium ${
                          label === "Cycles" && Number(val) > 0 ? "text-red-400" : "text-[#e6edf3]"
                        }`}>{String(val)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Nœud sélectionné */}
                  {selectedNode && (
                    <div className="bg-[#0d1117] border border-[#58a6ff]/30 rounded-lg p-3 space-y-2">
                      <p className="text-[10px] font-mono text-[#58a6ff] tracking-widest uppercase">Sélectionné</p>
                      <p className="text-xs font-mono text-[#e6edf3] font-medium">{selectedNode.label}</p>
                      <p className="text-[10px] font-mono text-[#484f58]">{selectedNode.type}</p>
                      {selectedNode.riskLevel && (
                        <p className="text-[10px] font-mono text-amber-400">Risque : {selectedNode.riskLevel}</p>
                      )}
                      {selectedNode.pepStatus && (
                        <p className="text-[10px] font-mono text-purple-400">⚠ PEP</p>
                      )}
                      {selectedNode.customerId && (
                        <a href={`/customers/${selectedNode.customerId}`}
                          className="block text-[10px] font-mono text-[#58a6ff] hover:underline mt-1">
                          Voir la fiche client →
                        </a>
                      )}
                    </div>
                  )}

                  {/* Cycles détectés */}
                  {g.cycles.length > 0 && (
                    <div className="bg-red-400/5 border border-red-400/20 rounded-lg p-3 space-y-2">
                      <p className="text-[10px] font-mono text-red-400 tracking-widest uppercase">
                        {g.cycles.length} cycle(s) détecté(s)
                      </p>
                      {g.cycles.slice(0, 3).map((cycle, i) => (
                        <div key={i} className="text-[10px] font-mono text-[#7d8590]">
                          {cycle.map(id => {
                            const n = g.nodes.find(n => n.id === id);
                            return n?.label.slice(0, 10) ?? id;
                          }).join(" → ")} → ↩
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Onglet Clusters ── */}
      {tab === "clusters" && (
        <div className="space-y-3">
          <p className="text-xs font-mono text-[#7d8590]">
            Groupes de clients fortement interconnectés — indicateur potentiel de smurfing ou de comptes mules.
          </p>
          {!clusters?.clusters.length ? (
            <div className="text-center py-12 bg-[#0d1117] border border-[#21262d] rounded-lg">
              <Users size={28} className="text-[#30363d] mx-auto mb-2" />
              <p className="text-xs font-mono text-[#484f58]">
                Aucun cluster suspect détecté (critères : ≥ 3 clients, ≥ 3 transactions croisées)
              </p>
            </div>
          ) : (
            clusters.clusters.map((cluster: { size: number; customerIds: number[]; hasSuspicious: boolean; totalAmount: number; links: unknown[] }, i: number) => (
              <div key={i} className={`bg-[#0d1117] border rounded-lg p-4 ${
                cluster.hasSuspicious ? "border-red-400/20" : "border-[#21262d]"
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#484f58]">Cluster #{i + 1}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#161b22] border border-[#30363d] rounded">
                      {cluster.size} entités
                    </span>
                    {cluster.hasSuspicious && (
                      <span className="text-[10px] font-mono text-red-400 flex items-center gap-1">
                        <AlertTriangle size={10} /> Transactions suspectes
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-[#7d8590]">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
                      .format(cluster.totalAmount)} total
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {cluster.customerIds.map((id: number) => (
                    <button key={id}
                      onClick={() => { setTab("graph"); setCustomerId(String(id)); }}
                      className="text-[10px] font-mono text-[#58a6ff] hover:underline bg-[#1f6feb]/10 border border-[#1f6feb]/20 px-2 py-1 rounded">
                      Client #{id}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Onglet Chemins ── */}
      {tab === "paths" && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1">
              <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Client source</label>
              <input value={customerId} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setCustomerId(e.target.value)}
                placeholder="ID client A" type="number" className={inputCls + " w-full"} />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-mono text-[#7d8590] tracking-widest uppercase mb-1.5">Client destination</label>
              <input value={toId} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setToId(e.target.value)}
                placeholder="ID client B" type="number" className={inputCls + " w-full"} />
            </div>
          </div>

          {paths && (
            <div className="space-y-3">
              <p className="text-xs font-mono text-[#7d8590]">{paths.message}</p>
              {paths.paths.map((path: { nodes: { id: string; type: string; label: string }[]; length: number; suspicious: boolean }, i: number) => (
                <div key={i} className={`bg-[#0d1117] border rounded-lg p-4 ${
                  path.suspicious ? "border-amber-400/20" : "border-[#21262d]"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch size={12} className="text-[#484f58]" />
                    <span className="text-[10px] font-mono text-[#7d8590]">
                      Chemin {i + 1} — {path.length} saut(s)
                    </span>
                    {path.suspicious && (
                      <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1">
                        <AlertTriangle size={10} /> Nœud suspect
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {path.nodes.map((node: { id: string; type: string; label: string }, j: number) => (
                      <span key={j} className="flex items-center gap-1">
                        <span className={`text-[10px] font-mono px-2 py-1 rounded border ${
                          node.type === "customer" ? "border-[#378ADD]/30 text-[#58a6ff] bg-[#1f6feb]/10" :
                          "border-[#1D9E75]/30 text-emerald-400 bg-emerald-400/10"
                        }`}>{node.label.slice(0, 15)}</span>
                        {j < path.nodes.length - 1 && <span className="text-[#484f58] text-xs">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
