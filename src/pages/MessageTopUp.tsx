import DashboardShell from "@/components/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SUPPORT = "244928663898";
type Pack = { id: string; name: string; messages: number; price_kz: number };

export default function MessageTopUp() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [phone, setPhone] = useState("");
  const [accountStatus, setAccountStatus] = useState("trial");
  const [setupRequest, setSetupRequest] = useState<any>(null);
  const [requestingSetup, setRequestingSetup] = useState(false);

  useEffect(() => {
    supabase
      .from("top_up_packages")
      .select("id,name,messages,price_kz")
      .eq("is_active", true)
      .order("position")
      .then(({ data }) => setPacks((data as any) || []));
    if (user)
      supabase
        .from("profiles")
        .select("phone,account_status")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }: any) => {
          setPhone(data?.phone || "");
          setAccountStatus(data?.account_status || "trial");
        });
    if (user)
      supabase
        .from("top_up_requests")
        .select("id,status,amount_kz,created_at,confirmed_at")
        .eq("user_id", user.id)
        .eq("request_type", "setup")
        .in("status", ["pending", "confirmed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setSetupRequest(data));
  }, [user]);

  const requestSetup = async () => {
    setRequestingSetup(true);
    const { data, error } = await (supabase as any).rpc("request_setup_payment");
    setRequestingSetup(false);
    if (error) {
      return toast({ title: "Não foi possível solicitar o setup", description: error.message, variant: "destructive" });
    }
    setSetupRequest(data);
    const text = `Olá Muwoyo! Quero pagar o setup da minha conta por 22.500 Kz.\nEmail: ${user?.email || "-"}\nTelefone: +${phone || "-"}\nPedido: ${data?.id || "-"}`;
    window.open(`https://wa.me/${SUPPORT}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const buy = (p: Pack) => {
    const text = `Olá Muwoyo! Quero comprar o pacote *${p.name}* (${p.messages} mensagens) por ${p.price_kz.toLocaleString("pt-AO")} Kz.\nMeu telefone: +${phone || "-"}\nEmail: ${user?.email || "-"}`;
    window.open(
      `https://wa.me/${SUPPORT}?text=${encodeURIComponent(text)}`,
      "_blank",
    );
  };

  return (
    <DashboardShell
      title="Recarregar mensagens"
      description="Escolha um pacote - finalizamos pelo WhatsApp."
    >
      {accountStatus !== "active" && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-primary" />
              {accountStatus === "awaiting_activation" ? "Pagamento confirmado" : "Ative a sua conta"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {accountStatus === "awaiting_activation" ? (
              <p>Conta aguardando ativação. Estamos a concluir a ativação da sua conta.</p>
            ) : (
              <>
                <p>O setup custa 22.500 Kz. Registre o pedido e finalize o pagamento pelo canal Muwoyo.</p>
                <Button onClick={requestSetup} disabled={requestingSetup || setupRequest?.status === "pending"}>
                  {setupRequest?.status === "pending" ? "Pedido enviado" : requestingSetup ? "A preparar pedido..." : "Pagar setup: 22.500 Kz"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {packs.map((p) => (
          <Card
            key={p.id}
            className="border-border/60 shadow-sm transition hover:shadow-lg"
          >
            <CardHeader>
              <CardTitle className="text-lg">{p.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-3xl font-bold text-primary">
                  {p.messages.toLocaleString("pt-AO")}
                </div>
                <div className="text-sm text-muted-foreground">mensagens</div>
              </div>
              <div className="text-2xl font-bold">
                {p.price_kz.toLocaleString("pt-AO")} Kz
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" /> Sem prazo de
                  validade
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" /> Reativa
                  automação
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-primary" /> Ativação
                  imediata
                </li>
              </ul>
              <Button className="w-full" onClick={() => buy(p)}>
                Comprar agora
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardShell>
  );
}
