import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Gift, Loader2, MousePointerClick, Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAdminPerks, slugify, type AdminPerk, type PerkInput } from "@/hooks/useAdminPerks";
import { PERK_CATEGORIES } from "@/hooks/usePerks";

const emptyPerk: PerkInput = {
  name: "",
  slug: "",
  category: "Travel",
  benefit_short: "",
  description: "",
  affiliate_url: "",
  logo_url: "",
  discount_code: "",
  terms: "",
  expires_at: null,
  is_active: true,
  is_featured: false,
  sort_order: 100,
  subid_param: "",
};

const AdminPerks = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { perks, stats, loading, createPerk, updatePerk, deletePerk } = useAdminPerks();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<AdminPerk | null>(null);
  const [form, setForm] = useState<PerkInput>(emptyPerk);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const admin = data?.is_admin === true;
      setIsAdmin(admin);
      if (!admin) navigate("/dashboard");
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, navigate]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyPerk);
    setDialogOpen(true);
  };

  const openEdit = (perk: AdminPerk) => {
    setEditing(perk);
    const { id: _id, ...rest } = perk;
    setForm(rest);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.benefit_short.trim() || !form.affiliate_url.trim()) {
      toast({
        title: "Missing details",
        description: "Partner name, benefit and affiliate link are required.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload: PerkInput = {
        ...form,
        slug: form.slug?.trim() ? slugify(form.slug) : slugify(form.name),
        description: form.description || null,
        logo_url: form.logo_url || null,
        discount_code: form.discount_code || null,
        terms: form.terms || null,
        subid_param: form.subid_param || null,
        expires_at: form.expires_at || null,
      };

      if (editing) await updatePerk(editing.id, payload);
      else await createPerk(payload);

      toast({ title: editing ? "Perk updated" : "Perk added" });
      setDialogOpen(false);
    } catch (e) {
      toast({
        title: "Could not save perk",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (perk: AdminPerk) => {
    if (!window.confirm(`Delete “${perk.name}”? Click history will be removed too.`)) return;
    try {
      await deletePerk(perk.id);
      toast({ title: "Perk deleted" });
    } catch {
      toast({ title: "Could not delete perk", variant: "destructive" });
    }
  };

  const toggle = async (perk: AdminPerk, field: "is_active" | "is_featured") => {
    try {
      await updatePerk(perk.id, { [field]: !perk[field] } as Partial<PerkInput>);
    } catch {
      toast({ title: "Could not update perk", variant: "destructive" });
    }
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 pt-24 space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-16">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-bold flex items-center gap-2">
              <Gift className="w-6 h-6 text-primary" aria-hidden="true" />
              Member Perks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage affiliate partners and track clicks.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add perk
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : perks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No perks yet. Add your first affiliate partner to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {perks.map((perk) => {
              const stat = stats[perk.id];
              return (
                <Card key={perk.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center gap-3 justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        {perk.name}
                        <Badge variant="outline" className="text-[10px]">
                          {perk.category}
                        </Badge>
                        {!perk.is_active && (
                          <Badge variant="secondary" className="text-[10px]">
                            Hidden
                          </Badge>
                        )}
                        {perk.is_featured && <Badge className="text-[10px]">Featured</Badge>}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(perk)} className="gap-1.5">
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(perk)}
                          aria-label={`Delete ${perk.name}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <p className="text-sm text-primary font-medium">{perk.benefit_short}</p>
                    <p className="text-xs text-muted-foreground break-all">{perk.affiliate_url}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MousePointerClick className="w-3.5 h-3.5" aria-hidden="true" />
                        {stat?.total_clicks ?? 0} clicks total
                      </span>
                      <span>{stat?.clicks_30d ?? 0} in last 30 days</span>
                      {perk.discount_code && <span>Code: {perk.discount_code}</span>}
                      <span>Order: {perk.sort_order}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-6 pt-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`active-${perk.id}`}
                          checked={perk.is_active}
                          onCheckedChange={() => toggle(perk, "is_active")}
                        />
                        <Label htmlFor={`active-${perk.id}`} className="text-xs">
                          Visible to members
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`featured-${perk.id}`}
                          checked={perk.is_featured}
                          onCheckedChange={() => toggle(perk, "is_featured")}
                        />
                        <Label htmlFor={`featured-${perk.id}`} className="text-xs">
                          Featured
                        </Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit perk" : "Add perk"}</DialogTitle>
            <DialogDescription>
              Members see the name, logo, benefit and code. The affiliate link stays private and is
              only used by the redirect.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="perk-name">Partner name *</Label>
              <Input
                id="perk-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="SafetyWing"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perk-benefit">Benefit (one line) *</Label>
              <Input
                id="perk-benefit"
                value={form.benefit_short}
                onChange={(e) => setForm({ ...form, benefit_short: e.target.value })}
                placeholder="15% off nomad travel insurance"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perk-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(value) => setForm({ ...form, category: value })}
              >
                <SelectTrigger id="perk-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERK_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perk-url">Affiliate link *</Label>
              <Input
                id="perk-url"
                value={form.affiliate_url}
                onChange={(e) => setForm({ ...form, affiliate_url: e.target.value })}
                placeholder="https://partner.com/?ref=nomadnest"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perk-description">Description</Label>
              <Textarea
                id="perk-description"
                rows={3}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What members get and why it's useful on the road."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="perk-code">Discount code</Label>
                <Input
                  id="perk-code"
                  value={form.discount_code ?? ""}
                  onChange={(e) => setForm({ ...form, discount_code: e.target.value })}
                  placeholder="NOMADNEST15"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perk-subid">Tracking param</Label>
                <Input
                  id="perk-subid"
                  value={form.subid_param ?? ""}
                  onChange={(e) => setForm({ ...form, subid_param: e.target.value })}
                  placeholder="subid"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perk-logo">Logo URL</Label>
              <Input
                id="perk-logo"
                value={form.logo_url ?? ""}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://…/logo.png"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perk-terms">Terms / small print</Label>
              <Input
                id="perk-terms"
                value={form.terms ?? ""}
                onChange={(e) => setForm({ ...form, terms: e.target.value })}
                placeholder="New customers only. Annual plans."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="perk-expiry">Expires</Label>
                <Input
                  id="perk-expiry"
                  type="date"
                  value={form.expires_at ?? ""}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value || null })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perk-order">Sort order</Label>
                <Input
                  id="perk-order"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 100 })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="perk-active"
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label htmlFor="perk-active" className="text-sm">
                  Visible
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="perk-featured"
                  checked={form.is_featured}
                  onCheckedChange={(v) => setForm({ ...form, is_featured: v })}
                />
                <Label htmlFor="perk-featured" className="text-sm">
                  Featured
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {editing ? "Save changes" : "Add perk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPerks;
