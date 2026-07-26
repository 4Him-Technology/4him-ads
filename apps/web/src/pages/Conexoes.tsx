import { Plug } from "lucide-react";
import ModulePage from "@/components/ModulePage";

export default function Conexoes() {
  return (
    <ModulePage
      icon={Plug}
      title="Conexões"
      description="Integrações com as plataformas de anúncio"
      planned={[
        "OAuth com Meta (ads_read primeiro, ads_management após App Review)",
        "Google Ads, TikTok Ads e LinkedIn Ads pelo mesmo contrato PlatformConnector",
        "Tokens guardados somente no servidor (Supabase Vault)",
        "Status do último sync e reconexão quando o token expira",
      ]}
    />
  );
}
