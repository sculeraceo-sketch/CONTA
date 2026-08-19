import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const { toast } = useToast();
  const [checked, setChecked] = useState(false);
  const [suspended, setSuspended] = useState(false);
  const [emailVerified, setEmailVerified] = useState(true);

  useEffect(() => {
    if (!user) { setChecked(true); return; }
    if (role === "admin" || role === "sub_admin") {
      setChecked(true);
      return;
    }
    Promise.all([
      (supabase as any).from("profiles").select("is_suspended,status,email_verified").eq("user_id", user.id).maybeSingle(),
      (supabase as any).from("user_roles").select("role").eq("user_id", user.id),
    ]).then(async ([profileResult, rolesResult]: any[]) => {
      const { data, error } = profileResult;
      const isManager = (rolesResult.data || []).some((role: any) => role.role === "admin" || role.role === "sub_admin");
      if (error) {
        setChecked(true);
        return;
      }
      if (data?.is_suspended || data?.status === "suspended") {
        setSuspended(true);
        toast({ title: "Conta suspensa", description: "Sua conta foi suspensa. Contacte o administrador.", variant: "destructive" });
        await signOut();
      }
      setEmailVerified(isManager || data?.email_verified === true);
      setChecked(true);
    });
  }, [user, role]);

  if (loading || roleLoading || !checked) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!user || suspended) return <Navigate to="/login" replace />;
  if (role === "admin" || role === "sub_admin") return <>{children}</>;
  if (!emailVerified) return <Navigate to="/confirmar-email" replace state={{ email: user.email }} />;
  if (!user.email_confirmed_at) return <Navigate to="/confirmar-email" replace state={{ email: user.email }} />;
  // The custom OTP flag remains the source of truth when Supabase auto-confirm is enabled.
  // The async profile check above prevents normal protected content while it is false.
  return <>{children}</>;
}
