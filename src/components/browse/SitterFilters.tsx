import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Search, SlidersHorizontal, Grid, Map, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SitterFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedPetTypes: string[];
  onPetTypesChange: (types: string[]) => void;
  selectedLanguages: string[];
  onLanguagesChange: (languages: string[]) => void;
  selectedExperienceLevels: string[];
  onExperienceLevelsChange: (levels: string[]) => void;
  viewMode: "grid" | "map";
  onViewModeChange: (mode: "grid" | "map") => void;
}

const petTypeOptions = ["Dog", "Cat", "Bird", "Fish", "Rabbit", "Other"];
const languageOptions = ["English", "Spanish", "French", "German", "Portuguese", "Italian", "Japanese", "Mandarin"];
const experienceLevelOptions = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "experienced", label: "Experienced" },
  { value: "professional", label: "Professional" },
];

const SitterFilters = ({
  searchQuery,
  onSearchChange,
  selectedPetTypes,
  onPetTypesChange,
  selectedLanguages,
  onLanguagesChange,
  selectedExperienceLevels,
  onExperienceLevelsChange,
  viewMode,
  onViewModeChange,
}: SitterFiltersProps) => {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const togglePetType = (type: string) => {
    if (selectedPetTypes.includes(type)) {
      onPetTypesChange(selectedPetTypes.filter((t) => t !== type));
    } else {
      onPetTypesChange([...selectedPetTypes, type]);
    }
  };

  const toggleLanguage = (lang: string) => {
    if (selectedLanguages.includes(lang)) {
      onLanguagesChange(selectedLanguages.filter((l) => l !== lang));
    } else {
      onLanguagesChange([...selectedLanguages, lang]);
    }
  };

  const toggleExperienceLevel = (level: string) => {
    if (selectedExperienceLevels.includes(level)) {
      onExperienceLevelsChange(selectedExperienceLevels.filter((l) => l !== level));
    } else {
      onExperienceLevelsChange([...selectedExperienceLevels, level]);
    }
  };

  const clearFilters = () => {
    onPetTypesChange([]);
    onLanguagesChange([]);
    onExperienceLevelsChange([]);
  };

  const activeFilterCount = selectedPetTypes.length + selectedLanguages.length + selectedExperienceLevels.length;

  return (
    <div className="bg-surface border-b border-border sticky top-16 z-40">
      <div className="container py-4">
        <div className="flex flex-col gap-3">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, location, or languages..."
              className="pl-10 h-12"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-hide">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="flex-shrink-0 relative">
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-2 -right-2 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Filters</h4>
                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-auto p-0 text-muted-foreground"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Pet Types</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {petTypeOptions.map((type) => (
                        <div
                          key={type}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                            selectedPetTypes.includes(type)
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => togglePetType(type)}
                        >
                          <Checkbox
                            checked={selectedPetTypes.includes(type)}
                            onCheckedChange={() => togglePetType(type)}
                          />
                          <span className="text-sm">{type}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Experience Level</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {experienceLevelOptions.map((level) => (
                        <div
                          key={level.value}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                            selectedExperienceLevels.includes(level.value)
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => toggleExperienceLevel(level.value)}
                        >
                          <Checkbox
                            checked={selectedExperienceLevels.includes(level.value)}
                            onCheckedChange={() => toggleExperienceLevel(level.value)}
                          />
                          <span className="text-sm">{level.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Languages</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {languageOptions.map((lang) => (
                        <div
                          key={lang}
                          className={cn(
                            "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                            selectedLanguages.includes(lang)
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => toggleLanguage(lang)}
                        >
                          <Checkbox
                            checked={selectedLanguages.includes(lang)}
                            onCheckedChange={() => toggleLanguage(lang)}
                          />
                          <span className="text-sm">{lang}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center border border-border rounded-lg overflow-hidden flex-shrink-0 ml-auto">
              <button
                onClick={() => onViewModeChange("grid")}
                className={`p-2.5 ${
                  viewMode === "grid" ? "bg-muted" : "bg-surface hover:bg-muted/50"
                }`}
                title="Grid view"
              >
                <Grid className="w-5 h-5" />
              </button>
              <button
                onClick={() => onViewModeChange("map")}
                className={`p-2.5 ${
                  viewMode === "map" ? "bg-muted" : "bg-surface hover:bg-muted/50"
                }`}
                title="Map view"
              >
                <Map className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Active filters display */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {selectedPetTypes.map((type) => (
              <Button
                key={type}
                variant="secondary"
                size="sm"
                className="h-7 gap-1"
                onClick={() => togglePetType(type)}
              >
                {type}
                <X className="w-3 h-3" />
              </Button>
            ))}
            {selectedExperienceLevels.map((level) => {
              const label = experienceLevelOptions.find(l => l.value === level)?.label || level;
              return (
                <Button
                  key={level}
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1"
                  onClick={() => toggleExperienceLevel(level)}
                >
                  {label}
                  <X className="w-3 h-3" />
                </Button>
              );
            })}
            {selectedLanguages.map((lang) => (
              <Button
                key={lang}
                variant="secondary"
                size="sm"
                className="h-7 gap-1"
                onClick={() => toggleLanguage(lang)}
              >
                {lang}
                <X className="w-3 h-3" />
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SitterFilters;
