import { Settings } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Configuracoes() {
  return (
    <ModulePage
      icon={Settings}
      title="Configurações"
      description="Preferências da organização"
      planned={[
        "Dados da agência, logo e identidade (base do white-label)",
        "Moeda e fuso horário padrão dos novos clientes",
        "Horário do sync diário de métricas",
        "Feature flags — escrita nas plataformas fica atrás de flag até o App Review",
      ]}
    />
  );
}
