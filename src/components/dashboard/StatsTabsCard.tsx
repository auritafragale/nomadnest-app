import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface StatItem {
  label: string;
  value: number;
  to?: string;
  tab?: string;
}

interface StatsTabsCardProps {
  tabs: { id: string; label: string; count: number; items: StatItem[] }[];
  onClickTab?: (tab: string) => void;
}

/**
 * A "Your stats" card with tabs, each tab showing a count and the breakdown
 * items for that group. Used for both Nomad and Pet Parent dashboards.
 */
const StatsTabsCard = ({ tabs }: StatsTabsCardProps) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Your stats</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={tabs[0]?.id}>
          <TabsList className="w-full justify-start flex-nowrap overflow-x-auto overflow-y-hidden">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="whitespace-nowrap gap-1.5">
                {t.label}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {t.count}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id} className="space-y-1 mt-3">
              {t.items.map((item) => (
                <Link
                  key={item.label}
                  to={item.to || "#"}
                  className="flex justify-between items-center rounded-lg px-2 py-2 -mx-2 hover:bg-muted transition-colors"
                >
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                  <Badge variant="secondary">{item.value}</Badge>
                </Link>
              ))}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default StatsTabsCard;
