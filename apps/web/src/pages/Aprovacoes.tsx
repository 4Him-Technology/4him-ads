import { BadgeCheck } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Aprovacoes() {
  return (
    <ModulePage
      icon={BadgeCheck}
      title="Aprovações"
      description="Fluxo de aprovação de criativos e campanhas"
      planned={[
        "Status: pendente, aprovado, ajustes solicitados, reprovado",
        "Comentário obrigatório ao solicitar ajustes",
        "Trilha de auditoria de quem aprovou e quando",
        "Cliente aprova; a equipe 4Him executa",
      ]}
    />
  );
}
