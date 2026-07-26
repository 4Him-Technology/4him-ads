import { Bell } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Alertas() {
  return (
    <ModulePage
      icon={Bell}
      title="Alertas"
      description="Regras de anomalia e notificações"
      planned={[
        "Regras configuráveis: queda de ROAS, estouro de verba, CPA acima do alvo, campanha sem entrega",
        "Avaliação automática no sync diário das métricas",
        "Histórico de alertas disparados com status de tratamento",
        "Envio por e-mail e notificação no painel",
      ]}
    />
  );
}
