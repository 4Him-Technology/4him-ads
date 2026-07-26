import { ListChecks } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Tarefas() {
  return (
    <ModulePage
      icon={ListChecks}
      title="Tarefas"
      description="Operação da equipe 4Him por cliente"
      planned={[
        "Quadro por status: backlog, a fazer, em andamento, revisão, concluído",
        "Responsável, prazo e cliente vinculado",
        "Comentários por tarefa (task_comments)",
        "Visibilidade opcional para o cliente acompanhar o que está sendo feito",
      ]}
    />
  );
}
