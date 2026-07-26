import { Route, Routes } from "react-router-dom";
import Layout from "@/components/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "@/pages/Login";
import EsqueciSenha from "@/pages/EsqueciSenha";
import RedefinirSenha from "@/pages/RedefinirSenha";
import Dashboard from "@/pages/Dashboard";
import Campanhas from "@/pages/Campanhas";
import Criativos from "@/pages/Criativos";
import Tarefas from "@/pages/Tarefas";
import Alertas from "@/pages/Alertas";
import Portal from "@/pages/Portal";
import Aprovacoes from "@/pages/Aprovacoes";
import Clientes from "@/pages/Clientes";
import ClienteDetalhe from "@/pages/ClienteDetalhe";
import Cobranca from "@/pages/Cobranca";
import Planos from "@/pages/Planos";
import Conexoes from "@/pages/Conexoes";
import Usuarios from "@/pages/Usuarios";
import Configuracoes from "@/pages/Configuracoes";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />

      {/* Tudo abaixo exige sessão válida */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Acessível à equipe e ao cliente */}
          <Route index element={<Dashboard />} />
          <Route path="portal" element={<Portal />} />
          <Route path="aprovacoes" element={<Aprovacoes />} />
          {/* A tela do cliente é acessível à equipe e a quem tem acesso a ele.
              O RLS garante que o cliente só carregue o próprio. */}
          <Route path="clientes/:id" element={<ClienteDetalhe />} />

          {/* Somente equipe da agência */}
          <Route element={<ProtectedRoute somenteStaff />}>
            <Route path="campanhas" element={<Campanhas />} />
            <Route path="criativos" element={<Criativos />} />
            <Route path="tarefas" element={<Tarefas />} />
            <Route path="alertas" element={<Alertas />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="cobranca" element={<Cobranca />} />
            <Route path="planos" element={<Planos />} />
            <Route path="conexoes" element={<Conexoes />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="configuracoes" element={<Configuracoes />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
