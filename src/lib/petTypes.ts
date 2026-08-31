/** Pet type values are stored as snake_case enums; never show them raw. */
const PET_TYPE_LABELS: Record<string, string> = {
  cats: "Cats",
  dogs: "Dogs",
  small_pets: "Small pets",
  farm: "Farm animals",
  exotic: "Exotics",
  birds: "Birds",
  fish: "Fish",
  reptiles: "Reptiles",
};

export const formatPetType = (value: string) =>
  PET_TYPE_LABELS[value?.toLowerCase()] ??
  value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
