import { UserCog } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Usuarios() {
  return (
    <ModulePage
      icon={UserCog}
      title="Usuários"
      description="Equipe da agência e acessos dos clientes"
      planned={[
        "Papéis na organização: owner, admin, manager, analyst e client",
        "Convite por e-mail via Supabase Auth",
        "Controle de quais clientes cada usuário enxerga",
        "Registro de ações sensíveis em audit_log",
      ]}
    />
  );
}
