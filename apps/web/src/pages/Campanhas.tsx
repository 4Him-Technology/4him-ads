import { Megaphone } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Campanhas() {
  return (
    <ModulePage
      icon={Megaphone}
      title="Campanhas"
      description="Gestão de campanhas, conjuntos de anúncios e verba"
      planned={[
        "Árvore campanha → conjunto de anúncios → anúncio, sincronizada das plataformas",
        "Edição de verba, pausar e reativar direto do painel (Meta com escrita)",
        "Filtro por cliente, plataforma, status e período",
        "Toda ação de escrita registrada em audit_log",
      ]}
    />
  );
}
