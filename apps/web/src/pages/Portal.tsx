import { Eye } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Portal() {
  return (
    <ModulePage
      icon={Eye}
      title="Visão do Cliente"
      description="Prévia do que o cliente vê no portal"
      planned={[
        "Dashboard simplificado com os resultados do próprio cliente",
        "Acompanhamento do que a equipe 4Him está executando",
        "Fila de aprovações pendentes de criativos e campanhas",
        "Isolamento garantido por RLS (client_access)",
      ]}
    />
  );
}
