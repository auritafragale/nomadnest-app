import { useRef, useState } from "react";
import Navbar from "@/components/layout/Navbar";
import AdminNav from "@/components/admin/AdminNav";

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
import { logoFilesToDelete } from "@/lib/perkPlacements";
import { PERK_CATEGORIES, TRIP_MOMENTS, isPlaceholderHeadline } from "@/hooks/usePerks";
import { PerkLogoUploader } from "@/components/perks/PerkLogoUploader";

const PLACEMENT_LABEL: Record<string, string> = {
  perks_page: "Perks page",
  sit_confirmed: "Sit confirmed",
  sit_upcoming: "Trip pass",
  sit_now: "During the sit",
  dashboard: "Dashboard",
  menu: "Menu",
};

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
  trip_moment: "road",
  benefit_headline: "",
  benefit_subline: "",
  is_perk_of_month: false,
  spotlight_text: "",
  picked_for_sits: false,
  short_title: "",
};

const AdminPerks = () => {
  const { toast } = useToast();
  const { perks, stats, loading, createPerk, updatePerk, deletePerk, removeLogoFiles } = useAdminPerks();
  // Logo files uploaded while the editor is open (deleted unless saved).
  const uploads = useRef<string[]>([]);

  const [editing, setEditing] = useState<AdminPerk | null>(null);
  const [form, setForm] = useState<PerkInput>(emptyPerk);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);



  const openCreate = () => {
    uploads.current = [];
    setEditing(null);
    setForm(emptyPerk);
    setDialogOpen(true);
  };

  const openEdit = (perk: AdminPerk) => {
    uploads.current = [];
    setEditing(perk);
    const { id: _id, ...rest } = perk;
    setForm(rest);
    setDialogOpen(true);
  };

  // Closed without saving: delete only this session's uploads.
  const closeOrOpen = (open: boolean) => {
    if (!open && !saving) {
      void removeLogoFiles(logoFilesToDelete({ saved: editing?.logo_url ?? null, uploaded: uploads.current, final: editing?.logo_url ?? null }));
      uploads.current = [];
    }
    setDialogOpen(open);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.affiliate_url.trim()) {
      toast({
        title: "Missing details",
        description: "Partner name and affiliate link are required.",
        variant: "destructive",
      });
      return;
    }
    // A currency sign needs an amount: no placeholders like "Get $ OFF".
    if (form.benefit_headline && isPlaceholderHeadline(form.benefit_headline)) {
      toast({
        title: "Add the amount to the headline",
        description: "A headline with “$” or “£” needs a number, for example “$5 off”. Or leave it empty to show “Member discount”.",
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
        benefit_headline: form.benefit_headline?.trim() || null,
        benefit_subline: form.benefit_subline?.trim() || null,
        spotlight_text: form.spotlight_text?.trim() || null,
        short_title: form.short_title?.trim() || null,
      };

      if (editing) await updatePerk(editing.id, payload);
      else await createPerk(payload);
      // Saved: the old logo and any unused uploads go.
      await removeLogoFiles(logoFilesToDelete({ saved: editing?.logo_url ?? null, uploaded: uploads.current, final: payload.logo_url }));
      uploads.current = [];

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
      await removeLogoFiles([perk.logo_url]);
      toast({ title: "Perk deleted" });
    } catch {
      toast({ title: "Could not delete perk", variant: "destructive" });
    }
  };

  const toggle = async (perk: AdminPerk, field: "is_active" | "is_perk_of_month") => {
    try {
      await updatePerk(perk.id, { [field]: !perk[field] } as Partial<PerkInput>);
    } catch {
      toast({ title: "Could not update perk", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-16">
        <AdminNav />

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
                        {perk.is_perk_of_month && <Badge className="text-[10px]">Perk of the month</Badge>}
                        <Badge variant="outline" className="text-[10px]">
                          {TRIP_MOMENTS.find((m) => m.id === perk.trip_moment)?.label ?? "On the road"}
                        </Badge>
                        {perk.picked_for_sits && (
                          <Badge variant="outline" className="text-[10px]">
                            Picked for sits
                          </Badge>
                        )}
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
                    <p className="text-sm font-medium text-[var(--nn-accent-dark)]">
                      {[perk.benefit_headline, perk.benefit_subline].filter(Boolean).join(" ") || "Member discount (no headline yet)"}
                    </p>
                    <p className="text-xs text-muted-foreground break-all">{perk.affiliate_url}</p>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <MousePointerClick className="w-3.5 h-3.5" aria-hidden="true" />
                        {stat?.total_clicks ?? 0} clicks total
                      </span>
                      <span>{stat?.clicks_30d ?? 0} in last 30 days</span>
                      {stat?.by_placement && Object.keys(stat.by_placement).length > 0 && (
                        <span>
                          {Object.entries(stat.by_placement)
                            .sort((a, b) => b[1] - a[1])
                            .map(([k, n]) => `${PLACEMENT_LABEL[k] ?? k} ${n}`)
                            .join(" · ")}
                        </span>
                      )}
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
                          id={`month-${perk.id}`}
                          checked={perk.is_perk_of_month}
                          onCheckedChange={() => toggle(perk, "is_perk_of_month")}
                        />
                        <Label htmlFor={`month-${perk.id}`} className="text-xs">
                          Perk of the month
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

      <Dialog open={dialogOpen} onOpenChange={closeOrOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit perk" : "Add perk"}</DialogTitle>
            <DialogDescription>
              Members see the name, logo, headline, description and code. Non-members see only the
              name, logo and category. The affiliate link stays private and is only used by the redirect.
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
              <Label htmlFor="perk-moment">Trip moment</Label>
              <Select
                value={form.trip_moment}
                onValueChange={(value) => setForm({ ...form, trip_moment: value as PerkInput["trip_moment"] })}
              >
                <SelectTrigger id="perk-moment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIP_MOMENTS.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="perk-short-title">Short title</Label>
              <Input
                id="perk-short-title"
                maxLength={30}
                value={form.short_title ?? ""}
                onChange={(e) => setForm({ ...form, short_title: e.target.value.slice(0, 30) })}
                placeholder="{country} data plan"
                aria-describedby="perk-short-title-hint"
              />
              <p id="perk-short-title-hint" className="text-xs text-muted-foreground">
                Up to 30 characters, e.g. “Travel cover” or “Safe Wi-Fi at the sit”. {"{country}"} and {"{city}"} are filled in from the
                member’s own sit. Empty: the partner name.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="perk-headline">Headline</Label>
                <Input
                  id="perk-headline"
                  maxLength={40}
                  value={form.benefit_headline ?? ""}
                  onChange={(e) => setForm({ ...form, benefit_headline: e.target.value })}
                  placeholder="$5 off"
                  aria-describedby="perk-headline-hint"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="perk-subline">Subline</Label>
                <Input
                  id="perk-subline"
                  maxLength={80}
                  value={form.benefit_subline ?? ""}
                  onChange={(e) => setForm({ ...form, benefit_subline: e.target.value })}
                  placeholder="your first data plan"
                />
              </div>
            </div>
            <p id="perk-headline-hint" className="-mt-2 text-xs text-muted-foreground">
              Empty shows “Member discount”. A “$” or “£” needs an amount.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="perk-benefit">Short benefit (shown in this list only)</Label>
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
              <Label>Logo</Label>
              <PerkLogoUploader
                name={form.name}
                slug={form.slug}
                value={form.logo_url ?? null}
                onChange={(path) => setForm({ ...form, logo_url: path ?? "" })}
                onUploaded={(path) => uploads.current.push(path)}
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
                  id="perk-picked"
                  checked={form.picked_for_sits}
                  onCheckedChange={(v) => setForm({ ...form, picked_for_sits: v })}
                />
                <Label htmlFor="perk-picked" className="text-sm">
                  Picked for your next sit
                </Label>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="perk-month"
                  checked={form.is_perk_of_month}
                  onCheckedChange={(v) => setForm({ ...form, is_perk_of_month: v })}
                />
                <Label htmlFor="perk-month" className="text-sm">
                  Perk of the month
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">Turning this on turns it off for the current Perk of the month.</p>
              <div className="space-y-1.5">
                <Label htmlFor="perk-spotlight">Spotlight text</Label>
                <Input
                  id="perk-spotlight"
                  maxLength={160}
                  value={form.spotlight_text ?? ""}
                  onChange={(e) => setForm({ ...form, spotlight_text: e.target.value })}
                  placeholder="Land with data in 200+ destinations. No SIM swap at the airport."
                />
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
