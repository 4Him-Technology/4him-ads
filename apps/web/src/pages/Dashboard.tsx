import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, Loader2, Plug } from "lucide-react";
import SeletorPeriodo, { PERIODOS, type ChavePeriodo } from "@/components/SeletorPeriodo";
import { fetchVisaoGerencial, type Periodo } from "@/lib/api";
import { brl, num } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Visão gerencial da 4Him Ads: como a agência inteira está no período.
 * Operação (verba, vendas) vem das plataformas; carteira e receita vêm
 * do nosso banco.
 */
export default function Dashboard() {
  const [chave, setChave] = useState<ChavePeriodo>("30d");
  const [periodo, setPeriodo] = useState<Periodo>(() => PERIODOS["30d"]());

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", periodo],
    queryFn: () => fetchVisaoGerencial(periodo),
  });

  const semDadosDePlataforma = !isLoading && (data?.verba ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Visão geral</h2>
          <p className="text-sm text-muted-foreground">
            Como a 4Him Ads está no período selecionado
          </p>
        </div>
        <SeletorPeriodo
          atual={chave}
          aoMudar={(c, p) => {
            setChave(c);
            setPeriodo(p);
          }}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {semDadosDePlataforma && (
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <Plug className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-sm text-foreground/80">
                Nenhuma conta de anúncios conectada ainda — por isso os números de operação
                estão zerados. Os dados de carteira e receita abaixo já são reais.
              </p>
            </div>
          )}

          {/* Operação */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Operação no período
            </h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Indicador rotulo="Verba investida" valor={brl(data?.verba)} />
              <Indicador rotulo="Vendas geradas" valor={brl(data?.receita)} destaque />
              <Indicador
                rotulo="Retorno (ROAS)"
                valor={`${(data?.roas ?? 0).toFixed(2)}x`}
                detalhe={data?.roas ? `cada R$1 virou ${brl(data.roas)}` : undefined}
              />
              <Indicador
                rotulo="Conversões"
                valor={num(data?.conversoes)}
                detalhe={data?.cpa ? `${brl(data.cpa)} por conversão` : undefined}
              />
            </div>
          </section>

          {/* Agência */}
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              A 4Him
            </h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Indicador rotulo="Receita recorrente" valor={brl(data?.mrr)} detalhe="por mês" destaque />
              <Indicador rotulo="Recebido no período" valor={brl(data?.recebido_periodo)} />
              <Indicador rotulo="A receber" valor={brl(data?.a_receber)} />
              <Indicador
                rotulo="Clientes ativos"
                valor={String(data?.clientes_ativos ?? 0)}
                detalhe={
                  data?.inadimplentes
                    ? `${data.inadimplentes} em atraso`
                    : `${data?.clientes_total ?? 0} na carteira`
                }
                alerta={Boolean(data?.inadimplentes)}
              />
            </div>
          </section>

          {/* Clientes */}
          <section className="rounded-xl border border-border bg-card">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Desempenho por cliente
              </h3>
              <Link to="/clientes" className="text-xs font-medium text-primary hover:underline">
                Ver todos
              </Link>
            </header>

            {!data?.clientes?.length ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                Nenhum cliente cadastrado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2 font-medium">Cliente</th>
                      <th className="px-5 py-2 text-right font-medium">Verba</th>
                      <th className="px-5 py-2 text-right font-medium">Vendas</th>
                      <th className="px-5 py-2 text-right font-medium">Retorno</th>
                      <th className="px-5 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.clientes.map((c) => {
                      const roas = c.verba > 0 ? c.receita / c.verba : 0;
                      return (
                        <tr key={c.id} className="transition hover:bg-muted/40">
                          <td className="px-5 py-3">
                            <Link
                              to={`/clientes/${c.id}`}
                              className="font-medium text-foreground hover:text-primary"
                            >
                              {c.name}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground">
                            {brl(c.verba)}
                          </td>
                          <td className="px-5 py-3 text-right text-muted-foreground">
                            {brl(c.receita)}
                          </td>
                          <td
                            className={cn(
                              "px-5 py-3 text-right font-medium",
                              roas >= 1 ? "text-emerald-600" : "text-muted-foreground",
                            )}
                          >
                            {roas ? `${roas.toFixed(2)}x` : "—"}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Link
                              to={`/clientes/${c.id}`}
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              Abrir <ArrowUpRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  destaque,
  alerta,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className={cn("mt-1 text-2xl font-bold", destaque ? "text-primary" : "text-foreground")}>
        {valor}
      </div>
      {detalhe && (
        <div
          className={cn(
            "mt-0.5 flex items-center gap-1 text-xs",
            alerta ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {alerta && <AlertTriangle className="h-3 w-3" />}
          {detalhe}
        </div>
      )}
    </div>
  );
}
