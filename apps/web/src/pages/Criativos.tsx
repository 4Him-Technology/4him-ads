import { Images } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Criativos() {
  return (
    <ModulePage
      icon={Images}
      title="Criativos"
      description="Biblioteca de criativos por cliente"
      planned={[
        "Upload e versionamento de imagens, vídeos e copies (Supabase Storage)",
        "Vínculo do criativo com os anúncios que o utilizam",
        "Fluxo de envio para aprovação do cliente",
        "Ranking de desempenho por criativo",
      ]}
    />
  );
}
